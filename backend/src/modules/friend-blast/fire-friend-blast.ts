// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
// ════════════════════════════════════════════════════════════════════════
// Friend blast — Fire = resolve + enqueue worker
// ════════════════════════════════════════════════════════════════════════
//
// Khác broadcast: KHÔNG có segment/Block, danh sách người nhận đã được chốt
// sẵn thành FriendBlastRecipient (status='pending') ngay lúc tạo campaign
// (POST /). resolveAndEnqueue chỉ cần:
//   1. Atomic claim state draft|paused → running
//   2. Đối chiếu recipient 'pending' với FriendBlacklist hiện tại của nick
//      → đánh dấu 'skipped_blacklist' (giữ đếm minh bạch, không xoá row)
//   3. Set totalRecipients (loại trừ blacklist)
//   4. Enqueue tick-0 BullMQ friend-blast-fire worker → worker tự lazy-chain ticks

import { logger } from '../../shared/utils/logger.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { enqueueFriendBlastTick } from './friend-blast-queue.js';

export interface FireFriendBlastResult {
  recipients: number;
  claimed: boolean;
  skippedBlacklist: number;
}

export async function resolveAndEnqueue(campaignId: string): Promise<FireFriendBlastResult> {
  const campaign = await prisma.friendBlastCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('campaign not found');

  // 1. Atomic claim
  const claim = await prisma.friendBlastCampaign.updateMany({
    where: { id: campaignId, orgId: campaign.orgId, state: { in: ['draft', 'paused'] } },
    data: { state: 'running', startedAt: campaign.startedAt ?? new Date() },
  });
  if (claim.count === 0) {
    logger.warn(`[friend-blast] ${campaignId} claim failed — already running or terminal state`);
    return { recipients: 0, claimed: false, skippedBlacklist: 0 };
  }

  // 2. Đối chiếu blacklist hiện tại (có thể đổi sau lúc tạo campaign)
  const pending = await prisma.friendBlastRecipient.findMany({
    where: { campaignId, status: 'pending' },
    select: { id: true, friendUid: true },
  });

  let skippedBlacklist = 0;
  if (pending.length > 0) {
    const blacklist = await prisma.friendBlacklist.findMany({
      where: { zaloAccountId: campaign.zaloAccountId, friendUid: { in: pending.map((r) => r.friendUid) } },
      select: { friendUid: true },
    });
    const blockedUids = new Set(blacklist.map((b) => b.friendUid));
    if (blockedUids.size > 0) {
      const blockedIds = pending.filter((r) => blockedUids.has(r.friendUid)).map((r) => r.id);
      await prisma.friendBlastRecipient.updateMany({
        where: { id: { in: blockedIds } },
        data: { status: 'skipped_blacklist', note: 'Trong danh sách bạn bè không nhận tin' },
      });
      skippedBlacklist = blockedIds.length;
    }
  }

  const totalRecipients = pending.length - skippedBlacklist;

  await prisma.friendBlastCampaign.update({
    where: { id: campaignId },
    data: { totalRecipients },
  });

  if (totalRecipients === 0) {
    await prisma.friendBlastCampaign.update({
      where: { id: campaignId },
      data: { state: 'completed', completedAt: new Date() },
    });
    logger.info(`[friend-blast] ${campaignId} no sendable recipients (all blacklisted) → completed immediately`);
    return { recipients: 0, claimed: true, skippedBlacklist };
  }

  // 3. Enqueue tick-0 worker job → worker lazy-chain
  await enqueueFriendBlastTick(campaignId, campaign.orgId, 0);

  logger.info(`[friend-blast] ${campaignId} fired — ${totalRecipients} recipients (${skippedBlacklist} skipped blacklist), tick-0 enqueued`);
  return { recipients: totalRecipients, claimed: true, skippedBlacklist };
}
