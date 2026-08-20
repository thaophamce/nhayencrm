import { afterEach, describe, expect, it } from 'vitest';
import { clearKbCache } from '../src/shared/kb.js';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KB_PATH = mkdtempSync(join(tmpdir(), 'kb-'));

afterEach(() => {
  clearKbCache();
  if (existsSync(KB_PATH)) {
    for (const file of ['pricing.json', 'faq.json', 'products.json', 'handoff-rules.json']) {
      const path = join(KB_PATH, file);
      if (existsSync(path)) rmSync(path);
    }
  }
});

describe('KB versioning + lookup', () => {
  it('rejects pricing entries without approver', async () => {
    const { validatePricingEntry, emptyKbSnapshot } = await import('../src/shared/kb.js');
    expect(validatePricingEntry({
      key: 'pricing.standard.150_399',
      value: '3900',
      unit: 'VND_per_card',
      effective_from: '2026-07-01',
      effective_to: null,
      approved_by: '',
    })).toEqual({ ok: false, reason: 'missing_approver' });
    expect(emptyKbSnapshot('v1').version).toBe('v1');
  });

  it('returns the latest effective pricing entry', async () => {
    writeFileSync(join(KB_PATH, 'pricing.json'), JSON.stringify([
      { key: 'pricing.standard.150_399', value: '3500', unit: 'VND_per_card', effective_from: '2026-01-01', effective_to: '2026-06-30', approved_by: 'admin' },
      { key: 'pricing.standard.150_399', value: '3900', unit: 'VND_per_card', effective_from: '2026-07-01', effective_to: null, approved_by: 'admin' },
    ]));
    const { loadKbSnapshotFromDisk, currentPricingEntry } = await import('../src/shared/kb.js');
    const snapshot = await loadKbSnapshotFromDisk(KB_PATH);
    expect(currentPricingEntry(snapshot, 'pricing.standard.150_399', new Date('2026-05-01'))?.value).toBe('3500');
    expect(currentPricingEntry(snapshot, 'pricing.standard.150_399', new Date('2026-08-01'))?.value).toBe('3900');
  });

  it('produces stable idempotency keys', async () => {
    const { buildIdempotencyKey } = await import('../src/shared/kb.js');
    const base = { orgId: 'o1', conversationId: 'c1', inboundMessageId: 'm1', policyVersion: 'v1' };
    expect(buildIdempotencyKey(base)).toBe(buildIdempotencyKey(base));
    expect(buildIdempotencyKey({ ...base, inboundMessageId: 'm2' })).not.toBe(buildIdempotencyKey(base));
  });
});

describe('AI policy gate', () => {
  it('escalates human_required tier always', async () => {
    const { GLOBAL_GUARD } = await import('../src/modules/ai/policy.js');
    expect(GLOBAL_GUARD.requiresHuman({
      tier: 'human_required',
      intent: 'PAYMENT',
      confidence: 1.0,
      containsPricing: true,
      hasKbCitation: true,
    })).toEqual({ ok: false, reason: 'intent_requires_human' });
  });

  it('rejects pricing without citation', async () => {
    const { GLOBAL_GUARD } = await import('../src/modules/ai/policy.js');
    expect(GLOBAL_GUARD.requiresHuman({
      tier: 'safe_auto',
      intent: 'PRICING',
      confidence: 0.95,
      containsPricing: true,
      hasKbCitation: false,
    })).toEqual({ ok: false, reason: 'pricing_without_citation' });
  });

  it('keeps high-confidence safe_auto with citations', async () => {
    const { GLOBAL_GUARD } = await import('../src/modules/ai/policy.js');
    expect(GLOBAL_GUARD.requiresHuman({
      tier: 'safe_auto',
      intent: 'GREETING',
      confidence: 0.95,
      containsPricing: false,
      hasKbCitation: true,
    })).toEqual({ ok: true });
  });
});