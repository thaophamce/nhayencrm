import { describe, expect, it } from 'vitest';

describe('AI draft confidence + safety', () => {
  it('returns high confidence for safe greeting with KB', async () => {
    const { buildDraft } = await import('../src/modules/ai/draft.js');
    const result = buildDraft({
      orgId: 'org',
      conversationId: 'conv',
      inboundMessageId: 'm1',
      customerText: 'Chào shop',
      contextMessageCount: 5,
      hasCustomerProfile: true,
      intent: 'GREETING',
      intentConfidence: 0.95,
      kbCitations: ['kb.greeting'],
      containsPricing: false,
      pricingValidated: true,
      policyVersion: 'v1',
    });
    expect(result.tier).toBe('safe_auto');
    expect(result.confidence).toBeGreaterThan(0.85);
    expect(result.requiresHuman).toBe(false);
    expect(result.kbCitations).toEqual(['kb.greeting']);
  });

  it('forces human review when pricing lacks citation despite high confidence', async () => {
    const { buildDraft } = await import('../src/modules/ai/draft.js');
    const result = buildDraft({
      orgId: 'org',
      conversationId: 'conv',
      inboundMessageId: 'm1',
      customerText: '300 thiệp giá bao nhiêu',
      contextMessageCount: 5,
      hasCustomerProfile: true,
      intent: 'PRICING',
      intentConfidence: 1.0,
      kbCitations: [],
      containsPricing: true,
      pricingValidated: true,
      policyVersion: 'v1',
    });
    expect(result.requiresHuman).toBe(true);
    expect(result.reason).toBe('pricing_without_citation');
  });

  it('always escalates urgent intent', async () => {
    const { buildDraft } = await import('../src/modules/ai/draft.js');
    const result = buildDraft({
      orgId: 'org',
      conversationId: 'conv',
      inboundMessageId: 'm2',
      customerText: 'Tôi cần gấp trong ngày mai',
      contextMessageCount: 8,
      hasCustomerProfile: true,
      intent: 'URGENT',
      intentConfidence: 0.95,
      kbCitations: ['kb.greeting'],
      containsPricing: false,
      pricingValidated: true,
      policyVersion: 'v1',
    });
    expect(result.tier).toBe('human_required');
    expect(result.requiresHuman).toBe(true);
  });

  it('flags risky keywords regardless of confidence', async () => {
    const { DEFAULT_SAFETY_CLASSIFIER } = await import('../src/modules/ai/confidence.js');
    const verdict = DEFAULT_SAFETY_CLASSIFIER.detect('Cho tôi hoàn tiền đi', { hasCustomerProfile: true, messageCount: 5 });
    expect(verdict.safe).toBe(false);
    expect(verdict.flags).toContain('risk_keyword');
  });
});