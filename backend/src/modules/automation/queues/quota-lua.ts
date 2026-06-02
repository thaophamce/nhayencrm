// ════════════════════════════════════════════════════════════════════════
// Luồng Mục Tiêu M2b — Lua atomic quota counter (2026-06-01)
// ════════════════════════════════════════════════════════════════════════
//
// v4 Fix #2 + POC spike 4 verified:
//   - Counter INCR atomic per Redis EVAL
//   - EXPIRE chỉ set khi current==0 (lần đầu) → TTL KHÔNG slide
//   - 100 parallel calls với cap=10 → đúng 10 allowed, 90 denied
//
// Workflow (Issue #4 4A — INCR sau send):
//   1. Pre-check: `peekQuotaRemaining(key, cap)` — read-only GET
//   2. Nếu remaining > 0 → send Zalo SDK
//   3. SAU khi send OK → `incrQuota(key, cap)` atomic Lua
//
// Key pattern: `quota:{nickId}:{kind}:{dateVN}` — TTL 24h, auto-cleanup
//   kind: 'friend' | 'message' | 'stranger'
//   dateVN: 'YYYY-MM-DD' Asia/Ho_Chi_Minh

import type { Redis } from 'ioredis';
import { getBullMQRedis } from './redis-connection.js';

// Lua script: check current vs cap, INCR + EXPIRE chỉ khi 0
// Return: 1 = allowed, 0 = denied
const INCR_QUOTA_LUA = `
local key = KEYS[1]
local cap = tonumber(ARGV[1])
local current = tonumber(redis.call('GET', key) or '0')
if current >= cap then
  return 0
end
redis.call('INCR', key)
if current == 0 then
  redis.call('EXPIRE', key, 86400)
end
return 1
`;

export type QuotaKind = 'friend' | 'message' | 'stranger';

/**
 * Build quota key: `quota:{nickId}:{kind}:{YYYY-MM-DD VN}`
 * VN date boundary: 00:00 Asia/Ho_Chi_Minh (UTC+7).
 */
export function buildQuotaKey(nickId: string, kind: QuotaKind, now = new Date()): string {
  // Convert to Asia/Ho_Chi_Minh (UTC+7)
  const vnNow = new Date(now.getTime() + 7 * 3600_000);
  const dateVN = vnNow.toISOString().slice(0, 10); // YYYY-MM-DD
  return `quota:${nickId}:${kind}:${dateVN}`;
}

/**
 * Atomic INCR + cap check via Lua. Issue #4 4A: gọi SAU khi send Zalo OK.
 * @returns true nếu đã INCR thành công (under cap), false nếu over cap (KHÔNG INCR).
 */
export async function incrQuotaAtomic(
  nickId: string,
  kind: QuotaKind,
  cap: number,
  redis: Redis = getBullMQRedis(),
): Promise<boolean> {
  if (cap <= 0) {
    // Cap 0 = disable → allow always (sale chưa configure cap)
    return true;
  }
  const key = buildQuotaKey(nickId, kind);
  const result = await redis.eval(INCR_QUOTA_LUA, 1, key, cap.toString());
  return result === 1;
}

/**
 * Read-only peek — return current count + remaining. KHÔNG INCR.
 * Dùng cho pre-check trước send + Stats Dashboard M10.
 */
export async function peekQuota(
  nickId: string,
  kind: QuotaKind,
  cap: number,
  redis: Redis = getBullMQRedis(),
): Promise<{ used: number; remaining: number; capped: boolean }> {
  const key = buildQuotaKey(nickId, kind);
  const raw = await redis.get(key);
  const used = raw ? parseInt(raw, 10) : 0;
  return {
    used,
    remaining: Math.max(0, cap - used),
    capped: used >= cap,
  };
}

/**
 * Reset quota cho 1 nick + kind. Dùng cho admin manual (Wizard / RBAC),
 * KHÔNG dùng trong worker hot path.
 */
export async function resetQuota(
  nickId: string,
  kind: QuotaKind,
  redis: Redis = getBullMQRedis(),
): Promise<void> {
  const key = buildQuotaKey(nickId, kind);
  await redis.del(key);
}
