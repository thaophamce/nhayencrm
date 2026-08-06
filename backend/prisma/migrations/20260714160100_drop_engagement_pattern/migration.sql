-- Xoá sạch hệ thống "Auto Engagement" (EngagementPattern) — thay bằng nhãn trạng thái đơn hàng gắn trực tiếp vào nhóm Zalo

-- 1. Xoá tag junction + tag definitions có source = 'auto_engagement'
DELETE FROM "friend_tags" WHERE "tag_id" IN (SELECT "id" FROM "tags" WHERE "source" = 'auto_engagement');
DELETE FROM "tags" WHERE "source" = 'auto_engagement';

-- 2. Xoá cột engagement trên contacts
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "engagement_pattern";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "engagement_trend";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "engagement_score";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "engagement_updated_at";

-- 3. Xoá bảng contact_engagement_daily
DROP TABLE IF EXISTS "contact_engagement_daily";

-- 4. Bỏ CHECK constraint cũ tham chiếu literal enum values (chặn ALTER COLUMN TYPE ở bước 5)
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_scope_source_valid";

-- 5. Bỏ value 'auto_engagement' khỏi enum TagSource (Postgres không cho DROP VALUE trực tiếp)
DROP TYPE IF EXISTS "TagSource_new";
CREATE TYPE "TagSource_new" AS ENUM (
  'zalo_real',
  'manual_per_nick',
  'auto_detect',
  'auto_score',
  'manual_crm',
  'ai_suggest',
  'segment_rule',
  'status',
  'import'
);

ALTER TABLE "tags" ALTER COLUMN "source" TYPE "TagSource_new" USING ("source"::text::"TagSource_new");
ALTER TABLE "friend_tags" ALTER COLUMN "added_via" TYPE "TagSource_new" USING ("added_via"::text::"TagSource_new");
ALTER TABLE "contact_tags" ALTER COLUMN "added_via" TYPE "TagSource_new" USING ("added_via"::text::"TagSource_new");

DROP TYPE "TagSource";
ALTER TYPE "TagSource_new" RENAME TO "TagSource";

-- 6. Tạo lại CHECK constraint với danh sách value mới (không còn auto_engagement)
ALTER TABLE "tags" ADD CONSTRAINT "tags_scope_source_valid" CHECK (
  (scope = 'friend' AND source IN ('zalo_real', 'manual_per_nick', 'auto_detect', 'auto_score'))
  OR
  (scope = 'crm' AND source IN ('manual_crm', 'ai_suggest', 'segment_rule', 'status', 'import'))
);
