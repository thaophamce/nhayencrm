// MVP Phân loại hội thoại theo NGÀY IM LẶNG (anh chốt 2026-07-19).
// Không dùng điểm 0–100. Nhãn cố ý NGƯỢC trực giác: 🔥=mới im (đuổi gấp kẻo
// nguội), ❄️=im lâu (gần mất). Ngưỡng ngày: 4 / 7 / 15 / 30.
// Đây là NƠI DUY NHẤT định nghĩa ngưỡng — SQL trong silence-scan.ts và FE
// (ConversationList.vue) mirror đúng mốc này.

export type SilenceLabel = 'hot' | 'warm' | 'cool' | 'cold';

const DAY_MS = 24 * 60 * 60 * 1000;

// Số ngày im = hôm nay − mốc hoạt động cuối. Chưa có mốc → null (không xếp loại).
export function daysSince(timestamp: Date | string | null | undefined, now: number = Date.now()): number | null {
  if (!timestamp) return null;
  const t = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / DAY_MS);
}

// Xếp nhãn từ số ngày im. < 4 ngày → chưa xếp (null).
export function classifySilence(days: number | null): SilenceLabel | null {
  if (days === null || days < 4) return null;
  if (days >= 30) return 'cold';
  if (days >= 15) return 'cool';
  if (days >= 7) return 'warm';
  return 'hot'; // 4..6
}
