// RBAC visibility cho Khối (Block) — tách ra dùng CHUNG (2026-06-18).
// Trước đây hàm này nằm local trong block-routes.ts → các nơi khác gắn/gửi Khối theo blockId
// (trigger create, broadcast create, gửi-tay chat, duplicate) KHÔNG áp cùng luật → có thể tham
// chiếu Khối riêng tư của người khác hoặc lệch filter so với màn chọn. Gom về 1 chỗ cho nhất quán.

/**
 * Fragment Prisma `where` lọc Khối user được THẤY/DÙNG.
 * canViewAll (Marketing/Trưởng phòng/Admin/owner) → {} (thấy hết org).
 * Còn lại (Sale):
 *   - Khối trong thư mục CÔNG KHAI (cả org dùng),
 *   - Khối trong thư mục RIÊNG TƯ của chính mình,
 *   - Khối LẺ (folderId NULL, chưa phân loại) — coi như công khai.
 * Khớp block-folder-routes (folder public | private+ownerUserId) + BlocksView (block lẻ = public).
 */
export function blockVisibilityWhere(
  ownerScope: { canViewAll: boolean },
  userId: string,
): Record<string, unknown> {
  if (ownerScope.canViewAll) return {};
  return {
    OR: [
      { folder: { visibility: 'public' } },
      { folder: { visibility: 'private', ownerUserId: userId } },
      { folderId: null }, // Khối lẻ chưa phân loại = công khai (mọi sale dùng)
    ],
  };
}
