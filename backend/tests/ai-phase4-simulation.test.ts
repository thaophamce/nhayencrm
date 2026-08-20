import { describe, expect, it } from 'vitest';
import { Debouncer, SimulationStore, TakeoverRegistry } from '../src/modules/ai/simulation.js';

describe('Simulation store metrics', () => {
  it('reports acceptance and edit rates', () => {
    const store = new SimulationStore();
    const a = store.record({ orgId: 'o', conversationId: 'c1', inboundMessageId: 'm1', aiIntent: 'GREETING', aiTier: 'safe_auto', aiConfidence: 0.9, aiReply: 'Chào bạn', kbCitations: ['kb.greeting'] });
    const b = store.record({ orgId: 'o', conversationId: 'c2', inboundMessageId: 'm2', aiIntent: 'PRICING', aiTier: 'review_optional', aiConfidence: 0.92, aiReply: 'Giá 3.900đ/bộ', kbCitations: ['pricing.standard'] });
    store.recordOutcome(a.id, { humanAction: 'accepted' });
    store.recordOutcome(b.id, { humanAction: 'edited', humanReply: 'Giá 3.900đ/bộ, giao toàn quốc.' });
    const snap = store.snapshot();
    expect(snap.generated).toBe(2);
    expect(snap.accepted).toBe(1);
    expect(snap.edited).toBe(1);
    expect(snap.acceptanceRate).toBe(1);
    expect(snap.editRate).toBe(0.5);
    expect(snap.hallucinationEstimate).toBe(1);
    expect(snap.byTier.safe_auto).toBe(1);
    expect(snap.byTier.review_optional).toBe(1);
  });
});

describe('Debouncer', () => {
  it('coalesces inbound messages in a window', async () => {
    let fired: string[] = [];
    const debouncer = new Debouncer(async (ids) => { fired = ids; }, 25);
    debouncer.enqueue('c1', 'm1');
    debouncer.enqueue('c1', 'm2');
    debouncer.enqueue('c1', 'm3');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fired).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('Takeover registry', () => {
  it('blocks activity while human is active', () => {
    const registry = new TakeoverRegistry();
    registry.mark({ conversationId: 'c1', reason: 'opened', releasedBy: 'u1', holdMs: 60_000 });
    expect(registry.isHumanActive('c1')).toBe(true);
    registry.clear('c1');
    expect(registry.isHumanActive('c1')).toBe(false);
  });

  it('auto-releases after holdMs', () => {
    const registry = new TakeoverRegistry();
    const now = 1_000_000;
    registry.mark({ conversationId: 'c1', reason: 'sent', releasedBy: null, holdMs: 30 * 60 * 1000, now: now });
    expect(registry.isHumanActive('c1', now)).toBe(true);
    expect(registry.isHumanActive('c1', now + 31 * 60 * 1000)).toBe(false);
  });
});