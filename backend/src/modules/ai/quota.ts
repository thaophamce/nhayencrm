// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

export type BucketDecision = { allowed: boolean; remaining: number; retryAfterMs: number };
export type RedisClient = {
  eval: (script: string, numKeys: number, ...args: string[]) => Promise<unknown>;
  zremrangebyscore: (key: string, min: string, max: string) => Promise<unknown>;
  zcard: (key: string) => Promise<number>;
  zadd: (key: string, score: string, member: string) => Promise<number>;
  incrby: (key: string, value: number) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode?: string, duration?: number) => Promise<unknown>;
};

export type AiQuota = {
  accountId: string;
  dailyLimit: number;
  burstLimit: number;
  burstWindowMs: number;
  cooldownMs: number;
};

export type RedisLike = RedisClient | null;

const SCRIPT = `
local dailyKey = KEYS[1]
local burstKey = KEYS[2]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local dailyLimit = tonumber(ARGV[3])
local burstLimit = tonumber(ARGV[4])
local cooldownMs = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', burstKey, '-inf', now - windowMs)
local burstCount = redis.call('ZCARD', burstKey)
if burstCount >= burstLimit then
  local oldest = redis.call('ZRANGE', burstKey, 0, 0, 'WITHSCORES')
  local waitMs = 0
  if oldest[2] then
    waitMs = windowMs - (now - tonumber(oldest[2]))
  end
  return { 0, burstCount, waitMs }
end
local today = redis.call('TIME')
local dateKey = today[1]
local daily = tonumber(redis.call('HGET', dailyKey, dateKey) or '0')
if daily >= dailyLimit then
  return { 0, 0, cooldownMs }
end
redis.call('ZADD', burstKey, now, now)
redis.call('PEXPIRE', burstKey, windowMs)
local next = redis.call('HINCRBY', dailyKey, dateKey, 1)
redis.call('EXPIRE', dailyKey, 172800)
return { 1, dailyLimit - next, 0 }
`;

export async function checkAndConsumeAiQuota(redis: RedisLike, quota: AiQuota, now: number = Date.now()): Promise<BucketDecision> {
  if (!redis) return { allowed: false, remaining: 0, retryAfterMs: 0 };
  const dailyKey = `ai_quota:daily:${quota.accountId}`;
  const burstKey = `ai_quota:burst:${quota.accountId}`;
  const result = await redis.eval(SCRIPT, 2, dailyKey, burstKey, String(now), String(quota.burstWindowMs), String(quota.dailyLimit), String(quota.burstLimit), String(quota.cooldownMs)) as number[];
  if (!Array.isArray(result) || result.length < 3) return { allowed: false, remaining: 0, retryAfterMs: 0 };
  const [allowedFlag, remaining, retryAfterMs] = result;
  return {
    allowed: Number(allowedFlag) === 1,
    remaining: Number(remaining),
    retryAfterMs: Number(retryAfterMs),
  };
}

export type CircuitBreakerState = {
  state: 'closed' | 'open' | 'half_open';
  errorCount: number;
  consecutiveFailures: number;
  openedAt: number | null;
  lastError: string | null;
};

export class CircuitBreaker {
  private state: CircuitBreakerState = { state: 'closed', errorCount: 0, consecutiveFailures: 0, openedAt: null, lastError: null };
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(opts: { threshold: number; cooldownMs: number }) {
    this.threshold = Math.max(1, opts.threshold);
    this.cooldownMs = Math.max(1_000, opts.cooldownMs);
  }

  inspect(now: number = Date.now()): CircuitBreakerState {
    if (this.state.state === 'open' && this.state.openedAt && now - this.state.openedAt >= this.cooldownMs) {
      this.state = { ...this.state, state: 'half_open' };
    }
    return { ...this.state };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const inspection = this.inspect();
    if (inspection.state === 'open') throw new Error('circuit_breaker_open');
    try {
      const result = await fn();
      this.state = { state: 'closed', errorCount: 0, consecutiveFailures: 0, openedAt: null, lastError: null };
      return result;
    } catch (error) {
      const nextCount = this.state.consecutiveFailures + 1;
      this.state = {
        state: nextCount >= this.threshold ? 'open' : this.state.state,
        errorCount: this.state.errorCount + 1,
        consecutiveFailures: nextCount,
        openedAt: nextCount >= this.threshold ? Date.now() : this.state.openedAt,
        lastError: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  forceClose(): CircuitBreakerState {
    this.state = { state: 'closed', errorCount: 0, consecutiveFailures: 0, openedAt: null, lastError: null };
    return { ...this.state };
  }
}

export type OutboxEntry = {
  id: string;
  idempotencyKey: string;
  conversationId: string;
  inboundMessageId: string;
  body: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  lastError: string | null;
  scheduledAt: number;
  sentAt: number | null;
};

export class OutboxStore {
  private entries = new Map<string, OutboxEntry>();

  enqueue(input: Omit<OutboxEntry, 'status' | 'attempts' | 'lastError' | 'scheduledAt' | 'sentAt'>): OutboxEntry {
    const now = Date.now();
    const entry: OutboxEntry = {
      ...input,
      status: 'pending',
      attempts: 0,
      lastError: null,
      scheduledAt: now,
      sentAt: null,
    };
    this.entries.set(entry.idempotencyKey, entry);
    return entry;
  }

  get(idempotencyKey: string): OutboxEntry | undefined {
    return this.entries.get(idempotencyKey);
  }

  markSending(idempotencyKey: string): OutboxEntry | null {
    const current = this.entries.get(idempotencyKey);
    if (!current) return null;
    const updated: OutboxEntry = { ...current, status: 'sending', attempts: current.attempts + 1 };
    this.entries.set(idempotencyKey, updated);
    return updated;
  }

  markSent(idempotencyKey: string): OutboxEntry | null {
    const current = this.entries.get(idempotencyKey);
    if (!current) return null;
    const updated: OutboxEntry = { ...current, status: 'sent', sentAt: Date.now() };
    this.entries.set(idempotencyKey, updated);
    return updated;
  }

  markFailed(idempotencyKey: string, error: string): OutboxEntry | null {
    const current = this.entries.get(idempotencyKey);
    if (!current) return null;
    const updated: OutboxEntry = { ...current, status: 'failed', lastError: error };
    this.entries.set(idempotencyKey, updated);
    return updated;
  }

  cancel(idempotencyKey: string): OutboxEntry | null {
    const current = this.entries.get(idempotencyKey);
    if (!current) return null;
    const updated: OutboxEntry = { ...current, status: 'cancelled' };
    this.entries.set(idempotencyKey, updated);
    return updated;
  }

  pending(): OutboxEntry[] {
    return [...this.entries.values()].filter((e) => e.status === 'pending');
  }
}