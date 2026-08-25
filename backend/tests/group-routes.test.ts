/**
 * group-routes.test.ts — Integration tests for group CRUD and membership management.
 * Covers all 11 handlers in group-routes.ts via Fastify inject().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser, mockZaloOps } from './test-helpers.js';

// ── Hoisted mock state ─────────────────────────────────────────────────────────
const zaloOpsMock = mockZaloOps();
const realtimeEmitMock = vi.fn();
const realtimeToMock = vi.fn(() => ({ emit: realtimeEmitMock }));

const prismaMock = {
  zaloAccount: { findFirst: vi.fn() },
  zaloAccountAccess: { findFirst: vi.fn() },
  groupPoll: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  conversation: { updateMany: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: zaloOpsMock,
  ZaloOpError: class extends Error {
    code: string; statusCode: number;
    constructor(msg: string, code: string, statusCode = 400) {
      super(msg); this.code = code; this.statusCode = statusCode;
    }
  },
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('../src/modules/zalo/zalo-route-helpers.js', () => ({
  resolveAccount: vi.fn().mockResolvedValue({ id: 'za-1', orgId: 'org-1' }),
  checkAccess: vi.fn().mockResolvedValue(true),
  handleError: vi.fn().mockImplementation((reply: any, err: any, _op: string) => {
    reply.status(500).send({ error: err?.message ?? 'Error' });
  }),
}));

const { groupRoutes } = await import('../src/modules/zalo/group-routes.js');

const BASE = '/api/v1/zalo-accounts/za-1/groups';

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('io', { to: realtimeToMock });
  app.register(groupRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn({
    conversation: { upsert: vi.fn().mockResolvedValue({ id: 'conv-1' }) },
    groupMember: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
  }));
  prismaMock.conversation.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.conversation.findMany.mockResolvedValue([]);
});

// ── GET all groups ─────────────────────────────────────────────────────────────
describe('GET /api/v1/zalo-accounts/:accountId/groups', () => {
  it('happy path — returns groups list', async () => {
    zaloOpsMock.getAllGroups.mockResolvedValueOnce({
      gridVerMap: { g1: 1 },
      gridInfoMap: { g1: { name: 'Group 1', totalMember: 2 } },
    });
    const res = await buildApp().inject({ method: 'GET', url: BASE });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ groups: [{ id: 'g1', name: 'Group 1', totalMember: 2 }] });
    expect(zaloOpsMock.getAllGroups).toHaveBeenCalledWith('za-1');
  });
});

describe('group leave candidates', () => {
  it('filters by business date, inactivity, and OR status keywords', async () => {
    zaloOpsMock.getAllGroups.mockResolvedValueOnce({
      gridVerMap: { g1: 1, g2: 1 },
      gridInfoMap: {
        g1: { name: 'D010822 đang giao', totalMember: 6 },
        g2: { name: 'D010823 chưa demo', totalMember: 5 },
      },
    });
    prismaMock.conversation.findMany.mockResolvedValueOnce([
      { externalThreadId: 'g1', groupName: 'D010822 đang giao', groupMembersCount: 6, lastMessageAt: new Date('2026-01-01T00:00:00Z') },
      { externalThreadId: 'g2', groupName: 'D010823 chưa demo', groupMembersCount: 5, lastMessageAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/leave-candidates?beforeDate=2026-09-01&inactiveDays=60&statuses=shipping` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.groups.map((g: any) => g.id)).toEqual(['g1']);
    expect(body.summary).toMatchObject({ totalScanned: 2, eligible: 1 });
    expect(body.summary.excludedByReason.keyword_not_matched).toBe(1);
    expect(zaloOpsMock.getAllGroups).toHaveBeenCalledWith('za-1');
    expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ externalThreadId: { in: ['g1', 'g2'] } }),
    }));
  });

  it('excludes stale synced groups that are no longer in the live Zalo roster', async () => {
    zaloOpsMock.getAllGroups.mockResolvedValueOnce({ gridVerMap: { current: 1 } });
    prismaMock.conversation.findMany.mockResolvedValueOnce([
      { externalThreadId: 'current', groupName: 'D010822 đang giao', groupMembersCount: 6, lastMessageAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/leave-candidates?beforeDate=2026-09-01&inactiveDays=60&statuses=shipping` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).groups.map((group: any) => group.id)).toEqual(['current']);
    expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ externalThreadId: { in: ['current'] } }),
    }));
  });

  it('rejects invalid filters', async () => {
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/leave-candidates?beforeDate=bad&inactiveDays=0&statuses=shipping` });
    expect(res.statusCode).toBe(400);
  });

  it('revalidates staged ids directly without relying on the full Zalo catalog', async () => {
    prismaMock.conversation.findMany.mockResolvedValueOnce([
      { externalThreadId: 'g1', groupName: 'D010822 đang giao', groupMembersCount: 6, lastMessageAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/leave-candidates/revalidate`, payload: {
      groupIds: ['g1'], beforeDate: '2026-09-01', inactiveDays: 60,
      statuses: ['shipping'], customKeywords: [], search: '',
    } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).valid).toBe(true);
    expect(zaloOpsMock.getAllGroups).not.toHaveBeenCalled();
    expect(zaloOpsMock.getGroupInfo).not.toHaveBeenCalled();
  });

  it('revalidates all staged ids fail-closed when any id is missing', async () => {
    zaloOpsMock.getAllGroups.mockResolvedValueOnce({ gridVerMap: { g1: 1 }, gridInfoMap: { g1: { name: 'D010822 đang giao', totalMember: 6 } } });
    prismaMock.conversation.findMany.mockResolvedValueOnce([{ externalThreadId: 'g1', lastMessageAt: new Date('2026-01-01T00:00:00Z') }]);
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/leave-candidates/revalidate`, payload: {
      groupIds: ['g1', 'missing'], beforeDate: '2026-09-01', inactiveDays: 60, statuses: ['shipping'], customKeywords: [], search: '',
    } });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).valid).toBe(false);
  });
});

// ── GET group info ─────────────────────────────────────────────────────────────
describe('GET /api/v1/zalo-accounts/:accountId/groups/:groupId', () => {
  it('happy path — returns group info', async () => {
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/g1` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ group: { name: 'Test Group' } });
    expect(zaloOpsMock.getGroupInfo).toHaveBeenCalledWith('za-1', 'g1');
  });
});

// ── POST create group ──────────────────────────────────────────────────────────
describe('POST /api/v1/zalo-accounts/:accountId/groups', () => {
  it('happy path — creates group and returns 201', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: { name: 'New Group', memberIds: ['u1', 'u2'] },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ group: { groupId: 'g1' } });
    expect(zaloOpsMock.createGroup).toHaveBeenCalledWith('za-1', { name: 'New Group', memberIds: ['u1', 'u2'] });
  });

  it('returns 400 when name is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: { memberIds: ['u1'] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'name and memberIds are required' });
  });

  it('returns 400 when memberIds is empty array', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: { name: 'Group', memberIds: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── PATCH rename group ─────────────────────────────────────────────────────────
describe('PATCH /api/v1/zalo-accounts/:accountId/groups/:groupId/name', () => {
  it('happy path — renames group', async () => {
    prismaMock.conversation.findMany.mockResolvedValueOnce([{ id: 'conv-1' }]);
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/g1/name`,
      payload: { name: 'Renamed' },
    });
    expect(res.statusCode).toBe(200);
    // result is undefined → JSON serialises to {} (undefined keys are dropped)
    expect(JSON.parse(res.body)).toEqual({});
    expect(zaloOpsMock.renameGroup).toHaveBeenCalledWith('za-1', 'Renamed', 'g1');
    expect(realtimeToMock).toHaveBeenCalledWith('org:org-1');
    expect(realtimeEmitMock).toHaveBeenCalledWith('chat:group-info-updated', {
      conversationId: 'conv-1',
      groupName: 'Renamed',
    });
  });

  it('returns 400 when name is missing', async () => {
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/g1/name`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'name is required' });
  });
});

// ── PATCH group settings ───────────────────────────────────────────────────────
describe('PATCH /api/v1/zalo-accounts/:accountId/groups/:groupId/settings', () => {
  it('happy path — updates settings', async () => {
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/g1/settings`,
      payload: { allowAddFriends: true },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.updateGroupSettings).toHaveBeenCalledWith('za-1', { allowAddFriends: true }, 'g1');
  });
});

// ── POST add members ───────────────────────────────────────────────────────────
describe('POST /api/v1/zalo-accounts/:accountId/groups/:groupId/members', () => {
  it('happy path — adds members', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/members`,
      payload: { userIds: ['u1', 'u2'] },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.addUserToGroup).toHaveBeenCalledWith('za-1', ['u1', 'u2'], 'g1');
  });

  it('returns 400 when userIds is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/members`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'userIds array is required' });
  });
});

// ── DELETE remove members ──────────────────────────────────────────────────────
describe('DELETE /api/v1/zalo-accounts/:accountId/groups/:groupId/members', () => {
  it('happy path — removes members', async () => {
    const res = await buildApp().inject({
      method: 'DELETE', url: `${BASE}/g1/members`,
      payload: { userIds: ['u1'] },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.removeUserFromGroup).toHaveBeenCalledWith('za-1', ['u1'], 'g1');
  });

  it('returns 400 when userIds is empty', async () => {
    const res = await buildApp().inject({
      method: 'DELETE', url: `${BASE}/g1/members`,
      payload: { userIds: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── POST add deputy ────────────────────────────────────────────────────────────
describe('POST /api/v1/zalo-accounts/:accountId/groups/:groupId/deputies', () => {
  it('happy path — adds deputy', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/deputies`,
      payload: { userId: 'u1' },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.addGroupDeputy).toHaveBeenCalledWith('za-1', 'u1', 'g1');
  });

  it('returns 400 when userId is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/deputies`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'userId is required' });
  });
});

// ── DELETE remove deputy ───────────────────────────────────────────────────────
describe('DELETE /api/v1/zalo-accounts/:accountId/groups/:groupId/deputies/:userId', () => {
  it('happy path — removes deputy', async () => {
    const res = await buildApp().inject({ method: 'DELETE', url: `${BASE}/g1/deputies/u1` });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.removeGroupDeputy).toHaveBeenCalledWith('za-1', 'u1', 'g1');
  });
});

// ── POST transfer ownership ────────────────────────────────────────────────────
describe('POST /api/v1/zalo-accounts/:accountId/groups/:groupId/transfer', () => {
  it('happy path — transfers ownership', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/transfer`,
      payload: { newOwnerId: 'u99' },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.changeGroupOwner).toHaveBeenCalledWith('za-1', 'u99', 'g1');
  });

  it('returns 400 when newOwnerId is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/transfer`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'newOwnerId is required' });
  });
});
