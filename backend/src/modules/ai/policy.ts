// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

import type { AutoReplyTier } from '../../shared/kb.js';

export type Intent =
  | 'GREETING'
  | 'LOCATION'
  | 'BUSINESS_HOURS'
  | 'SHIPPING'
  | 'PRODUCTION_TIME'
  | 'PRICING'
  | 'SAMPLE'
  | 'PAYMENT'
  | 'COMPLAINT'
  | 'URGENT'
  | 'OTHER';

export type IntentTierMap = Record<Intent, AutoReplyTier>;

export const DEFAULT_INTENT_TIER_MAP: IntentTierMap = {
  GREETING: 'safe_auto',
  LOCATION: 'safe_auto',
  BUSINESS_HOURS: 'safe_auto',
  SHIPPING: 'safe_auto',
  PRODUCTION_TIME: 'review_optional',
  PRICING: 'review_optional',
  SAMPLE: 'review_optional',
  PAYMENT: 'human_required',
  COMPLAINT: 'human_required',
  URGENT: 'human_required',
  OTHER: 'review_optional',
};

export type PolicyGate = {
  requiresHuman(message: { tier: AutoReplyTier; intent: Intent; confidence: number; containsPricing: boolean; hasKbCitation: boolean; }): { ok: boolean; reason?: string };
};

export const GLOBAL_GUARD: PolicyGate = {
  requiresHuman(message) {
    if (message.tier === 'human_required') return { ok: false, reason: 'intent_requires_human' };
    if (message.tier === 'review_optional' && message.confidence < 0.75) return { ok: false, reason: 'low_confidence_review_optional' };
    if (message.confidence < 0.85) return { ok: false, reason: 'low_confidence' };
    if (message.containsPricing && !message.hasKbCitation) return { ok: false, reason: 'pricing_without_citation' };
    return { ok: true };
  },
};

export type ClassifiedIntent = {
  intent: Intent;
  tier: AutoReplyTier;
  confidence: number;
  containsPricing: boolean;
  hasKbCitation: boolean;
};

export function tierForIntent(intent: Intent, map: IntentTierMap = DEFAULT_INTENT_TIER_MAP): AutoReplyTier {
  return map[intent] ?? 'review_optional';
}