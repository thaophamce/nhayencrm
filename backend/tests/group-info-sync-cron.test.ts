import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  zaloAccount: { findMany: vi.fn() },
  conversation: { findMany: vi.fn(), update: vi.fn() },
};
const buildGroupUpdatesMock = vi.fn();
const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({ logger: loggerMock }));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  runSystemQuery: (fn: () => Promise<unknown>) => fn(),
  withTenant: (_orgId: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../src/modules/zalo/group-info-refresh.js', () => ({
  buildGroupUpdates: buildGroupUpdatesMock,
}));
vi.mock('node-cron', () => ({
  default: { schedule: vi.fn().mockReturnValue({ stop: vi.fn() }) },
}));

const { runGroupInfoSyncCycleNow } = await import('../src/modules/zalo/group-info-sync-cron.js');

describe('group info sync quota handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.zaloAccount.findMany.mockResolvedValue([
      { id: 'acc-1', orgId: 'org-1', displayName: 'Nick 1' },
    ]);
    prismaMock.conversation.findMany.mockResolvedValue([
      { id: 'c-1', externalThreadId: 'g-1', groupName: null, groupAvatarUrl: null, groupMembersCount: null },
      { id: 'c-2', externalThreadId: 'g-2', groupName: null, groupAvatarUrl: null, groupMembersCount: null },
      { id: 'c-3', externalThreadId: 'g-3', groupName: null, groupAvatarUrl: null, groupMembersCount: null },
    ]);
  });

  it('stops the account after the first group_read rate-limit response', async () => {
    buildGroupUpdatesMock.mockRejectedValue({ code: 'RATE_LIMITED', statusCode: 429 });

    await runGroupInfoSyncCycleNow();

    expect(buildGroupUpdatesMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.conversation.update).not.toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('quota reached for account acc-1'),
    );
  });
});
