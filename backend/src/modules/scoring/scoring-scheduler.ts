// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * scoring/scoring-scheduler.ts — Background scheduler cho Phase 6 jobs.
 *
 * 2 jobs:
 *   1. Decay cron — chạy mỗi giờ. Apply silent decay cho Friend lâu không inbound.
 *   2. Stuck detection — chạy daily 6am. Flag KH stuck per-stage threshold.
 *
 * Pattern: setInterval với jitter để tránh thundering herd ở multi-instance deploy.
 * Production-grade scheduler (BullMQ / agenda) có thể add sau nếu cần.
 */

import { logger } from '../../shared/utils/logger.js';
import { runDecayAllOrgs } from './decay-cron.js';
import { runStuckDetectionAllOrgs } from './stuck-detection.js';
import { runAutoTagsAllOrgs } from './auto-tag.js';
import { runSilenceScanAllOrgs } from './silence-scan.js';
import { startBackfillCron, stopBackfillCron } from './backfill-cron.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

let decayTimer: NodeJS.Timeout | null = null;
let stuckTimer: NodeJS.Timeout | null = null;
let autoTagTimer: NodeJS.Timeout | null = null;
let stuckInitialTimer: NodeJS.Timeout | null = null;
let autoTagInitialTimer: NodeJS.Timeout | null = null;
// MVP phân loại hội thoại (2026-07-19): quét ngày im 2 lần/ngày (07:00, 12:30).
let silenceAmTimer: NodeJS.Timeout | null = null;
let silencePmTimer: NodeJS.Timeout | null = null;
let silenceAmInitialTimer: NodeJS.Timeout | null = null;
let silencePmInitialTimer: NodeJS.Timeout | null = null;

/**
 * Start scheduler. Idempotent — call once at app boot.
 *
 * @param opts.decayIntervalMs - default 1 hour
 * @param opts.stuckRunHourLocal - hour 0-23 to trigger daily scan (default 6 = 6am)
 */
export function startScoringScheduler(opts?: {
  decayIntervalMs?: number;
  stuckRunHourLocal?: number;
  enabled?: boolean;
}): void {
  if (opts?.enabled === false) {
    logger.info('Scoring scheduler disabled via config');
    return;
  }

  const decayInterval = opts?.decayIntervalMs ?? HOUR_MS;
  const stuckHour = opts?.stuckRunHourLocal ?? 6;

  // ── Decay: every hour, jittered up to 1 min ──────────────────────────
  if (decayTimer) clearInterval(decayTimer);
  const decayJitter = Math.floor(Math.random() * 60_000);
  decayTimer = setInterval(
    () => {
      void runDecayJob();
    },
    decayInterval + decayJitter
  );
  logger.info({ decayIntervalMs: decayInterval }, 'Scoring decay scheduler started');

  // ── Stuck detection: daily at stuckHour ───────────────────────────────
  if (stuckTimer) clearInterval(stuckTimer);
  if (stuckInitialTimer) clearTimeout(stuckInitialTimer);
  const stuckMs = msUntilNextHourMatch(stuckHour);
  stuckInitialTimer = setTimeout(() => {
    stuckInitialTimer = null;
    void runStuckJob();
    // After first run, schedule every 24h
    stuckTimer = setInterval(() => {
      void runStuckJob();
    }, DAY_MS);
  }, stuckMs);
  logger.info(
    { stuckRunHourLocal: stuckHour, firstRunInMs: stuckMs },
    'Stuck detection scheduler started'
  );

  // ── Auto-tag: daily at stuckHour+1 (run sau stuck detection để dùng latest stuckSince) ──
  if (autoTagTimer) clearInterval(autoTagTimer);
  if (autoTagInitialTimer) clearTimeout(autoTagInitialTimer);
  const autoTagMs = msUntilNextHourMatch((stuckHour + 1) % 24);
  autoTagInitialTimer = setTimeout(() => {
    autoTagInitialTimer = null;
    void runAutoTagJob();
    autoTagTimer = setInterval(() => {
      void runAutoTagJob();
    }, DAY_MS);
  }, autoTagMs);
  logger.info({ firstRunInMs: autoTagMs }, 'Auto-tag scheduler started');

  // ── Silence scan: 2 lần/ngày (07:00 + 12:30) — ghi Conversation.silenceLabel ──
  if (silenceAmTimer) clearInterval(silenceAmTimer);
  if (silenceAmInitialTimer) clearTimeout(silenceAmInitialTimer);
  const silenceAmMs = msUntilNextTimeMatch(7, 0);
  silenceAmInitialTimer = setTimeout(() => {
    silenceAmInitialTimer = null;
    void runSilenceJob();
    silenceAmTimer = setInterval(() => {
      void runSilenceJob();
    }, DAY_MS);
  }, silenceAmMs);

  if (silencePmTimer) clearInterval(silencePmTimer);
  if (silencePmInitialTimer) clearTimeout(silencePmInitialTimer);
  const silencePmMs = msUntilNextTimeMatch(12, 30);
  silencePmInitialTimer = setTimeout(() => {
    silencePmInitialTimer = null;
    void runSilenceJob();
    silencePmTimer = setInterval(() => {
      void runSilenceJob();
    }, DAY_MS);
  }, silencePmMs);
  logger.info(
    { amRunInMs: silenceAmMs, pmRunInMs: silencePmMs },
    'Silence scan scheduler started'
  );

  // ── Phase 6 polish — Backfill cron: tick mỗi 5 phút, chunk 100 friend/tick ──
  // Tự stop khi không còn Friend nào scoreUpdatedAt=null trong 90 ngày qua.
  startBackfillCron();
}

export function stopScoringScheduler(): void {
  if (stuckInitialTimer) {
    clearTimeout(stuckInitialTimer);
    stuckInitialTimer = null;
  }
  if (autoTagInitialTimer) {
    clearTimeout(autoTagInitialTimer);
    autoTagInitialTimer = null;
  }
  if (silenceAmInitialTimer) {
    clearTimeout(silenceAmInitialTimer);
    silenceAmInitialTimer = null;
  }
  if (silencePmInitialTimer) {
    clearTimeout(silencePmInitialTimer);
    silencePmInitialTimer = null;
  }
  if (decayTimer) {
    clearInterval(decayTimer);
    decayTimer = null;
  }
  if (stuckTimer) {
    clearInterval(stuckTimer);
    stuckTimer = null;
  }
  if (autoTagTimer) {
    clearInterval(autoTagTimer);
    autoTagTimer = null;
  }
  if (silenceAmTimer) {
    clearInterval(silenceAmTimer);
    silenceAmTimer = null;
  }
  if (silencePmTimer) {
    clearInterval(silencePmTimer);
    silencePmTimer = null;
  }
  stopBackfillCron();
}

async function runAutoTagJob(): Promise<void> {
  try {
    const start = Date.now();
    const results = await runAutoTagsAllOrgs();
    const totalChanged = results.reduce((sum, r) => sum + r.changed, 0);
    logger.info(
      { totalChanged, orgs: results.length, ms: Date.now() - start },
      'Auto-tag batch completed'
    );
  } catch (err) {
    logger.error({ err }, 'Auto-tag job failed');
  }
}

async function runSilenceJob(): Promise<void> {
  try {
    const start = Date.now();
    const results = await runSilenceScanAllOrgs();
    const totalLabeled = results.reduce((sum, r) => sum + r.labeled, 0);
    const totalCleared = results.reduce((sum, r) => sum + r.cleared, 0);
    logger.info(
      { totalLabeled, totalCleared, orgs: results.length, ms: Date.now() - start },
      'Silence scan batch completed'
    );
  } catch (err) {
    logger.error({ err }, 'Silence scan job failed');
  }
}

async function runDecayJob(): Promise<void> {
  try {
    const start = Date.now();
    const results = await runDecayAllOrgs();
    const totalDecayed = results.reduce((sum, r) => sum + r.decayed, 0);
    logger.info(
      { totalDecayed, orgs: results.length, ms: Date.now() - start },
      'Decay job batch completed'
    );
  } catch (err) {
    logger.error({ err }, 'Decay job failed');
  }
}

async function runStuckJob(): Promise<void> {
  try {
    const start = Date.now();
    const results = await runStuckDetectionAllOrgs();
    const totalNewlyStuck = results.reduce((sum, r) => sum + r.newlyStuck, 0);
    const totalUnstuck = results.reduce((sum, r) => sum + r.unstuck, 0);
    logger.info(
      { totalNewlyStuck, totalUnstuck, orgs: results.length, ms: Date.now() - start },
      'Stuck detection batch completed'
    );
  } catch (err) {
    logger.error({ err }, 'Stuck detection failed');
  }
}

function msUntilNextHourMatch(targetHour: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(targetHour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

// Minute-aware biến thể — cần cho lần quét 12:30 (msUntilNextHourMatch zero phút).
function msUntilNextTimeMatch(targetHour: number, targetMinute: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(targetHour, targetMinute, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}
