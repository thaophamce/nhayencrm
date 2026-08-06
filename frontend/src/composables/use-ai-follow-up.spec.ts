import { beforeEach, describe, expect, it } from 'vitest';
import {
  isAiFollowUpVisibleInComposer,
  resetAiFollowUpStateForTests,
  useAiFollowUp,
} from './use-ai-follow-up';
import type { AiFollowUpProvider } from '@/services/ai-follow-up-provider';

const provider: AiFollowUpProvider = {
  async generate() {
    return {
      silenceDays: 46,
      timeLabel: '46 ngày',
      needSummary: 'Khách cần thiệp cưới.',
      reason: 'Khách đã lâu chưa phản hồi.',
      content: 'Tin chăm sóc mẫu',
    };
  },
};

const context = {
  conversationId: 'conversation-1',
  contactId: 'contact-1',
  lastInboundAt: '2026-01-01T00:00:00.000Z',
};

describe('useAiFollowUp', () => {
  beforeEach(() => resetAiFollowUpStateForTests());

  it('duyệt đề xuất và làm đề xuất xuất hiện trên composer', async () => {
    const store = useAiFollowUp(provider);
    const item = await store.generate(context);

    expect(store.approve(context.conversationId)).toBe(true);
    expect(item.status).toBe('APPROVED');
    expect(isAiFollowUpVisibleInComposer(item)).toBe(true);
  });

  it('dùng đề xuất trả nội dung để chép và không có hành động gửi', async () => {
    const store = useAiFollowUp(provider);
    const item = await store.generate(context);
    store.approve(context.conversationId);

    expect(store.useSuggestion(context.conversationId)).toBe('Tin chăm sóc mẫu');
    expect(item.status).toBe('USED');
    expect(isAiFollowUpVisibleInComposer(item)).toBe(false);
    expect('send' in store).toBe(false);
  });

  it('tin khách mới làm đề xuất stale và chặn duyệt, sử dụng', async () => {
    const store = useAiFollowUp(provider);
    const item = await store.generate(context);
    const inboundAt = new Date(Date.parse(item.createdAt) + 1_000).toISOString();

    expect(store.markStale(context.conversationId, inboundAt)).toBe(true);
    expect(item.status).toBe('STALE');
    expect(store.approve(context.conversationId)).toBe(false);
    expect(store.useSuggestion(context.conversationId)).toBeNull();
  });

  it('bỏ đề xuất làm đề xuất không còn xuất hiện trên composer', async () => {
    const store = useAiFollowUp(provider);
    const item = await store.generate(context);
    store.approve(context.conversationId);

    expect(store.reject(context.conversationId)).toBe(true);
    expect(item.status).toBe('REJECTED');
    expect(isAiFollowUpVisibleInComposer(item)).toBe(false);
  });
});
