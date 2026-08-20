import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AutoReplyGateway } from '../src/modules/ai/gateway.js';
import { emergencyStop } from '../src/modules/ai/emergency-stop.js';
import { prisma } from '../src/shared/database/prisma-client.js';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/test';

const noop = async () => ({ zaloMsgId: 'fake-1' });
const dummyRedis = null;

async function clearEmergency(orgId: string) {
  try {
    await prisma.appSetting.upsert({
      where: { orgId_settingKey: { orgId, settingKey: 'ai_emergency_stop_v1' } },
      create: { orgId, settingKey: 'ai_emergency_stop_v1', valuePlain: JSON.stringify({ enabled: false, reason: null, stoppedAt: null, stoppedBy: null, clearedAt: new Date().toISOString(), clearedBy: 'test' }) },
      update: { valuePlain: JSON.stringify({ enabled: false, reason: null, stoppedAt: null, stoppedBy: null, clearedAt: new Date().toISOString(), clearedBy: 'test' }) },
    });
  } catch {
    // ignore if DB unavailable
  }
}

describe('AutoReplyGateway', () => {
  const orgId = 'gw-org';
  beforeEach(async () => { await clearEmergency(orgId); });
  afterEach(async () => { await clearEmergency(orgId); });

  it('rejects when AI_AUTOREPLY feature disabled', async () => {
    const gateway = new AutoReplyGateway();
    const decision = await gateway.decide({
      env: { orgId, accountId: 'acc-1', conversationId: 'c1', policyVersion: 'v1', redis: dummyRedis, quota: { accountId: 'acc-1', dailyLimit: 20, burstLimit: 5, burstWindowMs: 60_000, cooldownMs: 1000 } },
      draftInput: {
        orgId, conversationId: 'c1', inboundMessageId: 'm1', customerText: 'Chào shop',
        contextMessageCount: 5, hasCustomerProfile: true, intent: 'GREETING', intentConfidence: 0.95,
        kbCitations: ['kb.greeting'], containsPricing: false, pricingValidated: true, policyVersion: 'v1',
      },
      readiness: { isHumanActive: false, isZkAdminOverride: false, isFeatureEnabled: true },
      sender: noop, threadId: 'thread-1', threadType: 0, body: 'Chào', externalMessageId: 'out-1',
    });
    expect(decision.action).toBe('reject');
    expect(decision.reason).toBe('feature_disabled');
  });

  it('holds off when human takeover is active', async () => {
    const gateway = new AutoReplyGateway();
    process.env.AI_AUTOREPLY = 'true';
    const decision = await gateway.decide({
      env: { orgId, accountId: 'acc-1', conversationId: 'c1', policyVersion: 'v1', redis: dummyRedis, quota: { accountId: 'acc-1', dailyLimit: 20, burstLimit: 5, burstWindowMs: 60_000, cooldownMs: 1000 } },
      draftInput: {
        orgId, conversationId: 'c1', inboundMessageId: 'm1', customerText: 'Chào shop',
        contextMessageCount: 5, hasCustomerProfile: true, intent: 'GREETING', intentConfidence: 0.95,
        kbCitations: ['kb.greeting'], containsPricing: false, pricingValidated: true, policyVersion: 'v1',
      },
      readiness: { isHumanActive: true, isZkAdminOverride: false, isFeatureEnabled: true },
      sender: noop, threadId: 'thread-1', threadType: 0, body: 'Chào', externalMessageId: 'out-1',
    });
    expect(decision.action).toBe('hold_off');
    expect(decision.reason).toBe('human_active');
  });

  it('rejects when emergency stop is enabled', async () => {
    process.env.AI_AUTOREPLY = 'true';
    try { await emergencyStop(orgId, 'incident', 'tester'); } catch {}
    const gateway = new AutoReplyGateway();
    const decision = await gateway.decide({
      env: { orgId, accountId: 'acc-1', conversationId: 'c1', policyVersion: 'v1', redis: dummyRedis, quota: { accountId: 'acc-1', dailyLimit: 20, burstLimit: 5, burstWindowMs: 60_000, cooldownMs: 1000 } },
      draftInput: {
        orgId, conversationId: 'c1', inboundMessageId: 'm1', customerText: 'Chào shop',
        contextMessageCount: 5, hasCustomerProfile: true, intent: 'GREETING', intentConfidence: 0.95,
        kbCitations: ['kb.greeting'], containsPricing: false, pricingValidated: true, policyVersion: 'v1',
      },
      readiness: { isHumanActive: false, isZkAdminOverride: false, isFeatureEnabled: true },
      sender: noop, threadId: 'thread-1', threadType: 0, body: 'Chào', externalMessageId: 'out-1',
    });
    expect(decision.action).toBe('reject');
    expect(decision.reason).toBe('emergency_stop');
  });
});