// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
// ════════════════════════════════════════════════════════════════════════
// Broadcasts (🟢 Community) — self-contained BullMQ queue + worker wiring.
// ════════════════════════════════════════════════════════════════════════
//
// Same pattern as modules/zalo/group-scan-queue.ts — Community features stay
// self-contained, KHÔNG dùng _ee/automation/queues/queue-registry.ts hay
// getBullMQRedis() singleton (không có _ee bundle trong repo này).
//
// Redis connection: dựng TẠI CHỖ từ process.env.REDIS_URL, lazy-init (import
// file không mở kết nối). Worker dùng connection RIÊNG (duplicate()) — BullMQ
// worker chạy blocking command, chia sẻ với Queue producer là anti-pattern.

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../../shared/utils/logger.js';

export const BROADCAST_FIRE_QUEUE = 'broadcast-fire';

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 10_000 },
};

export interface BroadcastFireJobData {
  broadcastId: string;
  orgId: string;
  tickIdx: number;
}

export function buildBroadcastTickJobId(broadcastId: string, tickIdx: number): string {
  return `bc-${broadcastId}-tick-${tickIdx}`;
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
      logger.error(`[broadcast-queue] redis error: ${err.message}`);
    });
    logger.info('[broadcast-queue] redis connection created');
  }
  return connection;
}

// ── Queue singleton ───────────────────────────────────────────────────────────
let queueInstance: Queue<BroadcastFireJobData> | null = null;
function getQueue(): Queue<BroadcastFireJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<BroadcastFireJobData>(BROADCAST_FIRE_QUEUE, {
      connection: getConnection() as ConnectionOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queueInstance.on('error', (err) => {
      logger.error(`[broadcast-queue] queue error: ${err.message}`);
    });
    logger.info('[broadcast-queue] queue initialized');
  }
  return queueInstance;
}

export function getBroadcastFireQueue(): Queue<BroadcastFireJobData> {
  return getQueue();
}

/** Enqueue tick job. jobId deterministic → re-enqueue same tick không tạo job trùng. */
export async function enqueueBroadcastTick(broadcastId: string, orgId: string, tickIdx: number): Promise<void> {
  const queue = getQueue();
  await queue.add(
    'tick',
    { broadcastId, orgId, tickIdx },
    { jobId: buildBroadcastTickJobId(broadcastId, tickIdx) },
  );
}

// ── Worker lifecycle ──────────────────────────────────────────────────────────
let workerInstance: Worker<BroadcastFireJobData> | null = null;
let workerConnection: Redis | null = null;

/** Wire the BullMQ Worker → processor. Gọi 1 lần lúc app start. */
export function startBroadcastFireWorker(
  processor: (job: Job<BroadcastFireJobData>) => Promise<unknown>,
): Worker<BroadcastFireJobData> {
  if (workerInstance) {
    logger.warn('[broadcast-fire-worker] already started');
    return workerInstance;
  }
  workerConnection = getConnection().duplicate();
  workerInstance = new Worker<BroadcastFireJobData>(
    BROADCAST_FIRE_QUEUE,
    processor,
    {
      connection: workerConnection as ConnectionOptions,
      // Concurrency 2: job ID deterministic (bc-{id}-tick-{idx}) nên 2 tick
      // cùng broadcast không thể chạy song song — concurrency chỉ cho phép
      // song song GIỮA các broadcast khác nhau.
      concurrency: 2,
    },
  );
  workerInstance.on('completed', (job) => {
    logger.info(`[broadcast-fire-worker] completed broadcastId=${job.data.broadcastId} tick=${job.data.tickIdx}`);
  });
  workerInstance.on('failed', (job, err) => {
    logger.error(
      `[broadcast-fire-worker] failed broadcastId=${job?.data.broadcastId} tick=${job?.data.tickIdx} attempt=${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`,
    );
  });
  workerInstance.on('error', (err) => {
    logger.error(`[broadcast-fire-worker] error: ${err.message}`);
  });
  logger.info('[broadcast-fire-worker] started');
  return workerInstance;
}

export async function stopBroadcastFireWorker(): Promise<void> {
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
