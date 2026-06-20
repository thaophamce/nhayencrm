// Sequence nick selector — Luồng Mục Tiêu (viết lại 2026-06-12).
//
// ════════════════════════════════════════════════════════════════════════
// LỊCH SỬ: file cũ có pickNickForTask() phục vụ task-worker.ts (DB-polling,
// đã XÓA cùng AutomationTask). Nhánh request_friend cũ đếm cap qua
// AutomationTask stub (luôn 0) — dead code, gỡ luôn. File giờ chỉ còn 1 hàm
// chọn nick cho đường event → sequence (materializeFromEvent).
// ════════════════════════════════════════════════════════════════════════
//
// CHỌN NICK — CHIA CỨNG + FAILOVER (anh chốt 2026-06-20, đổi từ bản 2026-06-12):
//   1. List nick được phép = trigger.segmentSpec.nickIds (sale cấu hình lúc tạo
//      Mục tiêu — ĐÂY là tầng phân quyền Zalo scope; runtime không lọc owner thêm).
//      Nếu list rỗng → mọi nick connected trong org đều ứng viên.
//   2. Pool chia cứng = nick connected + còn quota gửi tin hôm nay (resolveEligibleNicks).
//      KHÔNG còn lọc theo Friend row khi PHÂN — khách nào cũng được giao xuống nick.
//   3. Materializer chia ĐỀU khách lên pool (round-robin per KH). Nick được phân TỰ tra
//      UID cho khách của mình qua SDK (ensureUidForPair → lưu Friend row), rồi chạy luồng.
//   4. Tra KHÔNG ra (no_phone/no_zalo/capped/offline) → ghi log sự cố + CHUYỂN NGAY sang
//      nick kế trong thứ tự (pickNickWithFailover). Hết nick mới bỏ KH kèm lý do rõ.
//      Nick chốt được sẽ đi HẾT luồng cho KH đó (sequence-step-worker mang nickId mọi step).

import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { peekQuota } from '../queues/quota-lua.js';
import { ensureUidForPair } from './ensure-uid.js';

export interface SequenceNickSelection {
  nickId: string;
  /** UID của KH trong nick này (zaloUidInNick) — gửi tin cần cái này */
  zaloUidInNick: string;
  reason: 'existing_friend' | 'resolved_uid';
}

/** 1 lần thử tra UID của 1 nick cho 1 KH — gom lại để báo cáo sự cố khi failover. */
export interface NickLookupAttempt {
  nickId: string;
  code: string;
  detail: string;
}

/**
 * MANUAL (anh chốt D4 + 5 trụ cột #1): gắn tay khi đang chat → dùng CHÍNH nick đó.
 * ensureUidForPair resolve UID (có sẵn / tìm qua SĐT → tạo Friend row). KHÔNG random.
 *
 * @returns selection nếu gửi-được, hoặc { nickId:null, reason } với lý do rõ để
 *          manual-enroll báo sale NGAY (NO_PHONE/NO_ZALO/LOOKUP_CAPPED/NOT_CONNECTED).
 */
export async function resolveManualNickForContact(args: {
  orgId: string;
  nickId: string;
  contactId: string;
}): Promise<SequenceNickSelection | { nickId: null; reason: string }> {
  const r = await ensureUidForPair(args);
  if (!r.ok) return { nickId: null, reason: r.code };
  return {
    nickId: args.nickId,
    zaloUidInNick: r.uid,
    reason: r.source === 'existing_friend' ? 'existing_friend' : 'resolved_uid',
  };
}

/**
 * Pool nick để CHIA CỨNG (round-robin) — KHÔNG lọc theo Friend row.
 * = nick trong allowedNickIds đang connected + còn quota gửi tin hôm nay.
 * List rỗng → mọi nick connected trong org. Materializer chia đều khách lên pool này.
 *
 * @param allowedNickIds  trigger.segmentSpec.nickIds — null/empty = không giới hạn
 */
export async function resolveEligibleNicks(
  orgId: string,
  allowedNickIds?: string[] | null,
): Promise<string[]> {
  const allowed =
    allowedNickIds && allowedNickIds.length > 0 ? new Set(allowedNickIds) : null;

  const nicks = await prisma.zaloAccount.findMany({
    where: {
      orgId,
      status: 'connected',
      ...(allowed ? { id: { in: [...allowed] } } : {}),
    },
    select: { id: true, dailyMessageCap: true },
  });

  // Lọc nick còn quota gửi tin hôm nay (cap<=0 = disable cap → luôn cho qua).
  const eligible: string[] = [];
  for (const n of nicks) {
    const cap = n.dailyMessageCap ?? 0;
    if (cap <= 0) {
      eligible.push(n.id);
      continue;
    }
    const { capped } = await peekQuota(n.id, 'message', cap);
    if (!capped) eligible.push(n.id);
  }
  return eligible;
}

/**
 * CHIA CỨNG + FAILOVER (anh chốt 2026-06-20): nick được phân TỰ tra UID cho KH của mình
 * qua SDK (ensureUidForPair → lưu Friend row). Tra KHÔNG ra → ghi log sự cố + CHUYỂN NGAY
 * sang nick kế trong orderedNickIds. Hết nick → trả null kèm mọi attempt để báo cáo.
 *
 * @param orderedNickIds  thứ tự thử nick — materializer xoay round-robin theo từng KH
 *                        (KH thứ i bắt đầu ở nick i%n, fail thì sang nick kế).
 * @returns nick chốt được + UID + danh sách attempt; hoặc { nickId:null, attempts } khi
 *          mọi nick đều tra ko ra UID cho KH này.
 */
export async function pickNickWithFailover(args: {
  orgId: string;
  contactId: string;
  orderedNickIds: string[];
}): Promise<
  | (SequenceNickSelection & { attempts: NickLookupAttempt[] })
  | { nickId: null; attempts: NickLookupAttempt[] }
> {
  const { orgId, contactId, orderedNickIds } = args;
  const attempts: NickLookupAttempt[] = [];

  for (const nickId of orderedNickIds) {
    const r = await ensureUidForPair({ orgId, nickId, contactId });
    if (r.ok) {
      return {
        nickId,
        zaloUidInNick: r.uid,
        reason: r.source === 'existing_friend' ? 'existing_friend' : 'resolved_uid',
        attempts,
      };
    }
    // Ghi nhận sự cố tra UID của nick này rồi FAILOVER sang nick kế NGAY.
    attempts.push({ nickId, code: r.code, detail: r.detail });
    logger.warn(
      `[nick-selector] tra UID fail contact=${contactId} nick=${nickId} (${r.code}) → chuyển nick kế`,
    );
  }

  return { nickId: null, attempts };
}
