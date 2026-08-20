import { afterEach, describe, expect, it, vi } from 'vitest';

describe('AI Phase 0 feature flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps every AI feature disabled by default', async () => {
    vi.stubEnv('AI_DRAFT', '');
    vi.stubEnv('AI_SIMULATION', '');
    vi.stubEnv('AI_AUTOREPLY', '');
    vi.stubEnv('AI_EMERGENCY_STOP', '');
    const module = await import('../src/shared/feature-flags.js');
    expect(module.snapshotAiFeatures()).toEqual({
      AI_DRAFT: false,
      AI_SIMULATION: false,
      AI_AUTOREPLY: false,
      AI_EMERGENCY_STOP: false,
    });
  });

  it('emergency flag disables enabled features', async () => {
    vi.stubEnv('AI_DRAFT', 'true');
    vi.stubEnv('AI_EMERGENCY_STOP', 'true');
    const module = await import('../src/shared/feature-flags.js');
    expect(module.isAiFeatureEnabled('AI_DRAFT')).toBe(false);
  });
});

describe('AI Phase 1 cleaning primitives', () => {
  it('redacts phones, emails, and order codes', async () => {
    const { redactText } = await import('../src/scripts/clean-conversation-data.js');
    const result = redactText('Gọi 0913980993 hoặc test@example.com, đơn DH-12345.');
    expect(result.changed).toBe(true);
    expect(result.text).toContain('<PHONE>');
    expect(result.text).toContain('<EMAIL>');
    expect(result.text).toContain('<ORDER_CODE>');
    expect(result.text).not.toContain('0913980993');
  });

  it('keeps only non-empty direct text messages', async () => {
    const { filterTextOnly } = await import('../src/scripts/clean-conversation-data.js');
    const messages = [
      { id: '1', conversationId: 'c1', threadType: 'user' as const, source: 'zalo_live' as const, senderType: 'contact' as const, content: 'Xin chào', contentType: 'text', sentAt: new Date(), isDeleted: false },
      { id: '2', conversationId: 'c1', threadType: 'group' as const, source: 'zalo_live' as const, senderType: 'contact' as const, content: 'Nhóm', contentType: 'text', sentAt: new Date(), isDeleted: false },
      { id: '3', conversationId: 'c1', threadType: 'user' as const, source: 'zalo_live' as const, senderType: 'contact' as const, content: null, contentType: 'text', sentAt: new Date(), isDeleted: false },
      { id: '4', conversationId: 'c1', threadType: 'user' as const, source: 'zalo_live' as const, senderType: 'contact' as const, content: 'ảnh', contentType: 'image', sentAt: new Date(), isDeleted: false },
    ];
    expect(filterTextOnly(messages).map((message) => message.id)).toEqual(['1']);
  });
});
