import { describe, expect, it, vi } from 'vitest';
import {
  extractZaloMessageId,
  clearPendingConfirmationMetadata,
  claimPendingMediaMessage,
  withZaloAttachmentTimeout,
  ZaloAttachmentSendTimeoutError,
} from '../src/modules/chat/chat-send-utils.js';

describe('chat attachment send utilities', () => {
  it('extracts ids from every zca-js response shape used by chat media', () => {
    expect(extractZaloMessageId({ message: { msgId: 'text-1' } })).toBe('text-1');
    expect(extractZaloMessageId({ attachment: [{ msgId: 'image-1' }, { msgId: 'image-2' }] }, 1)).toBe('image-2');
    expect(extractZaloMessageId({ msgId: 123 })).toBe('123');
    expect(extractZaloMessageId({ data: { msgId: 'legacy-1' } })).toBe('legacy-1');
    expect(extractZaloMessageId({ message: { msgId: 'top-level' }, attachment: [{}] })).toBe('');
  });

  it('times out a send promise that never settles', async () => {
    vi.useFakeTimers();
    try {
      const pending = withZaloAttachmentTimeout(new Promise<never>(() => {}), 50);
      const assertion = expect(pending).rejects.toBeInstanceOf(ZaloAttachmentSendTimeoutError);
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the SDK result and clears the timeout on success', async () => {
    await expect(withZaloAttachmentTimeout(Promise.resolve({ ok: true }), 50)).resolves.toEqual({ ok: true });
  });

  it('clears pending confirmation after self-listen reconciles the Zalo id', () => {
    expect(clearPendingConfirmationMetadata({
      sender: { kind: 'user_crm' },
      sendStatus: 'pending_confirmation',
      failReason: 'old',
    })).toEqual({ sender: { kind: 'user_crm' } });
    expect(clearPendingConfirmationMetadata({ sendStatus: 'sending' })).toEqual({});
    expect(clearPendingConfirmationMetadata({ sendStatus: 'failed' })).toBeNull();
  });

  it('claims exactly one pending media row and retries a lost CAS race', async () => {
    const store = {
      findFirst: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'pending-1' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'pending-2' }),
      updateMany: vi.fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({ id: 'pending-2', zaloMsgId: 'zalo-2' }),
    };
    const result = await claimPendingMediaMessage(store, {
      conversationId: 'conv-1',
      contentType: 'image',
      msgId: 'zalo-2',
      msgIdNum: null,
    });
    expect(result).toMatchObject({ id: 'pending-2', zaloMsgId: 'zalo-2' });
    expect(store.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'pending-1', zaloMsgId: null },
    }));
    expect(store.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 'pending-2', zaloMsgId: null },
    }));
  });
});
