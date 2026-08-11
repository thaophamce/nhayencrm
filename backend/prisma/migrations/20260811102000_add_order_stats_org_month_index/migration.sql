-- Keep this migration to one statement: PostgreSQL forbids concurrent index
-- creation inside an explicit transaction.
CREATE INDEX CONCURRENTLY "orders_org_id_created_at_idx"
ON "orders"("org_id", "created_at");
