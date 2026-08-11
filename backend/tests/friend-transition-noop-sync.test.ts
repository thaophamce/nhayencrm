import { beforeEach, describe, expect, it, vi } from 'vitest';

const txMock = {
  $executeRaw: vi.fn().mockResolvedValue(1),
  friend: { findUnique: vi.fn(), upsert: vi.fn() },
  contact: { update: vi.fn(), updateMany: vi.fn() },
  contactAccess: { upsert: vi.fn() },
  zaloAccount: { findUnique: vi.fn() },
  friendshipAttempt: { updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
};
const conversationUpdateMany = vi.fn();

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: { conversation: { updateMany: conversationUpdateMany } },
  tenantTransaction: (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock),
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({ zaloPool: {} }));
vi.mock('../src/modules/contacts/resolve-contact.js', () => ({ resolveOrCreateContact: vi.fn() }));
vi.mock('../src/shared/ee-registry/automation.js', () => ({
  logEvent: vi.fn(),
  isListeningState: vi.fn(),
}));

const { applyFriendTransition } = await import('../src/modules/zalo/friend-event-handler.js');

describe('applyFriendTransition — no-op full sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMock.friend.findUnique.mockResolvedValue({
      contactId: 'contact-1',
      friendshipStatus: 'accepted',
      relationshipKind: 'friend',
      hasConversation: true,
      becameFriendAt: null,
    });
  });

  it('does not write or run transition side effects when persisted state is stable', async () => {
    await applyFriendTransition({
      orgId: 'org-1',
      zaloAccountId: 'account-1',
      contactId: 'contact-1',
      zaloUidInNick: 'uid-1',
      newFriendshipStatus: 'accepted',
      source: 'sync',
    });

    expect(txMock.friend.upsert).not.toHaveBeenCalled();
    expect(txMock.contact.update).not.toHaveBeenCalled();
    expect(txMock.contact.updateMany).not.toHaveBeenCalled();
    expect(txMock.contactAccess.upsert).not.toHaveBeenCalled();
    expect(conversationUpdateMany).not.toHaveBeenCalled();
  });

  it('still applies a real-time event even when the resulting state matches', async () => {
    await applyFriendTransition({
      orgId: 'org-1',
      zaloAccountId: 'account-1',
      contactId: 'contact-1',
      zaloUidInNick: 'uid-1',
      newFriendshipStatus: 'accepted',
      source: 'event',
    });

    expect(txMock.friend.upsert).toHaveBeenCalledOnce();
    expect(conversationUpdateMany).toHaveBeenCalledOnce();
  });

  it('applies a sync when friendship state changed', async () => {
    txMock.friend.findUnique.mockResolvedValue({
      contactId: 'contact-1',
      friendshipStatus: 'pending_sent',
      relationshipKind: 'pending_friend',
      hasConversation: true,
      becameFriendAt: null,
    });

    await applyFriendTransition({
      orgId: 'org-1',
      zaloAccountId: 'account-1',
      contactId: 'contact-1',
      zaloUidInNick: 'uid-1',
      newFriendshipStatus: 'accepted',
      source: 'sync',
    });

    expect(txMock.friend.upsert).toHaveBeenCalledOnce();
    expect(txMock.contact.update).toHaveBeenCalledOnce();
  });

  it('records each newly received friend request as an immutable event', async () => {
    txMock.friend.findUnique.mockResolvedValue({
      contactId: 'contact-1',
      friendshipStatus: 'none',
      relationshipKind: 'chatting_stranger',
      hasConversation: true,
      becameFriendAt: null,
    });

    await applyFriendTransition({
      orgId: 'org-1',
      zaloAccountId: 'account-1',
      contactId: 'contact-1',
      zaloUidInNick: 'uid-1',
      newFriendshipStatus: 'pending_received',
      source: 'event',
    });

    expect(txMock.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: 'org-1',
        actorType: 'system',
        systemSource: 'zalo_friend_event',
        category: 'interaction',
        action: 'friend_request_received',
        entityType: 'contact',
        entityId: 'contact-1',
        details: { zaloAccountId: 'account-1', zaloUidInNick: 'uid-1' },
      }),
    });
  });

  it('does not double-count a duplicate event while the request is already pending', async () => {
    txMock.friend.findUnique.mockResolvedValue({
      contactId: 'contact-1',
      friendshipStatus: 'pending_received',
      relationshipKind: 'pending_friend',
      hasConversation: true,
      becameFriendAt: null,
    });

    await applyFriendTransition({
      orgId: 'org-1',
      zaloAccountId: 'account-1',
      contactId: 'contact-1',
      zaloUidInNick: 'uid-1',
      newFriendshipStatus: 'pending_received',
      source: 'event',
    });

    expect(txMock.activityLog.create).not.toHaveBeenCalled();
  });

  it('serializes transitions for the same nick and customer before reading state', async () => {
    await applyFriendTransition({
      orgId: 'org-1',
      zaloAccountId: 'account-1',
      contactId: 'contact-1',
      zaloUidInNick: 'uid-1',
      newFriendshipStatus: 'accepted',
      source: 'event',
    });

    expect(txMock.$executeRaw).toHaveBeenCalledOnce();
    expect(txMock.$executeRaw.mock.invocationCallOrder[0])
      .toBeLessThan(txMock.friend.findUnique.mock.invocationCallOrder[0]);
    const lockQuery = txMock.$executeRaw.mock.calls[0][0];
    expect(lockQuery.strings.join(' ')).toContain('pg_advisory_xact_lock(hashtextextended');
    expect(lockQuery.values).toContain('account-1:uid-1');
  });
});
