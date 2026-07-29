// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
// ════════════════════════════════════════════════════════════════════════
// Friend blast — BullMQ tick processor.
// ════════════════════════════════════════════════════════════════════════
//
// Mỗi tick gửi ĐÚNG 1 tin nhắn (không batch trong-tick như broadcast) rồi tự
// enqueue tick kế tiếp với delay theo pacing — đơn giản hơn broadcast vì
// recipient list đã chốt sẵn (không có Phase 2 stranger lookup / segment).
//
// Pacing: { delaySeconds, batchSize, batchPauseSeconds, dailyLimit }
//   - Sau mỗi lần gửi: nếu sentCount chia hết cho batchSize → nghỉ
//     batchPauseSeconds (gửi X tin nghỉ Y giây), ngược lại nghỉ delaySeconds.
//   - dailyLimit: chặn theo ngày VN (sentToday/sentTodayDate), hết quota thì
//     defer tick tới 0h VN hôm sau thay vì huỷ.
//
// Worker lifecycle (Queue/Redis wiring) sống ở friend-blast-queue.ts — module
// này chỉ export friendBlastTickProcessor làm processor, theo pattern
// self-contained Community (group-scan-queue.ts / broadcast-fire-worker.ts).

import { type Job } from 'bullmq';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { withTenant } from '../../shared/tenant/tenant-context.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { downloadMediaToTemp } from '../chat/chat-media-helpers.js';
import { type FriendBlastFireJobData, buildFriendBlastTickJobId, enqueueFriendBlastTick } from './friend-blast-queue.js';

const DEFAULT_DELAY_SECONDS = 5;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_BATCH_PAUSE_SECONDS = 60;
const DEFAULT_DAILY_LIMIT = 200;

export interface FriendBlastTickResult {
  status: 'tick_done' | 'completed' | 'paused' | 'cancelled' | 'deferred' | 'not_found';
  sent: number;
  failed: number;
}

interface FriendBlastPacing {
  delaySeconds: number;
  batchSize: number;
  batchPauseSeconds: number;
  dailyLimit: number;
}

function readPacing(pacing: unknown): FriendBlastPacing {
  const p = (pacing ?? {}) as Record<string, any>;
  const pos = (v: any, fallback: number) => (Number(v) > 0 ? Number(v) : fallback);
  return {
    delaySeconds: pos(p.delaySeconds, DEFAULT_DELAY_SECONDS),
    batchSize: pos(p.batchSize, DEFAULT_BATCH_SIZE),
    batchPauseSeconds: pos(p.batchPauseSeconds, DEFAULT_BATCH_PAUSE_SECONDS),
    dailyLimit: pos(p.dailyLimit, DEFAULT_DAILY_LIMIT),
  };
}

// ── VN timezone helpers (cùng pattern broadcast-fire-worker.ts) ───────────
function vnDateString(d: Date = new Date()): string {
  const vnTime = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return vnTime.toISOString().slice(0, 10);
}

function nextMidnightVN(now: Date = new Date()): Date {
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnNow = new Date(now.getTime() + vnOffsetMs);
  const y = vnNow.getUTCFullYear();
  const m = vnNow.getUTCMonth();
  const d = vnNow.getUTCDate();
  return new Date(Date.UTC(y, m, d + 1, 0, 0, 0) - vnOffsetMs);
}

export async function processFriendBlastTick(
  job: Job<FriendBlastFireJobData, FriendBlastTickResult>,
): Promise<FriendBlastTickResult> {
  const { campaignId, orgId, tickIdx } = job.data;

  const campaign = await prisma.friendBlastCampaign.findFirst({ where: { id: campaignId, orgId } });
  if (!campaign) {
    logger.warn(`[friend-blast-fire] ${campaignId} not found — stop`);
    return { status: 'not_found', sent: 0, failed: 0 };
  }
  // 1. Re-check state — paused/cancelled/completed thì dừng, KHÔNG re-enqueue.
  if (campaign.state !== 'running') {
    logger.info(`[friend-blast-fire] ${campaignId} state=${campaign.state} — stop (no re-enqueue)`);
    return { status: campaign.state === 'paused' ? 'paused' : 'cancelled', sent: 0, failed: 0 };
  }

  const pacing = readPacing(campaign.pacing);

  // 2. Reset sentToday nếu sang ngày mới (VN tz).
  const today = vnDateString();
  let sentToday = campaign.sentToday;
  if (campaign.sentTodayDate !== today) {
    sentToday = 0;
    await prisma.friendBlastCampaign.update({
      where: { id: campaignId },
      data: { sentToday: 0, sentTodayDate: today },
    });
  }

  // 3. Daily cap — defer tới 0h VN hôm sau, không gửi tick này.
  if (sentToday >= pacing.dailyLimit) {
    const next = nextMidnightVN();
    const delayMs = Math.max(1000, next.getTime() - Date.now());
    logger.info(
      `[friend-blast-fire] ${campaignId} daily limit reached (${sentToday}/${pacing.dailyLimit}), defer to ${next.toISOString()}`,
    );
    await enqueueFriendBlastTick(campaignId, orgId, tickIdx + 1, delayMs);
    return { status: 'deferred', sent: 0, failed: 0 };
  }

  // 4. Lấy recipient pending kế tiếp.
  const recipient = await prisma.friendBlastRecipient.findFirst({
    where: { campaignId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  // 5. Hết recipient → hoàn tất campaign.
  if (!recipient) {
    await prisma.friendBlastCampaign.update({
      where: { id: campaignId },
      data: { state: 'completed', completedAt: new Date() },
    });
    logger.info(`[friend-blast-fire] ${campaignId} no more pending recipients → completed`);
    return { status: 'completed', sent: 0, failed: 0 };
  }

  await prisma.friendBlastRecipient.update({ where: { id: recipient.id }, data: { status: 'sending' } });

  // 6. Gửi.
  let ok = false;
  let noteText: string | null = null;
  try {
    if (campaign.imageUrl) {
      const tmp = await downloadMediaToTemp(
        { url: campaign.imageUrl, filename: campaign.imageFilename ?? undefined },
        'image',
      );
      try {
        await zaloOps.sendImage(campaign.zaloAccountId, recipient.friendUid, 0, [tmp.path], null, campaign.messageText ?? '');
      } finally {
        await tmp.cleanup();
      }
    } else {
      await zaloOps.sendMessage(campaign.zaloAccountId, recipient.friendUid, 0, { msg: campaign.messageText ?? '' });
    }
    ok = true;
  } catch (err: any) {
    noteText = String(err?.message ?? err);
    logger.error(`[friend-blast-fire] ${campaignId} send to ${recipient.friendUid} failed: ${noteText}`);
  }

  // 7. Cập nhật recipient + counters campaign.
  await prisma.friendBlastRecipient.update({
    where: { id: recipient.id },
    data: { status: ok ? 'success' : 'failed', note: noteText, sentAt: ok ? new Date() : null },
  });

  const updated = await prisma.friendBlastCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount: { increment: 1 },
      successCount: ok ? { increment: 1 } : undefined,
      failedCount: ok ? undefined : { increment: 1 },
      sentToday: { increment: 1 },
    },
  });

  if (updated.state !== 'running') {
    logger.info(`[friend-blast-fire] ${campaignId} state=${updated.state} after send — stop (no re-enqueue)`);
    return { status: 'tick_done', sent: ok ? 1 : 0, failed: ok ? 0 : 1 };
  }

  // 8. Delay kế tiếp theo pacing rồi tự chain tick.
  const nextDelaySeconds = updated.sentCount % pacing.batchSize === 0 ? pacing.batchPauseSeconds : pacing.delaySeconds;
  await enqueueFriendBlastTick(campaignId, orgId, tickIdx + 1, nextDelaySeconds * 1000);

  return { status: 'tick_done', sent: ok ? 1 : 0, failed: ok ? 0 : 1 };
}

export function friendBlastTickProcessor(
  job: Job<FriendBlastFireJobData, FriendBlastTickResult>,
): Promise<FriendBlastTickResult> {
  return withTenant(job.data.orgId, () => processFriendBlastTick(job));
}

export const __test = { processFriendBlastTick, vnDateString, nextMidnightVN, buildFriendBlastTickJobId };
