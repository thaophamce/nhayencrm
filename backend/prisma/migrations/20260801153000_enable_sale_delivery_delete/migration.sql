-- Cho toàn bộ nhóm Sale hệ thống được xóa mềm đơn giao vận.
UPDATE "permission_groups"
SET "grants" = jsonb_set(COALESCE("grants", '{}'::jsonb), '{delivery,delete}', 'true'::jsonb, true)
WHERE "name" = 'Sale' AND "is_system" = true;
