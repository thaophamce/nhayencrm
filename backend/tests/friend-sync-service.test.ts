/**
 * friend-sync-service.test.ts — Unit tests cho syncFriendsForAccount.
 * Coverage: cooldown gate, SDK fetch error, contact create, diff-then-emit,
 * empty patch skip, identity update emit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockZaloOps } from './test-helpers.js';

const zaloOpsMock = mockZaloOps();

const prismaMock = {
  contact: {
    findUnique: vi.fn(),
  },
  friend: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
};

const applyFriendTransitionMock = vi.fn().mockResolvedValue(undefined);
const logActivityMock = vi.fn().mockResolvedValue(undefined);
const resolveOrCreateContactMock = vi.fn();
const safeContactUpdateMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/zalo-operations.js', () => ({ zaloOps: zaloOpsMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/zalo/friend-event-handler.js', () => ({
  applyFriendTransition: applyFriendTransitionMock,
}));
vi.mock('../src/modules/activity/activity-logger.js', () => ({
  logActivity: logActivityMock,
}));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  withTenant: (_orgId: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../src/modules/contacts/resolve-contact.js', () => ({
  resolveOrCreateContact: resolveOrCreateContactMock,
}));
vi.mock('../src/shared/database/safe-contact-write.js', () => ({
  safeContactUpdate: safeContactUpdateMock,
}));

const { syncFriendsForAccount } = await import('../src/modules/zalo/friend-sync-service.js');

function mockIO() {
  const toMock = { emit: vi.fn() };
  return {
    to: vi.fn(() => toMock),
    emit: vi.fn(),
    _toMock: toMock,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.contact.findUnique.mockReset().mockResolvedValue({
    id: 'c1', fullName: 'Existing', gender: null, genderLocked: false,
    birthDate: null, phone: null, phone2: null, phone3: null, phonesExtra: [], metadata: {},
  });
  prismaMock.friend.findMany.mockReset();
  prismaMock.friend.update.mockReset();
  applyFriendTransitionMock.mockReset().mockResolvedValue(undefined);
  resolveOrCreateContactMock.mockReset().mockResolvedValue({ id: 'c1', created: false });
  safeContactUpdateMock.mockReset().mockResolvedValue(undefined);
  logActivityMock.mockReset().mockResolvedValue(undefined);
  zaloOpsMock.getAllFriends.mockReset().mockResolvedValue([]);
  zaloOpsMock.getSentFriendRequests.mockReset().mockResolvedValue([]);
});

describe('syncFriendsForAccount — cooldown gate', () => {
  it('returns skipped=cooldown when manual trigger spammed within 5s', async () => {
    prismaMock.friend.findMany.mockResolvedValue([]);
    // First call → succeed
    const r1 = await syncFriendsForAccount('za-spam', 'org-1', { trigger: 'manual' });
    expect(r1.skipped).toBeNull();
    // Second call immediately → cooldown
    const r2 = await syncFriendsForAccount('za-spam', 'org-1', { trigger: 'manual' });
    expect(r2.skipped).toBe('cooldown');
  });

  it('cron trigger bypasses cooldown', async () => {
    prismaMock.friend.findMany.mockResolvedValue([]);
    await syncFriendsForAccount('za-cron', 'org-1', { trigger: 'manual' });
    const r2 = await syncFriendsForAccount('za-cron', 'org-1', { trigger: 'cron' });
    expect(r2.skipped).toBeNull();
  });

  it('connect trigger bypasses cooldown', async () => {
    prismaMock.friend.findMany.mockResolvedValue([]);
    await syncFriendsForAccount('za-conn', 'org-1', { trigger: 'manual' });
    const r2 = await syncFriendsForAccount('za-conn', 'org-1', { trigger: 'connect' });
    expect(r2.skipped).toBeNull();
  });
});

describe('syncFriendsForAccount — SDK fetch errors', () => {
  it('logs activity error when getAllFriends throws', async () => {
    zaloOpsMock.getAllFriends.mockRejectedValue(new Error('rate_limited'));
    zaloOpsMock.getSentFriendRequests.mockRejectedValue(new Error('rate_limited'));
    prismaMock.friend.findMany.mockResolvedValue([]);
    const r = await syncFriendsForAccount('za-err', 'org-1', { trigger: 'cron' });
    // .catch(() => []) absorbs reject → liveCount 0 but no service-level error
    expect(r.liveCount).toBe(0);
    expect(r.errors).toBe(1);
    expect(logActivityMock).toHaveBeenCalledOnce();
  });

  it('continues accepted-friend sync and suppresses daily friend_read retries', async () => {
    zaloOpsMock.getAllFriends.mockResolvedValue([
      { userId: 'uid-rate', zaloName: 'KH Accepted', avatar: '', globalId: '', username: '' },
    ]);
    zaloOpsMock.getSentFriendRequests.mockRejectedValue({
      code: 'RATE_LIMITED',
      statusCode: 429,
      message: 'Đã đạt giới hạn 500 friend_read/ngày',
    });
    prismaMock.friend.findMany.mockResolvedValue([]);
    prismaMock.friend.update.mockResolvedValue({
      id: 'f-rate', contactId: 'c1', zaloAccountId: 'za-daily-limit',
    });

    const first = await syncFriendsForAccount('za-daily-limit', 'org-1', { trigger: 'cron' });
    const second = await syncFriendsForAccount('za-daily-limit', 'org-1', { trigger: 'cron' });

    expect(first.errors).toBe(0);
    expect(first.upsertedFriends).toBe(1);
    expect(second.errors).toBe(0);
    expect(zaloOpsMock.getSentFriendRequests).toHaveBeenCalledTimes(1);
    expect(logActivityMock).not.toHaveBeenCalled();
  });
});

describe('syncFriendsForAccount — diff-then-emit', () => {
  it('emits friend:updated only when identity field changed', async () => {
    zaloOpsMock.getAllFriends.mockResolvedValue([
      { userId: 'uid-1', zaloName: 'Anh Tuấn MỚI', avatar: 'http://a.png', globalId: 'g1', username: 'tuan' },
    ]);
    prismaMock.friend.findMany.mockResolvedValue([
      {
        id: 'f1',
        contactId: 'c1',
        zaloUidInNick: 'uid-1',
        zaloDisplayName: 'Anh Tuấn',   // CŨ
        zaloAvatarUrl: 'http://a.png',  // không đổi
        zaloGlobalId: 'g1',
        zaloUsername: 'tuan',
      },
    ]);
    resolveOrCreateContactMock.mockResolvedValue({ id: 'c1', created: false });
    prismaMock.friend.update.mockResolvedValue({
      id: 'f1', contactId: 'c1', zaloAccountId: 'za-d',
    });
    const io = mockIO();
    const r = await syncFriendsForAccount('za-d', 'org-1', { trigger: 'cron', io });
    expect(r.emittedCount).toBe(1);
    expect(io.to).toHaveBeenCalledWith('org:org-1');
    expect(io._toMock.emit).toHaveBeenCalledWith(
      'friend:updated',
      expect.objectContaining({
        friendId: 'f1',
        patch: { zaloDisplayName: 'Anh Tuấn MỚI' },  // chỉ field đổi
      }),
    );
  });

  it('SKIP emit when no field changed (typical cron run)', async () => {
    zaloOpsMock.getAllFriends.mockResolvedValue([
      { userId: 'uid-1', zaloName: 'Anh Tuấn', avatar: 'http://a.png', globalId: 'g1', username: 'tuan' },
    ]);
    prismaMock.friend.findMany.mockResolvedValue([
      {
        id: 'f1',
        contactId: 'c1',
        zaloUidInNick: 'uid-1',
        zaloDisplayName: 'Anh Tuấn',
        zaloAvatarUrl: 'http://a.png',
        zaloGlobalId: 'g1',
        zaloUsername: 'tuan',
      },
    ]);
    resolveOrCreateContactMock.mockResolvedValue({ id: 'c1', created: false });
    const io = mockIO();
    const r = await syncFriendsForAccount('za-noop', 'org-1', { trigger: 'cron', io });
    expect(r.emittedCount).toBe(0);
    expect(prismaMock.friend.update).not.toHaveBeenCalled();
    expect(io._toMock.emit).not.toHaveBeenCalled();
  });

  it('SKIP update and emit when only avatar signing query rotates', async () => {
    zaloOpsMock.getAllFriends.mockResolvedValue([
      {
        userId: 'uid-avatar',
        zaloName: 'KH Avatar',
        avatar: 'https://photo.zalo.me/avatar/customer.jpg?key=new-key&time=1786435200',
        globalId: 'g-avatar',
        username: 'avatar-user',
      },
    ]);
    prismaMock.friend.findMany.mockResolvedValue([
      {
        id: 'f-avatar',
        contactId: 'c1',
        zaloUidInNick: 'uid-avatar',
        zaloDisplayName: 'KH Avatar',
        zaloAvatarUrl: 'https://photo.zalo.me/avatar/customer.jpg?key=old-key&time=1786348800',
        zaloGlobalId: 'g-avatar',
        zaloUsername: 'avatar-user',
      },
    ]);
    const io = mockIO();

    const result = await syncFriendsForAccount('za-avatar', 'org-1', { trigger: 'cron', io });

    expect(result.emittedCount).toBe(0);
    expect(prismaMock.friend.update).not.toHaveBeenCalled();
    expect(io._toMock.emit).not.toHaveBeenCalled();
  });
});

describe('syncFriendsForAccount — contact resolution', () => {
  it('reuses existing Contact when zaloUid match', async () => {
    zaloOpsMock.getAllFriends.mockResolvedValue([
      { userId: 'uid-2', zaloName: 'KH Cũ', avatar: '', globalId: '', username: '' },
    ]);
    prismaMock.friend.findMany.mockResolvedValue([]); // no existing friend
    resolveOrCreateContactMock.mockResolvedValue({ id: 'c-existing', created: false });
    prismaMock.contact.findUnique.mockResolvedValue({
      id: 'c-existing', fullName: 'KH Cũ', gender: null, genderLocked: false,
      birthDate: null, phone: null, phone2: null, phone3: null, phonesExtra: [], metadata: {},
    });
    prismaMock.friend.update.mockResolvedValue({
      id: 'f-new', contactId: 'c-existing', zaloAccountId: 'za-x',
    });
    const r = await syncFriendsForAccount('za-x', 'org-1', { trigger: 'cron' });
    expect(resolveOrCreateContactMock).toHaveBeenCalledWith(expect.objectContaining({ zaloUidInNick: 'uid-2' }));
    expect(r.createdContacts).toBe(0);
    expect(applyFriendTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 'c-existing',
        newFriendshipStatus: 'accepted',
      }),
    );
  });

  it('creates stub Contact when zaloUid not found', async () => {
    zaloOpsMock.getAllFriends.mockResolvedValue([
      { userId: 'uid-3', zaloName: 'KH Mới Tạo', avatar: 'avatar.png', globalId: '', username: '' },
    ]);
    prismaMock.friend.findMany.mockResolvedValue([]);
    resolveOrCreateContactMock.mockResolvedValue({ id: 'c-new', created: true });
    prismaMock.contact.findUnique.mockResolvedValue(null);
    prismaMock.friend.update.mockResolvedValue({
      id: 'f-new', contactId: 'c-new', zaloAccountId: 'za-y',
    });
    const r = await syncFriendsForAccount('za-y', 'org-1', { trigger: 'cron' });
    expect(r.createdContacts).toBe(1);
    expect(resolveOrCreateContactMock).toHaveBeenCalledWith(expect.objectContaining({
      zaloUidInNick: 'uid-3',
      fallbackFullName: 'KH Mới Tạo',
      fallbackAvatarUrl: 'avatar.png',
    }));
  });
});

describe('syncFriendsForAccount — pending sent requests', () => {
  it('processes sent requests with pending_sent status', async () => {
    zaloOpsMock.getAllFriends.mockResolvedValue([]);
    zaloOpsMock.getSentFriendRequests.mockResolvedValue([
      { uid: 'uid-p', zaloName: 'KH Pending', avatar: '', globalId: '', username: '' },
    ]);
    prismaMock.friend.findMany.mockResolvedValue([]);
    resolveOrCreateContactMock.mockResolvedValue({ id: 'c-p', created: false });
    prismaMock.friend.update.mockResolvedValue({
      id: 'f-p', contactId: 'c-p', zaloAccountId: 'za-p',
    });
    await syncFriendsForAccount('za-p', 'org-1', { trigger: 'cron' });
    expect(applyFriendTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        newFriendshipStatus: 'pending_sent',
      }),
    );
  });
});
