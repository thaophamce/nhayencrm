// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
// ════════════════════════════════════════════════════════════════════════
// Friend blast ("Gửi tin nhắn bạn bè", 🟢 Community) — self-contained BullMQ
// queue + worker wiring.
// ════════════════════════════════════════════════════════════════════════
//
// Same pattern as modules/broadcast/broadcast-queue.ts — Community features
// stay self-contained, KHÔNG dùng _ee/automation/queues/queue-registry.ts
// hay getBullMQRedis() singleton (không có _ee bundle trong repo này).
//
// Redis connection: dựng TẠI CHỖ từ process.env.REDIS_URL, lazy-init (import
// file không mở kết nối). Worker dùng connection RIÊNG (duplicate()) — BullMQ
// worker chạy blocking command, chia sẻ với Queue producer là anti-pattern.

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../../shared/utils/logger.js';

export const FRIEND_BLAST_FIRE_QUEUE = 'friend-blast-fire';

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 10_000 },
};

export interface FriendBlastFireJobData {
  campaignId: string;
  orgId: string;
  tickIdx: number;
}

export function buildFriendBlastTickJobId(campaignId: string, tickIdx: number): string {
  return `fb-${campaignId}-tick-${tickIdx}`;
}

// ── Community Redis connection (BullMQ-tuned) ─────────────────────────────────
let connection: Redis | null = null;
function getConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    connection = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
    });
    connection.on('error', (err: Error) => {
      logger.error(`[friend-blast-queue] redis error: ${err.message}`);
    });
    logger.info('[friend-blast-queue] redis connection created');
  }
  return connection;
}

// ── Queue singleton ───────────────────────────────────────────────────────────
let queueInstance: Queue<FriendBlastFireJobData> | null = null;
function getQueue(): Queue<FriendBlastFireJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<FriendBlastFireJobData>(FRIEND_BLAST_FIRE_QUEUE, {
      connection: getConnection() as ConnectionOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queueInstance.on('error', (err) => {
      logger.error(`[friend-blast-queue] queue error: ${err.message}`);
    });
    logger.info('[friend-blast-queue] queue initialized');
  }
  return queueInstance;
}

export function getFriendBlastFireQueue(): Queue<FriendBlastFireJobData> {
  return getQueue();
}

/** Enqueue tick job. jobId deterministic → re-enqueue same tick không tạo job trùng. */
export async function enqueueFriendBlastTick(
  campaignId: string,
  orgId: string,
  tickIdx: number,
  delayMs = 0,
): Promise<void> {
  const queue = getQueue();
  await queue.add(
    'tick',
    { campaignId, orgId, tickIdx },
    { jobId: buildFriendBlastTickJobId(campaignId, tickIdx), delay: delayMs },
  );
}

// ── Worker lifecycle ──────────────────────────────────────────────────────────
let workerInstance: Worker<FriendBlastFireJobData> | null = null;
let workerConnection: Redis | null = null;

/** Wire the BullMQ Worker → processor. Gọi 1 lần lúc app start. */
export function startFriendBlastWorker(
  processor: (job: Job<FriendBlastFireJobData>) => Promise<unknown>,
): Worker<FriendBlastFireJobData> {
  if (workerInstance) {
    logger.warn('[friend-blast-worker] already started');
    return workerInstance;
  }
  workerConnection = getConnection().duplicate();
  workerInstance = new Worker<FriendBlastFireJobData>(
    FRIEND_BLAST_FIRE_QUEUE,
    processor,
    {
      connection: workerConnection as ConnectionOptions,
      // Concurrency 2: job ID deterministic (fb-{id}-tick-{idx}) nên 2 tick
      // cùng campaign không thể chạy song song — concurrency chỉ cho phép
      // song song GIỮA các campaign khác nhau.
      concurrency: 2,
    },
  );
  workerInstance.on('completed', (job) => {
    logger.info(`[friend-blast-worker] completed campaignId=${job.data.campaignId} tick=${job.data.tickIdx}`);
  });
  workerInstance.on('failed', (job, err) => {
    logger.error(
      `[friend-blast-worker] failed campaignId=${job?.data.campaignId} tick=${job?.data.tickIdx} attempt=${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`,
    );
  });
  workerInstance.on('error', (err) => {
    logger.error(`[friend-blast-worker] error: ${err.message}`);
  });
  logger.info('[friend-blast-worker] started');
  return workerInstance;
}

export async function stopFriendBlastWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
  if (workerConnection) {
    await workerConnection.quit();
    workerConnection = null;
  }
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
