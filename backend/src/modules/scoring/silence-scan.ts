// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * scoring/silence-scan.ts — Quét ngày im, ghi Conversation.silenceLabel.
 *
 * MVP phân loại hội thoại (anh chốt 2026-07-19). Chạy 2 lần/ngày (07:00, 12:30).
 *
 *   SALES  — hội thoại cá nhân (threadType=user). Mốc im = Friend.lastInboundAt
 *            (join qua zaloAccountId × zaloUidInNick = conv.externalThreadId).
 *   DESIGN — nhóm Zalo (threadType=group) gắn đơn đang 'designing' (chưa 'approved').
 *            Mốc im = conv.lastMessageAt (Cách A: designer gửi Demo trong nhóm cũng tính).
 *
 * Nhãn tính bằng classifySilence() — NGƯỠNG chỉ định nghĩa 1 nơi (silence-classification.ts).
 * Rows rớt điều kiện (KH nhắn lại → <4 ngày, hoặc đơn 'approved') được DỌN về null.
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { classifySilence, daysSince, type SilenceLabel } from './silence-classification.js';

type Candidate = { id: string; ts: Date | null };

export async function runSilenceScanForOrg(orgId: string): Promise<{
  orgId: string;
  scanned: number;
  labeled: number;
  cleared: number;
  durationMs: number;
}> {
  const startedAt = Date.now();
  const now = Date.now();

  // SALES: conversation cá nhân + mốc inbound cuối của KH.
  const salesRows = await prisma.$queryRaw<Candidate[]>`
    SELECT c.id AS id, f.last_inbound_at AS ts
    FROM conversations c
    JOIN friends f
      ON f.zalo_account_id = c.zalo_account_id
     AND f.zalo_uid_in_nick = c.external_thread_id
    WHERE c.org_id = ${orgId}
      AND c."threadType" = 'user'
      AND c.deleted_at IS NULL
  `;

  // DESIGN: nhóm gắn đơn đang 'designing' (chưa 'approved') + mốc tin cuối trong nhóm.
  const designRows = await prisma.$queryRaw<Candidate[]>`
    SELECT c.id AS id, c.last_message_at AS ts
    FROM conversations c
    JOIN orders o ON o.conversation_id = c.id
    WHERE c.org_id = ${orgId}
      AND c."threadType" = 'group'
      AND c.deleted_at IS NULL
      AND o.status = 'designing'
  `;

  const scanned = salesRows.length + designRows.length;

  // Gom id theo nhãn; id không xếp loại (null) sẽ được dọn cùng các row rớt điều kiện.
  const byLabel = new Map<SilenceLabel, string[]>();
  const keepIds = new Set<string>();
  for (const row of [...salesRows, ...designRows]) {
    const label = classifySilence(daysSince(row.ts, now));
    if (!label) continue;
    keepIds.add(row.id);
    const bucket = byLabel.get(label) ?? [];
    bucket.push(row.id);
    byLabel.set(label, bucket);
  }

  let labeled = 0;
  for (const [label, ids] of byLabel) {
    // Chỉ ghi khi khác giá trị hiện tại → tránh update thừa. Phải kể cả row đang
    // NULL: SQL `col <> 'hot'` cho NULL (không phải true) nên `NOT` một mình sẽ
    // loại hết row chưa có nhãn → lần quét đầu không ghi được gì.
    const res = await prisma.conversation.updateMany({
      where: {
        id: { in: ids },
        OR: [{ silenceLabel: null }, { silenceLabel: { not: label } }],
      },
      data: { silenceLabel: label },
    });
    labeled += res.count;
  }

  // Dọn nhãn cũ: row đang có nhãn nhưng không còn nằm trong tập giữ.
  const cleared = await prisma.conversation.updateMany({
    where: {
      orgId,
      silenceLabel: { not: null },
      ...(keepIds.size > 0 ? { id: { notIn: Array.from(keepIds) } } : {}),
    },
    data: { silenceLabel: null },
  });

  const durationMs = Date.now() - startedAt;
  logger.info(
    { orgId, scanned, labeled, cleared: cleared.count, durationMs },
    'Silence scan completed'
  );

  return { orgId, scanned, labeled, cleared: cleared.count, durationMs };
}

export async function runSilenceScanAllOrgs() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const results = [];
  for (const org of orgs) {
    try {
      results.push(await runSilenceScanForOrg(org.id));
    } catch (err) {
      logger.error({ orgId: org.id, err }, 'silence scan failed');
    }
  }
  return results;
}
