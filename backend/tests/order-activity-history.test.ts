import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findActivities, findOrder, transaction, userHasGrant } = vi.hoisted(() => ({
  findActivities: vi.fn(),
  findOrder: vi.fn(),
  transaction: vi.fn(),
  userHasGrant: vi.fn(),
}));

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    order: { findFirst: findOrder },
    orderActivity: { findMany: findActivities },
    $transaction: transaction,
  },
  tenantTransaction: vi.fn(),
}));

vi.mock('../src/modules/rbac/permission-group-service.js', () => ({ userHasGrant }));

import { getRecentOrderActivities, updateOrder } from '../src/modules/orders/orders-controller.js';

function reply() {
  return { status: vi.fn().mockReturnThis(), send: vi.fn((value) => value) } as any;
}

describe('design order activity history', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    userHasGrant.mockResolvedValue(true);
  });

  it('returns one organization-wide feed even for a designer account', async () => {
    findActivities.mockResolvedValue([{ id: 'activity-1' }]);
    const result = await getRecentOrderActivities({
      user: { id: 'designer-1', orgId: 'org-1' },
      query: { limit: '200' },
    } as any, reply()) as any;

    expect(findActivities).toHaveBeenCalledWith(expect.objectContaining({
      where: { order: { orgId: 'org-1' } },
      take: 50,
    }));
    expect(findActivities.mock.calls[0][0].where).not.toHaveProperty('changedById');
    expect(result.activities).toEqual([{ id: 'activity-1' }]);
  });

  it('writes the sample-count audit in the same transaction as the order update', async () => {
    findOrder.mockResolvedValue({
      id: 'order-1', orgId: 'org-1', orderCode: 'D300811', fileCount: 1,
      status: 'demo', timestamps: {}, fileCountHistory: [], hasDesignFee: false,
    });
    const activityCreate = vi.fn();
    const orderUpdate = vi.fn().mockResolvedValue({ id: 'order-1', fileCount: 3 });
    transaction.mockImplementation((callback) => callback({
      orderStatusHistory: { create: vi.fn() },
      orderActivity: { create: activityCreate },
      order: { update: orderUpdate },
    }));

    await updateOrder({
      user: { id: 'admin-1', orgId: 'org-1' },
      params: { id: 'order-1' },
      body: { fileCount: 3 },
    } as any, reply());

    expect(activityCreate).toHaveBeenCalledWith({ data: {
      orderId: 'order-1', type: 'file_count', oldValue: '1', newValue: '3', changedById: 'admin-1',
    } });
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fileCount: 3 }) }));
  });

  it('rejects negative and fractional sample counts without writing', async () => {
    for (const fileCount of [-1, 1.5]) {
      const response = reply();
      await updateOrder({ user: { id: 'admin-1', orgId: 'org-1' }, params: { id: 'order-1' }, body: { fileCount } } as any, response);
      expect(response.status).toHaveBeenCalledWith(400);
    }
    expect(findOrder).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
