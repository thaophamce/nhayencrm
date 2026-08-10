/**
 * chat-routes.test.ts — Integration tests for conversation message send flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser, mockPrisma, mockIO } from './test-helpers.js';

const prismaMock = mockPrisma();
const sendMessageMock = vi.fn().mockResolvedValue({ msgId: 'zalo-msg-2' });
const zaloPoolMock = {
  getInstance: vi.fn(),
};


const zaloRateLimiterMock = {
  checkLimits: vi.fn(),
  recordSend: vi.fn(),
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('../src/modules/rbac/rbac-middleware.js', () => ({
  requireGrant: () => async () => {},
}));
vi.mock('../src/modules/zalo/zalo-access-middleware.js', () => ({
  requireZaloAccess: () => async () => {},
  checkZaloAccess: vi.fn().mockResolvedValue('ok'),
}));
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({ zaloPool: zaloPoolMock }));
vi.mock('../src/modules/zalo/zalo-rate-limiter.js', () => ({ zaloRateLimiter: zaloRateLimiterMock }));
vi.mock('../src/modules/zalo/zalo-scope.js', () => ({
  DISPLAYABLE_NICK_WHERE: {
    OR: [
      { archivedAt: null },
      { archivedAt: { not: null }, zaloUid: { not: null } },
    ],
  },
  getZaloScope: vi.fn().mockResolvedValue({
    isOrgAdmin: true,
    accessibleIds: [],
    displayableIds: [],
  }),
}));

const { chatRoutes } = await import('../src/modules/chat/chat-routes.js');

const CONV = {
  id: 'conv-1',
  orgId: 'org-1',
  threadType: 'user',
  externalThreadId: 'ext-1',
  zaloAccountId: 'za-1',
  zaloAccount: { id: 'za-1', zaloUid: 'own-1' },
};

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('io', mockIO());
  app.register(chatRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.conversation.findFirst.mockResolvedValue(CONV);
  prismaMock.message.findFirst.mockResolvedValue({
    id: 'reply-1',
    zaloMsgId: 'zalo-reply-1',
    senderUid: 'contact-1',
    content: 'hello',
    contentType: 'text',
    sentAt: new Date('2026-04-17T10:00:00.000Z'),
  });
  prismaMock.message.create.mockResolvedValue({ id: 'msg-2', content: 'thanks' });
  prismaMock.conversation.update.mockResolvedValue({});
  prismaMock.conversation.findMany.mockResolvedValue([]);
  prismaMock.conversation.count.mockResolvedValue(0);
  prismaMock.user.findUnique.mockResolvedValue({ fullName: 'Test User' });
  zaloPoolMock.getInstance.mockReturnValue({
    status: 'connected',
    api: {
      sendMessage: sendMessageMock,
    },
  });
  zaloRateLimiterMock.checkLimits.mockResolvedValue({ allowed: true });
  zaloRateLimiterMock.recordSend.mockReturnValue(undefined);
});

describe('POST /api/v1/conversations/:id/messages', () => {
  it('sends a reply quote when replyMessageId is provided', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/conv-1/messages',
      payload: { content: 'thanks', replyMessageId: 'reply-1' },
    });

    expect(res.statusCode).toBe(200);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'thanks',
        quote: expect.objectContaining({
          msgId: 'zalo-reply-1',
          cliMsgId: 'zalo-reply-1',
          uidFrom: 'contact-1',
          propertyExt: {},
        }),
      }),
      'ext-1',
      0,
    );
    expect(prismaMock.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quote: expect.objectContaining({ msgId: 'zalo-reply-1' }) }),
    }));
  });

  it('returns success when selfListen wins the zaloMsgId insert race', async () => {
    sendMessageMock.mockResolvedValueOnce({ message: { msgId: 'zalo-race-1' } });
    prismaMock.message.create.mockRejectedValueOnce({ code: 'P2002' });
    prismaMock.message.findUnique.mockResolvedValueOnce(null);
    prismaMock.message.findFirst.mockResolvedValueOnce({
      id: 'self-listen-winner',
      conversationId: 'conv-1',
      zaloMsgId: 'zalo-race-1',
      zaloMsgIdNum: BigInt('8096862293226'),
      clientEchoId: null,
      content: 'race text',
      contentType: 'text',
      sentAt: new Date(),
      metadata: { sender: { kind: 'user_native', name: 'Thiệp Cưới' } },
    });
    prismaMock.message.update.mockResolvedValueOnce({
      id: 'self-listen-winner',
      conversationId: 'conv-1',
      zaloMsgId: 'zalo-race-1',
      zaloMsgIdNum: BigInt('8096862293226'),
      clientEchoId: 'echo-race-1',
      content: 'race text',
      contentType: 'text',
      sentAt: new Date(),
      metadata: { sender: { kind: 'user_crm', name: 'Test User' } },
      repliedBy: { id: 'user-1', fullName: 'Test User', email: 'test@example.com' },
    });

    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/conv-1/messages',
      payload: { content: 'race text', echoId: 'echo-race-1' },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(prismaMock.message.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'self-listen-winner' },
      data: expect.objectContaining({
        clientEchoId: 'echo-race-1',
        sentVia: 'user',
      }),
    }));
    expect(prismaMock.conversation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isReplied: true, unreadCount: 0 }),
    }));
  });
});

describe('GET /api/v1/conversations reply-state filter', () => {
  it('composes stored state with caller filters without building an id IN list', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations?messageReplyState=unanswered&threadType=group',
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        threadType: 'group',
        messageReplyState: 'unanswered',
        AND: expect.arrayContaining([{ threadType: 'user' }]),
      }),
    }));
    const query = prismaMock.conversation.findMany.mock.calls[0]?.[0];
    expect(query?.where).not.toHaveProperty('id');
  });
});

describe('GET /api/v1/conversations/picker', () => {
  it('tìm nhóm vừa tạo bằng mã đơn Pancake dù groupName chưa kịp đồng bộ', async () => {
    (prismaMock as any).friend = { findMany: vi.fn().mockResolvedValue([]) };
    prismaMock.conversation.findMany.mockResolvedValue([]);
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/picker?accountId=za-1&search=D300703',
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(prismaMock.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { pancakeOrderLink: { is: { orderCode: { contains: 'D300703', mode: 'insensitive' } } } },
        ]),
      }),
    }));
  });
});
