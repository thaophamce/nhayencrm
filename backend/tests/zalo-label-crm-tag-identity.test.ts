import { beforeEach, describe, expect, it, vi } from 'vitest';

const labelRow = {
  id: 'label-row',
  orgId: 'org-1',
  zaloAccountId: 'acc-1',
  zaloLabelId: 12,
  text: 'VIP',
  textKey: 'vip',
  color: '#1976D2',
  emoji: null,
  offset: 0,
  version: 1,
  conversations: [],
  createTime: null,
  syncedAt: new Date(),
};

const txMock = {
  zaloLabel: {
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
};
const prismaMock = {
  friend: { findMany: vi.fn(), update: vi.fn() },
  zaloAccount: { findUnique: vi.fn() },
  crmTagGroup: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  crmTag: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  tag: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  friendTag: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
};
const apiMock = { getLabels: vi.fn() };

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: prismaMock,
  tenantTransaction: (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
}));
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({
  zaloPool: { getApi: vi.fn(() => apiMock) },
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/zalo/alias-sync.js', () => ({
  syncAliasesForAccount: vi.fn().mockResolvedValue({ updated: 0 }),
}));
vi.mock('../src/modules/activity/activity-logger.js', () => ({ logActivity: vi.fn() }));

const { syncLabelsForAccount } = await import('../src/modules/zalo/zalo-labels-routes.js');

describe('Zalo label to CrmTag identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMock.zaloLabel.findMany.mockImplementation(async ({ where }: any) => [
      { ...labelRow, zaloAccountId: where.zaloAccountId },
    ]);
    prismaMock.friend.findMany.mockResolvedValue([]);
    prismaMock.zaloAccount.findUnique.mockImplementation(async ({ where }: any) => ({
      displayName: where.id,
      phone: null,
    }));
    prismaMock.crmTagGroup.findUnique.mockImplementation(async ({ where }: any) => ({
      id: `group-${where.zaloAccountId_managedBy.zaloAccountId}`,
      name: `Zalo - ${where.zaloAccountId_managedBy.zaloAccountId}`,
    }));
    prismaMock.crmTag.findUnique.mockResolvedValue({ id: 'crm-tag-existing' });
    prismaMock.crmTag.update.mockResolvedValue({ id: 'crm-tag-existing' });
    prismaMock.crmTag.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.tag.findFirst.mockResolvedValue({
      id: 'tag-v2',
      name: 'VIP',
      color: '#1976D2',
      emoji: null,
      archivedAt: null,
    });
    prismaMock.tag.updateMany.mockResolvedValue({ count: 0 });
  });

  it('looks up the same numeric label ID independently inside each account group', async () => {
    const seed = [{ id: 12, text: 'VIP', textKey: 'vip', color: '#1976D2', conversations: [] }];

    await syncLabelsForAccount('acc-1', 'org-1', { seedLabelData: seed, seedVersion: 1 });
    await syncLabelsForAccount('acc-2', 'org-1', { seedLabelData: seed, seedVersion: 1 });

    expect(prismaMock.crmTag.findUnique).toHaveBeenNthCalledWith(1, {
      where: {
        groupId_sourceZaloLabelId: { groupId: 'group-acc-1', sourceZaloLabelId: 12 },
      },
    });
    expect(prismaMock.crmTag.findUnique).toHaveBeenNthCalledWith(2, {
      where: {
        groupId_sourceZaloLabelId: { groupId: 'group-acc-2', sourceZaloLabelId: 12 },
      },
    });
  });
});
