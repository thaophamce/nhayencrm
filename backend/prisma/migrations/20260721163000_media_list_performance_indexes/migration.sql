-- Kho media: tăng tốc lọc asset active + sắp xếp recent/newest.
-- Partial indexes tránh kéo hàng trong thùng rác vào cây index nóng.
CREATE INDEX IF NOT EXISTS "media_assets_active_kind_recent_idx"
  ON "media_assets" ("org_id", "kind", "last_used_at" DESC NULLS LAST, "created_at" DESC)
  WHERE "archived_at" IS NULL;

CREATE INDEX IF NOT EXISTS "media_assets_active_kind_newest_idx"
  ON "media_assets" ("org_id", "kind", "created_at" DESC)
  WHERE "archived_at" IS NULL;
