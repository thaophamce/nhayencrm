import { beforeEach, describe, expect, it, vi } from 'vitest';

const { groupBy, queryRaw, findOrganization, transaction, userHasGrant } = vi.hoisted(() => ({
  groupBy: vi.fn(),
  queryRaw: vi.fn(),
  findOrganization: vi.fn(),
  transaction: vi.fn(),
  userHasGrant: vi.fn(),
}));

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    order: { groupBy },
    organization: { findUnique: findOrganization },
  },
  tenantTransaction: transaction,
}));

vi.mock('../src/modules/rbac/permission-group-service.js', () => ({
  userHasGrant,
}));

import {
  getOrderStats,
} from '../src/modules/orders/orders-controller.js';
import {
  getDayOfMonthInOffset,
  getFixedOffsetMinutes,
  getMonthRangeInOffset,
  getMonthValueInOffset,
} from '../src/shared/utils/fixed-offset-time.js';

describe('order overview month statistics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    userHasGrant.mockResolvedValue(false);
    findOrganization.mockResolvedValue({ timezone: '+07:00' });
    transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback({
      order: { groupBy },
      $queryRaw: queryRaw,
    }));
    groupBy.mockResolvedValueOnce([
      { status: 'demo', _count: { _all: 6 } },
      { status: 'designing', _count: { _all: 147 } },
      { status: 'approved', _count: { _all: 290 } },
      { status: 'cancelled', _count: { _all: 25 } },
    ]).mockResolvedValueOnce([
      { status: 'demo', _count: { _all: 4 } },
      { status: 'designing', _count: { _all: 20 } },
      { status: 'approved', _count: { _all: 16 } },
      { status: 'cancelled', _count: { _all: 1 } },
    ]);
    queryRaw.mockResolvedValue([
      { day: 1, count: 1n },
      { day: 2, count: 1n },
    ]);
  });

  it('uses organization calendar boundaries and days', () => {
    expect(getMonthValueInOffset(new Date('2026-07-31T18:00:00.000Z'), '+07:00')).toBe('2026-08');
    expect(getMonthRangeInOffset('2026-08', '+07:00')).toEqual({
      startDate: new Date('2026-07-31T17:00:00.000Z'),
      endDate: new Date('2026-08-31T17:00:00.000Z'),
      daysInMonth: 31,
    });
    expect(getMonthRangeInOffset('2026-12', '+07:00')).toEqual({
      startDate: new Date('2026-11-30T17:00:00.000Z'),
      endDate: new Date('2026-12-31T17:00:00.000Z'),
      daysInMonth: 31,
    });
    expect(getMonthRangeInOffset('2028-02', '+07:00')?.daysInMonth).toBe(29);
    expect(getDayOfMonthInOffset(new Date('2026-08-01T17:30:00.000Z'), '+07:00')).toBe(2);
    expect(getMonthValueInOffset(new Date('2026-08-01T02:00:00.000Z'), '-05:00')).toBe('2026-07');
    expect(getFixedOffsetMinutes('-05:30')).toBe(-330);
    expect(getFixedOffsetMinutes('invalid')).toBe(420);
    expect(getFixedOffsetMinutes('+24:00')).toBe(420);
    expect(getFixedOffsetMinutes('+07:60')).toBe(420);
    expect(getMonthRangeInOffset('1999-12')).toBeNull();
    expect(getMonthRangeInOffset('2101-01')).toBeNull();
  });

  it('applies the selected month to KPI, status chart, and daily chart', async () => {
    const request = {
      user: { id: 'designer-1', orgId: 'org-1' },
      query: { month: '2026-08' },
    } as any;
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as any;

    const result = await getOrderStats(request, reply) as any;
    const expectedWhere = {
      orgId: 'org-1',
      designerId: 'designer-1',
      createdAt: {
        gte: new Date('2026-07-31T17:00:00.000Z'),
        lt: new Date('2026-08-31T17:00:00.000Z'),
      },
    };

    expect(groupBy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { orgId: 'org-1', designerId: 'designer-1' },
    }));
    expect(groupBy).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expectedWhere }));
    expect(queryRaw).toHaveBeenCalledOnce();
    const designerDailySql = queryRaw.mock.calls[0][0];
    expect(designerDailySql.sql).toContain('AND "designer_id" = ?');
    expect(designerDailySql.values).toContain('designer-1');
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(result.total).toBe(468);
    expect(result.byStatus).toEqual({ demo: 6, designing: 147, approved: 290, cancelled: 25 });
    expect(result.monthlyTotal).toBe(41);
    expect(result.monthlyByStatus).toEqual({ demo: 4, designing: 20, approved: 16, cancelled: 1 });
    expect(result.daily[0]).toBe(1);
    expect(result.daily[1]).toBe(1);
  });

  it('defaults to the organization month when the query omits month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T18:00:00.000Z'));
    const request = {
      user: { id: 'designer-1', orgId: 'org-1' },
      query: {},
    } as any;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as any;

    try {
      const result = await getOrderStats(request, reply) as any;
      const monthlyWhere = groupBy.mock.calls[1][0].where;

      expect(result.month).toBe('2026-08');
      expect(monthlyWhere.createdAt).toEqual({
        gte: new Date('2026-07-31T17:00:00.000Z'),
        lt: new Date('2026-08-31T17:00:00.000Z'),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps manager statistics organization-wide while preserving zero statuses', async () => {
    userHasGrant.mockResolvedValue(true);
    groupBy.mockReset()
      .mockResolvedValueOnce([{ status: 'demo', _count: { _all: 9 } }])
      .mockResolvedValueOnce([{ status: 'demo', _count: { _all: 1 } }]);
    queryRaw.mockResolvedValue([]);
    const request = {
      user: { id: 'manager-1', orgId: 'org-1' },
      query: { month: '2026-08' },
    } as any;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as any;

    const result = await getOrderStats(request, reply) as any;
    const statsWhere = groupBy.mock.calls[1][0].where;

    expect(statsWhere).toEqual({
      orgId: 'org-1',
      createdAt: {
        gte: new Date('2026-07-31T17:00:00.000Z'),
        lt: new Date('2026-08-31T17:00:00.000Z'),
      },
    });
    expect(statsWhere).not.toHaveProperty('designerId');
    const managerDailySql = queryRaw.mock.calls[0][0];
    expect(managerDailySql.sql).not.toContain('"designer_id"');
    expect(managerDailySql.values).not.toContain('manager-1');
    expect(result.total).toBe(9);
    expect(result.byStatus).toEqual({ demo: 9, designing: 0, approved: 0, cancelled: 0 });
    expect(result.monthlyTotal).toBe(1);
    expect(result.monthlyByStatus).toEqual({ demo: 1, designing: 0, approved: 0, cancelled: 0 });
    expect(result.daily).toHaveLength(31);
    expect(result.daily.every((count: number) => count === 0)).toBe(true);
  });

  it('rejects an invalid month value before querying the database', async () => {
    const request = {
      user: { id: 'designer-1', orgId: 'org-1' },
      query: { month: '2026-13' },
    } as any;
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnValue({ handled: true }),
    } as any;

    const result = await getOrderStats(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(findOrganization).not.toHaveBeenCalled();
    expect(groupBy).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
    expect(result).toEqual({ handled: true });
  });

  it('returns the standard server error when the statistics query fails', async () => {
    groupBy.mockReset()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce([]);
    const request = {
      user: { id: 'designer-1', orgId: 'org-1' },
      query: { month: '2026-08' },
    } as any;
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnValue({ handled: true }),
    } as any;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await getOrderStats(request, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Không thể tải thống kê đơn hàng' });
    expect(result).toEqual({ handled: true });
    consoleError.mockRestore();
  });
});
