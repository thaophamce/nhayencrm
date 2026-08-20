// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { snapshotToKb } from './kb-mock.js';
import { DEFAULT_SAFETY_CLASSIFIER, calculateConfidence, type DraftAssessment, type SafetyVerdict } from './confidence.js';
import { GLOBAL_GUARD, tierForIntent, DEFAULT_INTENT_TIER_MAP, type Intent } from './policy.js';
import type { AutoReplyTier } from '../../shared/kb.js';

export type DraftInput = {
  orgId: string;
  conversationId: string;
  inboundMessageId: string;
  customerText: string;
  contextMessageCount: number;
  hasCustomerProfile: boolean;
  intent: Intent;
  intentConfidence: number;
  kbCitations: string[];
  containsPricing: boolean;
  pricingValidated: boolean;
  policyVersion: string;
};

export type DraftOutput = {
  intent: Intent;
  tier: AutoReplyTier;
  confidence: number;
  requiresHuman: boolean;
  reason?: string;
  kbCitations: string[];
  generatedAt: string;
  kbVersion: string;
  policyVersion: string;
  breakdown: DraftAssessment['breakdown'];
  safety: SafetyVerdict;
};

export type DraftPersister = (output: DraftOutput, input: DraftInput) => Promise<void>;

export const nullPersister: DraftPersister = async () => {
  // No-op for simulation mode; production swaps for Prisma writer.
};

export const prismaPersister: DraftPersister = async (output, input) => {
  try {
    await prisma.aiSuggestion.create({
      data: {
        orgId: input.orgId,
        conversationId: input.conversationId,
        messageId: input.inboundMessageId,
        type: 'reply_draft',
        content: JSON.stringify({
          intent: output.intent,
          tier: output.tier,
          confidence: output.confidence,
          requiresHuman: output.requiresHuman,
          reason: output.reason,
          kbCitations: output.kbCitations,
          kbVersion: output.kbVersion,
          policyVersion: output.policyVersion,
          breakdown: output.breakdown,
          safety: output.safety,
        }),
        confidence: output.confidence,
      },
    });
  } catch (error) {
    logger.warn('[ai-draft] persist failed:', error);
  }
};

export function buildDraft(input: DraftInput, options: { classifier?: typeof DEFAULT_SAFETY_CLASSIFIER } = {}): DraftOutput {
  const classifier = options.classifier ?? DEFAULT_SAFETY_CLASSIFIER;
  const safety = classifier.detect(input.customerText, {
    hasCustomerProfile: input.hasCustomerProfile,
    messageCount: input.contextMessageCount,
  });
  const hasRiskyKeywords = safety.flags.includes('risk_keyword');
  const assessment = calculateConfidence({
    intentConfidence: input.intentConfidence,
    kbCitations: input.kbCitations,
    containsPricing: input.containsPricing,
    pricingValidated: input.pricingValidated,
    hasRiskyKeywords,
    contextMessageCount: input.contextMessageCount,
    hasCustomerProfile: input.hasCustomerProfile,
    hasGreeting: input.intent === 'GREETING',
  });
  const tier = tierForIntent(input.intent, DEFAULT_INTENT_TIER_MAP);
  const guard = GLOBAL_GUARD.requiresHuman({
    tier,
    intent: input.intent,
    confidence: assessment.confidence,
    containsPricing: input.containsPricing,
    hasKbCitation: input.kbCitations.length > 0,
  });
  const kb = snapshotToKb();
  return {
    intent: input.intent,
    tier,
    confidence: assessment.confidence,
    requiresHuman: !guard.ok,
    reason: guard.reason,
    kbCitations: input.kbCitations,
    generatedAt: new Date().toISOString(),
    kbVersion: kb.version,
    policyVersion: input.policyVersion,
    breakdown: assessment.breakdown,
    safety,
  };
}