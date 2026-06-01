// ════════════════════════════════════════════════════════════════════════
// Luồng Mục Tiêu M6 — Stats Dashboard Wave A endpoints (2026-06-01)
// ════════════════════════════════════════════════════════════════════════
//
// 2 endpoint Wave A theo Section 23.4 design doc:
//   GET /api/v1/automation/sequences/:id/stats/overview (60s cache)
//   GET /api/v1/automation/sequences/:id/stats/outcomes?range=7d|30d (5min cache)
//
// Filter (Issue #3 3A): default WHERE NOT isSystemTrigger + toggle "include manual"
//
// Cache: in-memory Map với TTL stamp. Production có thể nâng cấp Redis nhưng
// Map đủ cho 50 nick × 25 sale × ít sequence (~10-20 sequence active).
//
// Auth: tất cả endpoint require authMiddleware (memory auth_missing_trap warning).

import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { authMiddleware } from '../../auth/auth-middleware.js';

// ════════════════════════════════════════════════════════════════════════
// In-memory cache với TTL
// ════════════════════════════════════════════════════════════════════════
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ════════════════════════════════════════════════════════════════════════
// Stats helpers
// ════════════════════════════════════════════════════════════════════════
interface OverviewStats {
  sequenceId: string;
  sequenceName: string;
  enrolledTotal: number;
  enrolledCached: number;
  completedTotal: number;
  completedCached: number;
  blockCount: number;
  replyCount: number;
  enroll24h: number;
  enroll7d: number;
  enroll30d: number;
  sentMessagesTotal: number;
  countersLastSyncedAt: Date | null;
  includeSystemTrigger: boolean;
}

async function buildOverview(
  sequenceId: string,
  orgId: string,
  includeSystem: boolean,
): Promise<OverviewStats> {
  const sequence = await prisma.automationSequence.findFirst({
    where: { id: sequenceId, orgId },
    select: {
      id: true,
      name: true,
      enrolledCountCached: true,
      completedCountCached: true,
      blockCountCached: true,
      replyCountCached: true,
      countersLastSyncedAt: true,
    },
  });

  if (!sequence) {
    throw new Error('sequence_not_found');
  }

  // Find triggers linked to this sequence (filter system)
  const triggers = await prisma.automationTrigger.findMany({
    where: {
      orgId,
      OR: [{ sequenceId }, { successorSequenceId: sequenceId }],
      ...(includeSystem ? {} : { isSystemTrigger: false }),
    },
    select: { id: true },
  });
  const triggerIds = triggers.map((t) => t.id);

  if (triggerIds.length === 0) {
    return {
      sequenceId,
      sequenceName: sequence.name,
      enrolledTotal: 0,
      enrolledCached: sequence.enrolledCountCached,
      completedTotal: 0,
      completedCached: sequence.completedCountCached,
      blockCount: sequence.blockCountCached,
      replyCount: sequence.replyCountCached,
      enroll24h: 0,
      enroll7d: 0,
      enroll30d: 0,
      sentMessagesTotal: 0,
      countersLastSyncedAt: sequence.countersLastSyncedAt,
      includeSystemTrigger: includeSystem,
    };
  }

  const now = new Date();
  const ago24h = new Date(now.getTime() - 86400_000);
  const ago7d = new Date(now.getTime() - 7 * 86400_000);
  const ago30d = new Date(now.getTime() - 30 * 86400_000);

  // Count event logs by type cho sequence này
  const [enrolled24h, enrolled7d, enrolled30d, sentMessages, replyCount, blockCount] = await Promise.all([
    prisma.automationEventLog.count({
      where: {
        triggerId: { in: triggerIds },
        eventType: 'sequence_step_enqueued',
        detail: { contains: 'step 0/' },
        createdAt: { gte: ago24h },
      },
    }),
    prisma.automationEventLog.count({
      where: {
        triggerId: { in: triggerIds },
        eventType: 'sequence_step_enqueued',
        detail: { contains: 'step 0/' },
        createdAt: { gte: ago7d },
      },
    }),
    prisma.automationEventLog.count({
      where: {
        triggerId: { in: triggerIds },
        eventType: 'sequence_step_enqueued',
        detail: { contains: 'step 0/' },
        createdAt: { gte: ago30d },
      },
    }),
    prisma.automationEventLog.count({
      where: {
        triggerId: { in: triggerIds },
        eventType: 'sequence_step_sent',
      },
    }),
    prisma.automationEventLog.count({
      where: { triggerId: { in: triggerIds }, eventType: 'customer_reply' },
    }),
    prisma.automationEventLog.count({
      where: { triggerId: { in: triggerIds }, eventType: 'customer_block' },
    }),
  ]);

  return {
    sequenceId,
    sequenceName: sequence.name,
    enrolledTotal: enrolled30d,
    enrolledCached: sequence.enrolledCountCached,
    completedTotal: 0, // M7 funnel sẽ tính
    completedCached: sequence.completedCountCached,
    blockCount,
    replyCount,
    enroll24h: enrolled24h,
    enroll7d: enrolled7d,
    enroll30d: enrolled30d,
    sentMessagesTotal: sentMessages,
    countersLastSyncedAt: sequence.countersLastSyncedAt,
    includeSystemTrigger: includeSystem,
  };
}

interface OutcomeStats {
  sequenceId: string;
  range: '24h' | '7d' | '30d';
  totalEnrolled: number;
  totalSent: number;
  reply: number;
  reactionPositive: number;
  reactionNegative: number;
  block: number;
  friendAccept: number;
  friendReject: number;
  rates: {
    replyRate: number;
    positiveReactionRate: number;
    negativeReactionRate: number;
    blockRate: number;
  };
}

async function buildOutcomes(
  sequenceId: string,
  orgId: string,
  range: '24h' | '7d' | '30d',
  includeSystem: boolean,
): Promise<OutcomeStats> {
  const ms = range === '24h' ? 86400_000 : range === '7d' ? 7 * 86400_000 : 30 * 86400_000;
  const since = new Date(Date.now() - ms);

  const triggers = await prisma.automationTrigger.findMany({
    where: {
      orgId,
      OR: [{ sequenceId }, { successorSequenceId: sequenceId }],
      ...(includeSystem ? {} : { isSystemTrigger: false }),
    },
    select: { id: true },
  });
  const triggerIds = triggers.map((t) => t.id);

  if (triggerIds.length === 0) {
    return {
      sequenceId,
      range,
      totalEnrolled: 0,
      totalSent: 0,
      reply: 0,
      reactionPositive: 0,
      reactionNegative: 0,
      block: 0,
      friendAccept: 0,
      friendReject: 0,
      rates: { replyRate: 0, positiveReactionRate: 0, negativeReactionRate: 0, blockRate: 0 },
    };
  }

  const [enrolled, sent, reply, reactPositive, reactNegative, block, accept, reject] = await Promise.all([
    prisma.automationEventLog.count({
      where: {
        triggerId: { in: triggerIds },
        eventType: 'sequence_step_enqueued',
        detail: { contains: 'step 0/' },
        createdAt: { gte: since },
      },
    }),
    prisma.automationEventLog.count({
      where: { triggerId: { in: triggerIds }, eventType: 'sequence_step_sent', createdAt: { gte: since } },
    }),
    prisma.automationEventLog.count({
      where: { triggerId: { in: triggerIds }, eventType: 'customer_reply', createdAt: { gte: since } },
    }),
    prisma.automationEventLog.count({
      where: { triggerId: { in: triggerIds }, eventType: 'customer_reaction_positive', createdAt: { gte: since } },
    }),
    prisma.automationEventLog.count({
      where: { triggerId: { in: triggerIds }, eventType: 'customer_reaction_negative', createdAt: { gte: since } },
    }),
    prisma.automationEventLog.count({
      where: { triggerId: { in: triggerIds }, eventType: 'customer_block', createdAt: { gte: since } },
    }),
    prisma.automationEventLog.count({
      where: { triggerId: { in: triggerIds }, eventType: 'friend_accepted', createdAt: { gte: since } },
    }),
    prisma.automationEventLog.count({
      where: { triggerId: { in: triggerIds }, eventType: 'friend_rejected', createdAt: { gte: since } },
    }),
  ]);

  const denom = Math.max(enrolled, 1);
  return {
    sequenceId,
    range,
    totalEnrolled: enrolled,
    totalSent: sent,
    reply,
    reactionPositive: reactPositive,
    reactionNegative: reactNegative,
    block,
    friendAccept: accept,
    friendReject: reject,
    rates: {
      replyRate: +((reply / denom) * 100).toFixed(2),
      positiveReactionRate: +((reactPositive / denom) * 100).toFixed(2),
      negativeReactionRate: +((reactNegative / denom) * 100).toFixed(2),
      blockRate: +((block / denom) * 100).toFixed(2),
    },
  };
}

// ════════════════════════════════════════════════════════════════════════
// Route registration
// ════════════════════════════════════════════════════════════════════════
export async function registerSequenceStatsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/automation/sequences/:id/stats/overview
  app.get<{
    Params: { id: string };
    Querystring: { includeSystemTrigger?: string };
  }>(
    '/api/v1/automation/sequences/:id/stats/overview',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const includeSystem = request.query.includeSystemTrigger === 'true';
      const orgId = request.user!.orgId;
      const cacheKey = `overview:${orgId}:${id}:${includeSystem}`;

      const cached = getCached<OverviewStats>(cacheKey);
      if (cached) {
        reply.header('X-Cache', 'HIT');
        return cached;
      }

      try {
        const data = await buildOverview(id, orgId, includeSystem);
        setCached(cacheKey, data, 60_000); // 60s
        reply.header('X-Cache', 'MISS');
        return data;
      } catch (err) {
        if ((err as Error).message === 'sequence_not_found') {
          reply.code(404);
          return { error: 'Sequence không tồn tại' };
        }
        logger.error(`[stats/overview] error: ${(err as Error).message}`);
        reply.code(500);
        return { error: 'Lỗi máy chủ' };
      }
    },
  );

  // GET /api/v1/automation/sequences/:id/stats/outcomes?range=7d|30d
  app.get<{
    Params: { id: string };
    Querystring: { range?: string; includeSystemTrigger?: string };
  }>(
    '/api/v1/automation/sequences/:id/stats/outcomes',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const rangeRaw = request.query.range ?? '7d';
      const range: '24h' | '7d' | '30d' = (['24h', '7d', '30d'] as const).includes(rangeRaw as '24h' | '7d' | '30d')
        ? (rangeRaw as '24h' | '7d' | '30d')
        : '7d';
      const includeSystem = request.query.includeSystemTrigger === 'true';
      const orgId = request.user!.orgId;
      const cacheKey = `outcomes:${orgId}:${id}:${range}:${includeSystem}`;

      const cached = getCached<OutcomeStats>(cacheKey);
      if (cached) {
        reply.header('X-Cache', 'HIT');
        return cached;
      }

      try {
        const data = await buildOutcomes(id, orgId, range, includeSystem);
        setCached(cacheKey, data, 5 * 60_000); // 5min
        reply.header('X-Cache', 'MISS');
        return data;
      } catch (err) {
        logger.error(`[stats/outcomes] error: ${(err as Error).message}`);
        reply.code(500);
        return { error: 'Lỗi máy chủ' };
      }
    },
  );
}
