-- Give quick-reply management its own RBAC resource instead of exposing all system settings.
UPDATE "permission_groups"
SET "grants" = COALESCE("grants", '{}'::jsonb) || '{"quick_reply":{"access":true,"create":true,"edit":true,"delete":true}}'::jsonb
WHERE "is_system" = true AND "name" IN ('Admin', 'Sale');
