// ════════════════════════════════════════════════════════════════════════
// Luồng Mục Tiêu M5 — Event hooks pause/resume per-contact (2026-06-01)
// ════════════════════════════════════════════════════════════════════════
//
// Wire vào event listeners hiện có để pause sequence per-contact + fire notify:
//   1. friend_accepted → pause N giờ + enqueueSequenceStart + notifyFriendAccept
//   2. friend_rejected → KHÔNG pause (spam hết theo P3), notifyFriendReject
//   3. customer_reply → pause N giờ + cancel pending steps + notifyCustomerReply (KHẨN)
//   4. customer_block → cancel toàn bộ sequence + log
//   5. customer_reaction_negative → pause 48h (anh chốt 2026-06-01)
//   6. customer_reaction_positive → KHÔNG dừng, chỉ score++
//
// Pattern Redis pause flag (Section 18 v3 Fix B + Issue #4 4A):
//   redis.set(`contact:paused:${triggerId}:${contactId}`, '1', 'PX', pauseMs)
//   Worker check trước process job → moveToDelayed remaining TTL → DelayedError
//
// Memory references:
//   - M52: customer_reply pattern message-handler.ts:594-618 (reuse 100%)
//   - project_zalocrm_reaction_system: 4-bug + Zalo protocol (positive khong dung)
//   - feedback_zalocrm_per_nick_throttle_gate

import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { getBullMQRedis } from './redis-connection.js';
import { getSequenceStepQueue, buildSequenceStepJobId } from './queue-registry.js';
import {
  notifyFriendAccept,
  notifyFriendReject,
  notifyCustomerReply,
} from './internal-notify-worker.js';
import { enqueueSequenceStart } from './sequence-step-worker.js';

// ════════════════════════════════════════════════════════════════════════
// Pause flag helpers
// ════════════════════════════════════════════════════════════════════════
export async function setContactPauseFlag(
  triggerId: string,
  contactId: string,
  hours: number,
): Promise<void> {
  if (hours <= 0) return;
  const redis = getBullMQRedis();
  const key = `contact:paused:${triggerId}:${contactId}`;
  const ttlMs = hours * 3600 * 1000;
  await redis.set(key, '1', 'PX', ttlMs);
  logger.info(`[event-hooks] paused contact=${contactId} trigger=${triggerId} for ${hours}h`);
}

export async function clearContactPauseFlag(
  triggerId: string,
  contactId: string,
): Promise<void> {
  const redis = getBullMQRedis();
  const key = `contact:paused:${triggerId}:${contactId}`;
  await redis.del(key);
  logger.info(`[event-hooks] cleared pause flag contact=${contactId} trigger=${triggerId}`);
}

export async function getContactPauseRemaining(
  triggerId: string,
  contactId: string,
): Promise<number> {
  const redis = getBullMQRedis();
  const key = `contact:paused:${triggerId}:${contactId}`;
  const ttl = await redis.pttl(key);
  return ttl > 0 ? ttl : 0;
}

// ════════════════════════════════════════════════════════════════════════
// Helper: Cancel pending sequence-step jobs cho 1 contact trong 1 trigger
// ════════════════════════════════════════════════════════════════════════
async function cancelPendingStepsForContact(
  triggerId: string,
  contactId: string,
): Promise<{ removed: number }> {
  const queue = getSequenceStepQueue();

  // Lấy tất cả jobs với jobId matching pattern
  // BullMQ không có wildcard query → list jobs delayed + waiting và filter manual
  const [delayedJobs, waitingJobs] = await Promise.all([
    queue.getJobs(['delayed'], 0, 1000),
    queue.getJobs(['waiting'], 0, 1000),
  ]);

  let removed = 0;
  const prefix = `${triggerId}-${contactId}-`;

  for (const job of [...delayedJobs, ...waitingJobs]) {
    if (job.id && job.id.startsWith(prefix)) {
      try {
        await job.remove();
        removed++;
      } catch (err) {
        logger.warn(`[event-hooks] failed to remove job ${job.id}: ${(err as Error).message}`);
      }
    }
  }

  if (removed > 0) {
    logger.info(
      `[event-hooks] cancelled ${removed} pending step(s) for contact ${contactId} trigger ${triggerId}`,
    );
  }
  return { removed };
}

// ════════════════════════════════════════════════════════════════════════
// HOOK 1: friend_accepted
// ════════════════════════════════════════════════════════════════════════
export async function onFriendAccepted(input: {
  orgId: string;
  triggerId: string;
  contactId: string;
  nickId: string;
  acceptedAt?: Date;
}): Promise<void> {
  const { orgId, triggerId, contactId, nickId, acceptedAt } = input;

  // Load trigger + sequence + contact info
  const [trigger, contact, nick] = await Promise.all([
    prisma.automationTrigger.findUnique({
      where: { id: triggerId },
      select: {
        id: true,
        name: true,
        sequenceId: true,
        successorSequenceId: true,
        sequenceStartDelayMinutes: true,
        pauseOnActivityHours: true,
      },
    }),
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, fullName: true, phone: true },
    }),
    prisma.zaloAccount.findUnique({
      where: { id: nickId },
      select: { id: true, displayName: true, ownerUserId: true },
    }),
  ]);

  if (!trigger) {
    logger.warn(`[hook:friend_accepted] trigger ${triggerId} not found`);
    return;
  }

  // Write event log
  await prisma.automationEventLog.create({
    data: {
      orgId,
      triggerId,
      contactId,
      nickId,
      eventType: 'friend_accepted',
      detail: `at ${(acceptedAt ?? new Date()).toISOString()}`,
    },
  });

  // Enqueue sequence start (Section 6.4 chain pattern)
  const sequenceId = trigger.successorSequenceId ?? trigger.sequenceId;
  if (sequenceId) {
    await enqueueSequenceStart({
      triggerId,
      contactId,
      sequenceId,
      nickId,
      orgId,
      startDelayMinutes: trigger.sequenceStartDelayMinutes,
    });
  }

  // Fire internal notify (M51.4-a)
  if (nick?.ownerUserId) {
    await notifyFriendAccept({
      orgId,
      targetUserId: nick.ownerUserId,
      contactId,
      contactName: contact?.fullName ?? '',
      contactPhone: contact?.phone ?? '',
      nickId,
      nickName: nick?.displayName ?? '',
      triggerId,
      triggerName: trigger.name,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════
// HOOK 2: friend_rejected
// ════════════════════════════════════════════════════════════════════════
export async function onFriendRejected(input: {
  orgId: string;
  triggerId: string;
  contactId: string;
  nickId: string;
}): Promise<void> {
  const { orgId, triggerId, contactId, nickId } = input;

  const [trigger, contact, nick] = await Promise.all([
    prisma.automationTrigger.findUnique({
      where: { id: triggerId },
      select: { id: true, name: true },
    }),
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, fullName: true, phone: true },
    }),
    prisma.zaloAccount.findUnique({
      where: { id: nickId },
      select: { id: true, displayName: true, ownerUserId: true },
    }),
  ]);

  if (!trigger) return;

  await prisma.automationEventLog.create({
    data: {
      orgId,
      triggerId,
      contactId,
      nickId,
      eventType: 'friend_rejected',
    },
  });

  // P3: KHÔNG pause — sequence vẫn chạy qua stranger inbox.
  // M51.4-b notify low priority
  if (nick?.ownerUserId) {
    await notifyFriendReject({
      orgId,
      targetUserId: nick.ownerUserId,
      contactId,
      contactName: contact?.fullName ?? '',
      contactPhone: contact?.phone ?? '',
      nickId,
      nickName: nick?.displayName ?? '',
      triggerId,
      triggerName: trigger.name,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════
// HOOK 3: customer_reply (KHẨN — pause N giờ + cancel jobs)
// ════════════════════════════════════════════════════════════════════════
export async function onCustomerReply(input: {
  orgId: string;
  triggerId: string;
  contactId: string;
  nickId: string;
  replyText: string;
  conversationId?: string;
}): Promise<void> {
  const { orgId, triggerId, contactId, nickId, replyText } = input;

  const trigger = await prisma.automationTrigger.findUnique({
    where: { id: triggerId },
    select: {
      id: true,
      name: true,
      pauseOnActivityHours: true,
      sequenceId: true,
    },
  });
  if (!trigger) return;

  await prisma.automationEventLog.create({
    data: {
      orgId,
      triggerId,
      contactId,
      nickId,
      eventType: 'customer_reply',
      detail: replyText.slice(0, 200),
    },
  });

  // Set pause flag (P2 + P2.1 reset)
  await setContactPauseFlag(triggerId, contactId, trigger.pauseOnActivityHours);

  // Cancel pending steps (M52 customer_reply pattern — reuse logic)
  await cancelPendingStepsForContact(triggerId, contactId);

  // Get contact + nick + sequence step info cho rich notify
  const [contact, nick, currentStepInfo] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, fullName: true, phone: true, leadScore: true },
    }),
    prisma.zaloAccount.findUnique({
      where: { id: nickId },
      select: { id: true, displayName: true, ownerUserId: true },
    }),
    // Find latest step sent
    prisma.automationEventLog.findFirst({
      where: {
        triggerId,
        contactId,
        eventType: 'sequence_step_sent',
      },
      orderBy: { createdAt: 'desc' },
      select: { detail: true },
    }),
  ]);

  // Parse step idx from detail "step N/M"
  let stepInfo: { idx: number; total: number } | undefined;
  if (currentStepInfo?.detail) {
    const m = currentStepInfo.detail.match(/step (\d+)\/(\d+)/);
    if (m) stepInfo = { idx: parseInt(m[1], 10) + 1, total: parseInt(m[2], 10) };
  }

  // Get sequence name
  const seq = trigger.sequenceId
    ? await prisma.automationSequence.findUnique({
        where: { id: trigger.sequenceId },
        select: { name: true },
      })
    : null;

  // Fire KHẨN notify (M51.4-c)
  if (nick?.ownerUserId) {
    await notifyCustomerReply({
      orgId,
      targetUserId: nick.ownerUserId,
      contactId,
      contactName: contact?.fullName ?? '',
      contactPhone: contact?.phone ?? '',
      customerScore: contact?.leadScore ?? undefined,
      nickId,
      nickName: nick?.displayName ?? '',
      triggerId,
      triggerName: trigger.name,
      sequenceName: seq?.name ?? '',
      stepInfo,
      replyPreview: replyText,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════
// HOOK 4: customer_block — cancel toàn bộ sequence
// ════════════════════════════════════════════════════════════════════════
export async function onCustomerBlock(input: {
  orgId: string;
  triggerId: string;
  contactId: string;
  nickId: string;
}): Promise<void> {
  const { orgId, triggerId, contactId, nickId } = input;

  await prisma.automationEventLog.create({
    data: {
      orgId,
      triggerId,
      contactId,
      nickId,
      eventType: 'customer_block',
    },
  });

  // Cancel all pending steps (KH chặn → không gửi tin nữa)
  await cancelPendingStepsForContact(triggerId, contactId);
  // KHÔNG clear pause flag — keep paused forever (no point retry)
  await setContactPauseFlag(triggerId, contactId, 24 * 365); // 1 năm = practically forever
}

// ════════════════════════════════════════════════════════════════════════
// HOOK 5+6: customer_reaction (positive/negative)
// ════════════════════════════════════════════════════════════════════════
export type ReactionSentiment = 'positive' | 'negative' | 'neutral';

export function classifyReactionEmoji(emoji: string): ReactionSentiment {
  // Memory project_zalocrm_reaction_system: 4-bug + protocol mismatch
  // Positive: ❤️👍🌹😆
  // Negative: 😡👎💔
  // Neutral: 😮😭
  const positive = ['❤️', '👍', '🌹', '😆', '❤', '/-heart', '/-strong', ':>', '/-rose'];
  const negative = ['😡', '👎', '💔', ':-((', ':-h'];
  if (positive.some((e) => emoji.includes(e))) return 'positive';
  if (negative.some((e) => emoji.includes(e))) return 'negative';
  return 'neutral';
}

export async function onCustomerReaction(input: {
  orgId: string;
  triggerId: string;
  contactId: string;
  nickId: string;
  emoji: string;
  messageId?: string;
}): Promise<void> {
  const { orgId, triggerId, contactId, nickId, emoji } = input;
  const sentiment = classifyReactionEmoji(emoji);

  await prisma.automationEventLog.create({
    data: {
      orgId,
      triggerId,
      contactId,
      nickId,
      eventType: `customer_reaction_${sentiment}`,
      detail: emoji,
    },
  });

  // Anh chốt 2026-06-01:
  //   - positive: KHÔNG dừng, score++
  //   - negative: pause 48h (lâu hơn reply 24h) + score--
  //   - neutral: KHÔNG hành động
  if (sentiment === 'negative') {
    await setContactPauseFlag(triggerId, contactId, 48);
    await cancelPendingStepsForContact(triggerId, contactId);

    // Decrease CRM score
    await prisma.contact
      .update({
        where: { id: contactId },
        data: { leadScore: { decrement: 5 } },
      })
      .catch(() => null);
  } else if (sentiment === 'positive') {
    // Score++, KHÔNG dừng
    await prisma.contact
      .update({
        where: { id: contactId },
        data: { leadScore: { increment: 5 } },
      })
      .catch(() => null);
  }
}

// ════════════════════════════════════════════════════════════════════════
// Manual control (gọi từ M9 endpoint /pause /stop /resume)
// ════════════════════════════════════════════════════════════════════════
export async function onManualPause(input: {
  orgId: string;
  triggerId: string;
  contactId: string;
  hours: number;
  reason?: string;
  byUserId: string;
}): Promise<void> {
  await setContactPauseFlag(input.triggerId, input.contactId, input.hours);
  await prisma.automationEventLog.create({
    data: {
      orgId: input.orgId,
      triggerId: input.triggerId,
      contactId: input.contactId,
      eventType: 'manual_pause',
      detail: `by ${input.byUserId}, ${input.hours}h, reason: ${input.reason ?? ''}`,
    },
  });
}

export async function onManualStop(input: {
  orgId: string;
  triggerId: string;
  contactId: string;
  reason: string;
  byUserId: string;
}): Promise<void> {
  await setContactPauseFlag(input.triggerId, input.contactId, 24 * 365); // forever
  await cancelPendingStepsForContact(input.triggerId, input.contactId);
  await prisma.automationEventLog.create({
    data: {
      orgId: input.orgId,
      triggerId: input.triggerId,
      contactId: input.contactId,
      eventType: 'manual_stop',
      detail: `by ${input.byUserId}, reason: ${input.reason}`,
    },
  });
}

export async function onManualResume(input: {
  orgId: string;
  triggerId: string;
  contactId: string;
  byUserId: string;
}): Promise<void> {
  await clearContactPauseFlag(input.triggerId, input.contactId);
  await prisma.automationEventLog.create({
    data: {
      orgId: input.orgId,
      triggerId: input.triggerId,
      contactId: input.contactId,
      eventType: 'manual_resume',
      detail: `by ${input.byUserId}`,
    },
  });
}
