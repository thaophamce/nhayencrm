// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

import fs from 'node:fs/promises';
import path from 'node:path';

export type KbPricingEntry = {
  key: string;
  value: string;
  unit: string;
  effective_from: string;
  effective_to: string | null;
  approved_by: string;
  notes?: string;
};

export type KbFaqEntry = {
  id: string;
  category: string;
  intent: string;
  question: string;
  answer: string;
  keywords: string[];
  priority: 'low' | 'normal' | 'high';
  status: 'active' | 'archived';
};

export type KbSnapshot = {
  version: string;
  capturedAt: string;
  pricing: KbPricingEntry[];
  faq: KbFaqEntry[];
  products: Array<{ id: string; name: string; aliases: string[]; status: 'active' | 'archived' }>;
  handoffRules: Array<{ id: string; intent: string; reason: string; fallbackMessage: string }>;
};

export type KbLookupResult = {
  pricing?: KbPricingEntry;
  faqs: KbFaqEntry[];
  matched: string[];
  version: string;
};

const KACHE = new Map<string, { snapshot: KbSnapshot; signature: string; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export function emptyKbSnapshot(version: string): KbSnapshot {
  return {
    version,
    capturedAt: new Date().toISOString(),
    pricing: [],
    faq: [],
    products: [],
    handoffRules: [],
  };
}

export function validatePricingEntry(entry: KbPricingEntry): { ok: boolean; reason?: string } {
  if (!entry.key) return { ok: false, reason: 'missing_key' };
  if (!entry.value) return { ok: false, reason: 'missing_value' };
  if (!entry.unit) return { ok: false, reason: 'missing_unit' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.effective_from)) return { ok: false, reason: 'bad_effective_from' };
  if (entry.effective_to && !/^\d{4}-\d{2}-\d{2}$/.test(entry.effective_to)) return { ok: false, reason: 'bad_effective_to' };
  if (!entry.approved_by) return { ok: false, reason: 'missing_approver' };
  return { ok: true };
}

export function currentPricingEntry(snapshot: KbSnapshot, key: string, at: Date = new Date()): KbPricingEntry | undefined {
  const stamp = at.toISOString().slice(0, 10);
  return snapshot.pricing.find((entry) =>
    entry.key === key &&
    entry.effective_from <= stamp &&
    (entry.effective_to === null || entry.effective_to >= stamp),
  );
}

export function lookupPricingByIntent(snapshot: KbSnapshot, intent: string): KbPricingEntry[] {
  return snapshot.pricing.filter((entry) => entry.key.includes(intent.toLowerCase()));
}

export function searchFaq(snapshot: KbSnapshot, query: string, limit = 5): KbFaqEntry[] {
  const tokens = query.toLowerCase().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return [];
  const scored: Array<{ entry: KbFaqEntry; score: number }> = [];
  for (const entry of snapshot.faq) {
    if (entry.status !== 'active') continue;
    let score = 0;
    const haystack = (entry.question + ' ' + entry.keywords.join(' ')).toLowerCase();
    for (const token of tokens) if (haystack.includes(token)) score += 1;
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((row) => row.entry);
}

export function lookupKb(snapshot: KbSnapshot, query: string, intent?: string): KbLookupResult {
  const matched: string[] = [];
  const faqs = searchFaq(snapshot, query);
  if (faqs.length > 0) matched.push('faq');
  let pricing: KbPricingEntry | undefined;
  if (intent) {
    pricing = currentPricingEntry(snapshot, intent);
    if (pricing) matched.push('pricing');
  }
  return { pricing, faqs, matched, version: snapshot.version };
}

export async function loadKbSnapshotFromDisk(directory: string): Promise<KbSnapshot> {
  const pricing = await loadJson<KbPricingEntry[]>(path.join(directory, 'pricing.json'), []);
  const faq = await loadJson<KbFaqEntry[]>(path.join(directory, 'faq.json'), []);
  const products = await loadJson<Array<{ id: string; name: string; aliases: string[]; status: 'active' | 'archived' }>>(path.join(directory, 'products.json'), []);
  const handoffRules = await loadJson<Array<{ id: string; intent: string; reason: string; fallbackMessage: string }>>(path.join(directory, 'handoff-rules.json'), []);
  const signature = signatureOf({ pricing, faq, products, handoffRules });
  const cached = KACHE.get(directory);
  if (cached && cached.signature === signature && cached.expiresAt > Date.now()) return cached.snapshot;
  const version = `kb-${signature.slice(0, 8)}-${Date.now().toString(36)}`;
  const snapshot: KbSnapshot = {
    version,
    capturedAt: new Date().toISOString(),
    pricing,
    faq,
    products,
    handoffRules,
  };
  KACHE.set(directory, { snapshot, signature, expiresAt: Date.now() + TTL_MS });
  return snapshot;
}

async function loadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function signatureOf(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function clearKbCache(): void {
  KACHE.clear();
}

export type AutoReplyTier = 'safe_auto' | 'review_optional' | 'human_required';

export type IdempotencyKey = {
  orgId: string;
  conversationId: string;
  inboundMessageId: string;
  policyVersion: string;
};

export function buildIdempotencyKey(input: IdempotencyKey): string {
  const text = JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(16, '0');
}