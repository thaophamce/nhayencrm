// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

import { isAiFeatureEnabled } from '../../shared/feature-flags.js';
import { getEmergencyStopState, AiEmergencyStopError } from './emergency-stop.js';
import { buildDraft, type DraftInput, type DraftOutput } from './draft.js';
import { CircuitBreaker, OutboxStore, checkAndConsumeAiQuota, type RedisLike, type AiQuota } from './quota.js';
import { TakeoverRegistry } from './simulation.js';

export type Sender = (input: { accountId: string; threadId: string; threadType: 0 | 1; body: string; externalMessageId: string; }) => Promise<{ zaloMsgId: string }>;

export type GatewayDecision = {
  action: 'send' | 'hold_off' | 'reject';
  reason?: string;
  outboxId?: string;
  draft?: DraftOutput;
};

export type GatewayInput = {
  env: GatewayEnv;
  draftInput: DraftInput;
  readiness: GatewayReadiness;
  sender: Sender;
  threadId: string;
  threadType: 0 | 1;
  body: string;
  externalMessageId: string;
};

export type GatewayEnv = {
  orgId: string;
  accountId: string;
  conversationId: string;
  policyVersion: string;
  redis: RedisLike;
  quota: AiQuota;
};

export type GatewayReadiness = {
  isHumanActive: boolean;
  isZkAdminOverride: boolean;
  isFeatureEnabled: boolean;
};

export class AutoReplyGateway {
  private readonly outbox = new OutboxStore();
  private readonly breaker = new CircuitBreaker({ threshold: 5, cooldownMs: 30 * 60 * 1000 });
  private readonly takeover = new TakeoverRegistry();

  idempotencyKey(input: { orgId: string; conversationId: string; inboundMessageId: string; policyVersion: string }): string {
    return `${input.orgId}:${input.conversationId}:${input.inboundMessageId}:${input.policyVersion}`;
  }

  async decide(input: GatewayInput): Promise<GatewayDecision> {
    const draft = buildDraft(input.draftInput);
    if (!isAiFeatureEnabled('AI_AUTOREPLY')) return { action: 'reject', reason: 'feature_disabled', draft };
    if (input.readiness.isHumanActive) return { action: 'hold_off', reason: 'human_active', draft };
    if (draft.requiresHuman) return { action: 'hold_off', reason: draft.reason, draft };
    const stop = await getEmergencyStopState(input.env.orgId);
    if (stop.enabled) return { action: 'reject', reason: 'emergency_stop', draft };
    if (this.breaker.inspect().state === 'open') return { action: 'reject', reason: 'circuit_open', draft };
    const quota = await checkAndConsumeAiQuota(input.env.redis, input.env.quota);
    if (!quota.allowed) return { action: 'hold_off', reason: 'quota_exceeded', draft };
    const key = this.idempotencyKey({
      orgId: input.env.orgId,
      conversationId: input.env.conversationId,
      inboundMessageId: input.draftInput.inboundMessageId,
      policyVersion: input.env.policyVersion,
    });
    if (this.outbox.get(key)) return { action: 'hold_off', reason: 'duplicate_send', draft };
    this.outbox.enqueue({
      id: `out_${Date.now().toString(36)}`,
      idempotencyKey: key,
      conversationId: input.env.conversationId,
      inboundMessageId: input.draftInput.inboundMessageId,
      body: input.body,
    });
    return { action: 'send', reason: 'ready', outboxId: key, draft };
  }

  async send(input: GatewayInput): Promise<{ zaloMsgId: string }> {
    const decision = await this.decide(input);
    if (decision.action !== 'send' || !decision.outboxId) {
      throw new AiEmergencyStopError(decision.reason ?? 'held_off');
    }
    const draft = decision.draft!;
    const key = decision.outboxId;
    this.outbox.markSending(key);
    try {
      const result = await this.breaker.execute(() => input.sender({
        accountId: input.env.accountId,
        threadId: input.threadId,
        threadType: input.threadType,
        body: input.body,
        externalMessageId: input.externalMessageId,
      }));
      this.outbox.markSent(key);
      return result;
    } catch (error) {
      this.outbox.markFailed(key, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  takeoverRegistry(): TakeoverRegistry {
    return this.takeover;
  }

  breakerState(): ReturnType<CircuitBreaker['inspect']> {
    return this.breaker.inspect();
  }

  forceCircuitClose(): void {
    this.breaker.forceClose();
  }

  outboxPending(): ReturnType<OutboxStore['pending']> {
    return this.outbox.pending();
  }
}