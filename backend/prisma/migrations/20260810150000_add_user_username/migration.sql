ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");

UPDATE "permission_groups"
SET "name" = 'Designer', "is_system" = TRUE, "updated_at" = NOW()
WHERE "name" = 'Designer Order Full Access';

UPDATE "permission_groups"
SET "grants" = jsonb_set("grants", '{orders,create}', 'true'::jsonb, TRUE), "updated_at" = NOW()
WHERE "name" = 'Sale' AND "archived_at" IS NULL;

INSERT INTO "permission_groups" (
  "id", "org_id", "name", "is_system", "display_order", "grants", "created_at", "updated_at"
)
SELECT gen_random_uuid(), o."id", 'Designer', TRUE, 2,
       '{"orders":{"access":true},"orders_salary":{"access":true}}'::jsonb,
       NOW(), NOW()
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "permission_groups" pg
  WHERE pg."org_id" = o."id" AND pg."name" = 'Designer' AND pg."archived_at" IS NULL
);

WITH missing AS (
  SELECT o."id" AS org_id, names.name, names.display_order, gen_random_uuid() AS department_id
  FROM "organizations" o
  CROSS JOIN (VALUES ('Sale', 0), ('Designer', 1)) AS names(name, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM "departments" d
    WHERE d."org_id" = o."id" AND d."name" = names.name
      AND d."parent_id" IS NULL AND d."archived_at" IS NULL
  )
)
INSERT INTO "departments" (
  "id", "org_id", "name", "parent_id", "path", "depth", "display_order", "created_at", "updated_at"
)
SELECT department_id, org_id, name, NULL, '/' || department_id || '/', 0, display_order, NOW(), NOW()
FROM missing;
