import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  zaloAccount: { findMany: vi.fn() },
  conversation: { count: vi.fn() },
  $queryRaw: vi.fn(),
};

const getZaloScopeMock = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/modules/zalo/zalo-scope.js', () => ({ getZaloScope: getZaloScopeMock }));

const { getChatStatistics } = await import('../src/modules/chat/chat-statistics-service.js');

describe('getChatStatistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getZaloScopeMock.mockResolvedValue({ isOrgAdmin: true, displayableIds: [] });
    prismaMock.zaloAccount.findMany.mockResolvedValue([
      { id: 'nick-1', displayName: 'Nick 1', phone: null, avatarUrl: null, status: 'connected' },
    ]);
    prismaMock.conversation.count.mockResolvedValue(4);
  });

  it('counts unique personal senders and friend-request events in the selected period', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ count: 3n }])
      .mockResolvedValueOnce([{ count: 5n }])
      .mockResolvedValueOnce([{ count: 2n }])
      .mockResolvedValueOnce([{ count: 7n }])
      .mockResolvedValueOnce([{ average_seconds: 42.4 }])
      .mockResolvedValueOnce([{ hour: 9, count: 2n }]);

    const result = await getChatStatistics({
      user: { id: 'user-1', orgId: 'org-1', role: 'admin' },
      accountIds: ['nick-1'],
      from: new Date('2026-08-10T00:00:00.000Z'),
      to: new Date('2026-08-11T00:00:00.000Z'),
    });

    expect(result.totals).toEqual({
      sent: 3,
      received: 5,
      total: 8,
      friendRequests: 7,
      unread: 4,
      uniqueInboundCustomers: 2,
      averageResponseSeconds: 42,
    });

    const sql = prismaMock.$queryRaw.mock.calls
      .map(([query]) => query.strings.join(' '))
      .join('\n');
    expect(sql).toContain("c.thread_type = 'user'");
    expect(sql).toContain("al.action = 'friend_request_received'");
  });

  it('returns the additive statistics contract when no selected account is accessible', async () => {
    getZaloScopeMock.mockResolvedValue({ isOrgAdmin: false, displayableIds: [] });
    prismaMock.zaloAccount.findMany.mockResolvedValue([]);

    const result = await getChatStatistics({
      user: { id: 'user-1', orgId: 'org-1', role: 'sale' },
      accountIds: ['missing-nick'],
      from: new Date('2026-08-10T00:00:00.000Z'),
      to: new Date('2026-08-11T00:00:00.000Z'),
    });

    expect(result.totals).toEqual({
      sent: 0,
      received: 0,
      total: 0,
      friendRequests: 0,
      unread: 0,
      uniqueInboundCustomers: 0,
      averageResponseSeconds: 0,
    });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});
