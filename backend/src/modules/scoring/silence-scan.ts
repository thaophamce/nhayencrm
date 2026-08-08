// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * scoring/silence-scan.ts — Quét ngày im, ghi Conversation.silenceLabel.
 *
 * MVP phân loại hội thoại (anh chốt 2026-07-19). Chạy 2 lần/ngày (07:00, 12:30).
 *
 *   SALES  — hội thoại cá nhân (threadType=user). Mốc im = Friend.lastInboundAt
 *            (join qua zaloAccountId × zaloUidInNick = conv.externalThreadId).
 *   DESIGN — nhóm Zalo (threadType=group). Mốc im = conv.lastMessageAt (Cách A:
 *            designer gửi Demo trong nhóm cũng tính).
 *
 * 2026-08-08 (anh duyệt) — MỞ RỘNG NHÓM. Trước đây nhóm chỉ được quét khi JOIN được
 * đơn đang 'designing'; đo trên DB thật: 3.169 đơn nhưng chỉ 3 đơn có conversation_id
 * (luồng tạo đơn chỉ ghi conversationId khi tạo TỪ màn hình nhóm chat) → 1.055 đơn
 * 'designing' bị bỏ qua → 11.598 nhóm và 0 nhóm có nhãn, trong khi cá nhân có 1.080.
 * Giờ quét TẤT CẢ nhóm theo lastMessageAt, không phụ thuộc đơn.
 * Tắt lại bằng AppSetting `silence_scan_all_groups` = 'false' (quay về chỉ nhóm có
 * đơn 'designing') — cấp org, không cần migration.
 *
 * Nhãn tính bằng classifySilence() — NGƯỠNG chỉ định nghĩa 1 nơi (silence-classification.ts).
 * Rows rớt điều kiện (KH nhắn lại → <4 ngày, hoặc đơn 'approved' khi tắt cờ) được DỌN về null.
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { classifySilence, daysSince, type SilenceLabel } from './silence-classification.js';

type Candidate = { id: string; ts: Date | null };

/** Số id tối đa mỗi câu UPDATE. Sau khi mở rộng nhóm, tập id lên cỡ chục nghìn —
 *  nhồi hết vào một `IN (...)` là hàng chục nghìn bind param, dễ đụng giới hạn
 *  tham số của Postgres (65535) và khoá bảng lâu. 1000 là mức an toàn, đủ ít câu. */
const ID_BATCH = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Cờ org `silence_scan_all_groups`: quét MỌI nhóm (mặc định) hay chỉ nhóm có đơn
 *  'designing' (đặt 'false' để quay về hành vi trước 2026-08-08). Chỉ 'false' mới tắt —
 *  thiếu setting / giá trị lạ đều coi là bật, tránh tự tắt vì typo. */
async function isScanAllGroupsEnabled(orgId: string): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: 'silence_scan_all_groups' } },
    select: { valuePlain: true },
  });
  return setting?.valuePlain?.trim().toLowerCase() !== 'false';
}

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

  // DESIGN: nhóm Zalo + mốc tin cuối trong nhóm.
  //   allGroups=true  (mặc định) → TẤT CẢ nhóm, không phụ thuộc đơn.
  //   allGroups=false (tắt cờ)   → chỉ nhóm JOIN được đơn 'designing' (hành vi cũ).
  // isVirtual=false ở cả 2 nhánh: hội thoại ảo không hiện trong danh sách chat
  // (chat-routes.ts lọc isVirtual:false) nên gắn nhãn cho nó là nhãn không ai thấy.
  const allGroups = await isScanAllGroupsEnabled(orgId);
  const designRows = allGroups
    ? await prisma.$queryRaw<Candidate[]>`
        SELECT c.id AS id, c.last_message_at AS ts
        FROM conversations c
        WHERE c.org_id = ${orgId}
          AND c."threadType" = 'group'
          AND c.deleted_at IS NULL
          AND c.is_virtual = false
      `
    : await prisma.$queryRaw<Candidate[]>`
        SELECT c.id AS id, c.last_message_at AS ts
        FROM conversations c
        JOIN orders o ON o.conversation_id = c.id
        WHERE c.org_id = ${orgId}
          AND c."threadType" = 'group'
          AND c.deleted_at IS NULL
          AND c.is_virtual = false
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
    for (const batch of chunk(ids, ID_BATCH)) {
      const res = await prisma.conversation.updateMany({
        where: {
          id: { in: batch },
          OR: [{ silenceLabel: null }, { silenceLabel: { not: label } }],
        },
        data: { silenceLabel: label },
      });
      labeled += res.count;
    }
  }

  // Dọn nhãn cũ: row đang có nhãn nhưng không còn nằm trong tập giữ.
  // KHÔNG dùng `notIn: keepIds` — sau khi mở rộng nhóm, keepIds cỡ chục nghìn id
  // → một câu WHERE id NOT IN (...12k tham số). Đảo lại: chỉ đọc id ĐANG có nhãn
  // (tập này nhỏ, bằng số row đã gắn lần trước), lọc bằng Set trong JS rồi ghi theo lô.
  const labeledNow = await prisma.conversation.findMany({
    where: { orgId, silenceLabel: { not: null } },
    select: { id: true },
  });
  const staleIds = labeledNow.map((r) => r.id).filter((id) => !keepIds.has(id));
  let cleared = 0;
  for (const batch of chunk(staleIds, ID_BATCH)) {
    const res = await prisma.conversation.updateMany({
      where: { id: { in: batch } },
      data: { silenceLabel: null },
    });
    cleared += res.count;
  }

  const durationMs = Date.now() - startedAt;
  logger.info(
    { orgId, scanned, labeled, cleared, durationMs, allGroups },
    'Silence scan completed'
  );

  return { orgId, scanned, labeled, cleared, durationMs };
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
