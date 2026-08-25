// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

export type DraftSignal = {
  intentConfidence: number;
  kbCitations: string[];
  containsPricing: boolean;
  pricingValidated: boolean;
  hasRiskyKeywords: boolean;
  contextMessageCount: number;
  hasCustomerProfile: boolean;
  hasGreeting: boolean;
};

export type ConfidenceBreakdown = {
  base: number;
  intentBoost: number;
  kbBoost: number;
  pricingBoost: number;
  contextBoost: number;
  customerBoost: number;
  riskPenalty: number;
  score: number;
};

export type DraftAssessment = {
  confidence: number;
  breakdown: ConfidenceBreakdown;
  reasons: string[];
};

const BASE = 0.5;
const INTENT_WEIGHT = 0.3;
const KB_WEIGHT = 0.2;
const PRICING_WEIGHT = 0.15;
const CONTEXT_WEIGHT = 0.1;
const CUSTOMER_WEIGHT = 0.05;
const RISK_PENALTY = 0.4;

export function calculateConfidence(signal: DraftSignal): DraftAssessment {
  const reasons: string[] = [];
  const intentBoost = clamp01(signal.intentConfidence) * INTENT_WEIGHT;
  const kbBoost = signal.kbCitations.length > 0 ? KB_WEIGHT : 0;
  const pricingBoost = signal.containsPricing ? (signal.pricingValidated ? PRICING_WEIGHT : -PRICING_WEIGHT) : 0;
  const contextBoost = signal.contextMessageCount >= 3 ? CONTEXT_WEIGHT : 0;
  const customerBoost = signal.hasCustomerProfile ? CUSTOMER_WEIGHT : 0;
  const riskPenalty = signal.hasRiskyKeywords ? RISK_PENALTY : 0;

  const raw = BASE + intentBoost + kbBoost + pricingBoost + contextBoost + customerBoost - riskPenalty;
  const score = clamp01(raw);

  if (signal.kbCitations.length > 0) reasons.push('kb_citation');
  if (signal.containsPricing && signal.pricingValidated) reasons.push('pricing_validated');
  if (signal.containsPricing && !signal.pricingValidated) reasons.push('pricing_unvalidated');
  if (signal.hasRiskyKeywords) reasons.push('risky_keyword');
  if (signal.contextMessageCount < 3) reasons.push('insufficient_context');

  return {
    confidence: round2(score),
    breakdown: {
      base: BASE,
      intentBoost: round2(intentBoost),
      kbBoost: round2(kbBoost),
      pricingBoost: round2(pricingBoost),
      contextBoost: round2(contextBoost),
      customerBoost: round2(customerBoost),
      riskPenalty: round2(riskPenalty),
      score: round2(score),
    },
    reasons,
  };
}

export type SafetyClassifier = {
  detect(text: string, context: { hasCustomerProfile: boolean; messageCount: number; }): SafetyVerdict;
};

export type SafetyVerdict = {
  safe: boolean;
  flags: SafetyFlag[];
  reason?: string;
};

export type SafetyFlag = 'risk_keyword' | 'no_profile' | 'short_context' | 'no_kb';

const RISK_KEYWORDS = [
  /(đặt cọc|cọc|thanh toán|chuyển khoản|hoàn tiền|khiếu nại|phàn nàn|gấp|hỏa tốc|đổi trả|refund)/u,
];

export const DEFAULT_SAFETY_CLASSIFIER: SafetyClassifier = {
  detect(text, context) {
    const flags: SafetyFlag[] = [];
    const normalized = text.toLowerCase();
    if (RISK_KEYWORDS.some((regex) => regex.test(normalized))) flags.push('risk_keyword');
    if (!context.hasCustomerProfile) flags.push('no_profile');
    if (context.messageCount < 3) flags.push('short_context');
    const safe = flags.length === 0;
    return { safe, flags, reason: safe ? undefined : flags.join(',') };
  },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}