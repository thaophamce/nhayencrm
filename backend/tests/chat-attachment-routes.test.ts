import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { mockIO, mockPrisma, mockUser } from './test-helpers.js';

const state = vi.hoisted(() => ({
  createMediaMessage: vi.fn(),
  sendMessage: vi.fn(),
  uploadBuffer: vi.fn(),
  shouldTimeout: true,
  beforeTimeout: vi.fn(),
  currentMessage: null as any,
  sendNativeVideo: vi.fn(),
  generateThumbnail: vi.fn(),
}));
const prismaMock = mockPrisma();

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (request: any) => { request.user = mockUser(); },
}));
vi.mock('../src/modules/zalo/zalo-access-middleware.js', () => ({
  requireZaloAccess: () => async () => {},
}));
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({
  zaloPool: { getInstance: () => ({ api: { sendMessage: state.sendMessage } }) },
}));
vi.mock('../src/modules/zalo/zalo-rate-limiter.js', () => ({
  zaloRateLimiter: { checkLimits: vi.fn().mockResolvedValue({ allowed: true }), recordSend: vi.fn() },
}));
vi.mock('../src/shared/storage/minio-client.js', () => ({
  uploadBuffer: state.uploadBuffer,
}));
vi.mock('../src/modules/media/media-service.js', () => ({
  compressImage: vi.fn(async (buffer: Buffer, mimeType: string) => ({ buffer, mimeType })),
}));
vi.mock('../src/shared/video-processor.js', () => ({
  generateThumbnail: state.generateThumbnail,
  sendNativeVideo: state.sendNativeVideo,
}));
vi.mock('../src/shared/zalo-operations.js', () => ({ zaloOps: { sendFile: vi.fn() } }));
vi.mock('../src/modules/chat/chat-helpers.js', () => ({
  getUserFullName: vi.fn().mockResolvedValue('Test User'),
  createMediaMessage: state.createMediaMessage,
}));
vi.mock('../src/modules/chat/chat-send-utils.js', () => {
  class TimeoutError extends Error {}
  return {
    ZaloAttachmentSendTimeoutError: TimeoutError,
    extractZaloMessageId: (result: any, index = 0) => String(result?.attachment?.[index]?.msgId || ''),
    withZaloAttachmentTimeout: vi.fn(async (operation: Promise<unknown>) => {
      if (state.shouldTimeout) {
        void operation;
        await state.beforeTimeout();
        throw new TimeoutError('timeout');
      }
      return operation;
    }),
  };
});

const { chatAttachmentRoutes } = await import('../src/modules/chat/chat-attachment-routes.js');

beforeEach(() => {
  vi.clearAllMocks();
  state.shouldTimeout = true;
  state.beforeTimeout.mockResolvedValue(undefined);
  state.currentMessage = null;
  state.generateThumbnail.mockRejectedValue(new Error('no ffmpeg in route test'));
  state.sendNativeVideo.mockReturnValue(new Promise(() => {}));
  prismaMock.conversation.findFirst.mockResolvedValue({
    id: 'conv-1',
    externalThreadId: 'contact-1',
    threadType: 'user',
    zaloAccountId: 'account-1',
    zaloAccount: {
      zaloUid: 'self-1',
      archivedAt: null,
      privacyMode: 'sub',
      ownerUserId: 'user-1',
    },
  });
  state.uploadBuffer.mockResolvedValue({ url: 'https://files.test/image.jpg', size: 3 });
  state.createMediaMessage.mockResolvedValue({
    id: 'local-media-1',
    conversationId: 'conv-1',
    contentType: 'image',
    content: JSON.stringify({ href: 'https://files.test/image.jpg' }),
    senderType: 'self',
    sentAt: new Date(),
    metadata: { sender: { kind: 'user_crm', name: 'Test User' } },
  });
  state.currentMessage = {
    id: 'local-media-1',
    conversationId: 'conv-1',
    contentType: 'image',
    content: JSON.stringify({ href: 'https://files.test/image.jpg' }),
    senderType: 'self',
    sentAt: new Date(),
    metadata: { sender: { kind: 'user_crm', name: 'Test User' }, sendStatus: 'pending_confirmation' },
  };
  prismaMock.message.update.mockImplementation(async ({ data }: any) => (state.currentMessage = { ...state.currentMessage, ...data }));
  prismaMock.message.updateMany.mockImplementation(async ({ data }: any) => {
    state.currentMessage = { ...state.currentMessage, ...data };
    return { count: 1 };
  });
  prismaMock.message.findUnique.mockImplementation(async () => state.currentMessage);
  prismaMock.conversation.update.mockResolvedValue({});
  state.sendMessage.mockReturnValue(new Promise(() => {}));
});

describe('POST /api/v1/conversations/:id/attachments', () => {
  it('persists media before Zalo send and returns the visible row when confirmation times out', async () => {
    const app = Fastify({ logger: false });
    app.decorate('io', mockIO());
    await app.register(multipart);
    await app.register(chatAttachmentRoutes);

    const body = Buffer.from([
      ...Buffer.from('--test-boundary\r\nContent-Disposition: form-data; name="files"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'),
      1, 2, 3,
      ...Buffer.from('\r\n--test-boundary--\r\n'),
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/conv-1/attachments',
      headers: { 'content-type': 'multipart/form-data; boundary=test-boundary' },
      payload: body,
    });

    expect(response.statusCode, response.body).toBe(202);
    expect(state.createMediaMessage).toHaveBeenCalledBefore(state.sendMessage);
    expect(prismaMock.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'local-media-1', zaloMsgId: null }),
      data: expect.objectContaining({
        metadata: expect.objectContaining({ sendStatus: 'pending_confirmation' }),
      }),
    }));
    expect(JSON.parse(response.body).messages[0].id).toBe('local-media-1');
    await app.close();
  });

  it('updates the persisted row with the attachment msgId after Zalo confirms', async () => {
    state.shouldTimeout = false;
    state.sendMessage.mockResolvedValue({ attachment: [{ msgId: 'zalo-image-1' }] });
    const app = Fastify({ logger: false });
    app.decorate('io', mockIO());
    await app.register(multipart);
    await app.register(chatAttachmentRoutes);

    const body = Buffer.from([
      ...Buffer.from('--test-boundary\r\nContent-Disposition: form-data; name="files"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'),
      1, 2, 3,
      ...Buffer.from('\r\n--test-boundary--\r\n'),
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/conv-1/attachments',
      headers: { 'content-type': 'multipart/form-data; boundary=test-boundary' },
      payload: body,
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(prismaMock.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'local-media-1', zaloMsgId: null }),
      data: expect.objectContaining({ zaloMsgId: 'zalo-image-1' }),
    }));
    await app.close();
  });

  it('does not overwrite a self-listen confirmation that wins before the SDK timeout', async () => {
    prismaMock.message.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.message.findUnique.mockResolvedValue({
      id: 'local-media-1',
      conversationId: 'conv-1',
      contentType: 'image',
      senderType: 'self',
      sentAt: new Date(),
      zaloMsgId: 'self-listen-1',
      metadata: { sender: { kind: 'user_crm', name: 'Test User' } },
    });
    const app = Fastify({ logger: false });
    app.decorate('io', mockIO());
    await app.register(multipart);
    await app.register(chatAttachmentRoutes);
    const body = Buffer.from([
      ...Buffer.from('--test-boundary\r\nContent-Disposition: form-data; name="files"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'),
      1, 2, 3,
      ...Buffer.from('\r\n--test-boundary--\r\n'),
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/conv-1/attachments',
      headers: { 'content-type': 'multipart/form-data; boundary=test-boundary' },
      payload: body,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(JSON.parse(response.body).messages[0].zaloMsgId).toBe('self-listen-1');
    await app.close();
  });

  it('keeps the exact mp4 incident visible when native video confirmation times out', async () => {
    state.createMediaMessage.mockResolvedValue({
      id: 'local-video-1', conversationId: 'conv-1', contentType: 'video',
      content: JSON.stringify({ href: 'https://files.test/video.mp4' }),
      senderType: 'self', sentAt: new Date(), metadata: { sendStatus: 'sending' },
    });
    state.currentMessage = {
      id: 'local-video-1', conversationId: 'conv-1', contentType: 'video',
      content: JSON.stringify({ href: 'https://files.test/video.mp4' }),
      senderType: 'self', sentAt: new Date(), metadata: { sendStatus: 'pending_confirmation' },
    };
    state.uploadBuffer.mockResolvedValue({ url: 'https://files.test/video.mp4', size: 3 });
    const app = Fastify({ logger: false });
    app.decorate('io', mockIO());
    await app.register(multipart);
    await app.register(chatAttachmentRoutes);
    const body = Buffer.from([
      ...Buffer.from('--test-boundary\r\nContent-Disposition: form-data; name="files"; filename="incident.mp4"\r\nContent-Type: video/mp4\r\n\r\n'),
      1, 2, 3,
      ...Buffer.from('\r\n--test-boundary--\r\n'),
    ]);
    const response = await app.inject({
      method: 'POST', url: '/api/v1/conversations/conv-1/attachments',
      headers: { 'content-type': 'multipart/form-data; boundary=test-boundary' }, payload: body,
    });
    expect(response.statusCode, response.body).toBe(202);
    expect(state.createMediaMessage).toHaveBeenCalledBefore(state.sendNativeVideo);
    expect(JSON.parse(response.body).messages[0]).toMatchObject({ id: 'local-video-1', contentType: 'video' });
    await app.close();
  });
});
