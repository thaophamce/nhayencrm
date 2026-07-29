import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, userHasGrant } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  userHasGrant: vi.fn(),
}));

vi.mock('../../src/shared/database/prisma-client.js', () => ({
  prisma: {
    user: { findUnique },
  },
}));

vi.mock('../../src/modules/rbac/permission-group-service.js', () => ({
  userHasGrant,
}));

import { canManagePancake } from '../../src/modules/orders/pancake-order-service.js';

describe('release security hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userHasGrant.mockResolvedValue(false);
    findUnique.mockResolvedValue({
      isActive: true,
      permissionGroup: { name: 'Sale' },
    });
  });

  it('does not authorize an active user without an explicit Pancake grant', async () => {
    await expect(
      canManagePancake({ id: 'sale-1', orgId: 'org-1', role: 'member' }),
    ).resolves.toBe(false);
  });

  it('checks the requested write action instead of reusing read access', async () => {
    await canManagePancake(
      { id: 'sale-1', orgId: 'org-1', role: 'member' },
      'edit',
    );

    expect(userHasGrant).toHaveBeenCalledWith('sale-1', 'delivery', 'edit');
    expect(userHasGrant).toHaveBeenCalledWith('sale-1', 'orders', 'edit');
  });
});
