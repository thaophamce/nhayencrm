-- Correct order-code uniqueness to match tenant-scoped application semantics.
DROP INDEX IF EXISTS "orders_order_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "orders_org_id_order_code_key"
  ON "orders"("org_id", "order_code");

-- Direct org-owned release tables.
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "orders";
CREATE POLICY tenant_isolation ON "orders"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "friend_blast_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "friend_blast_campaigns" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "friend_blast_campaigns";
CREATE POLICY tenant_isolation ON "friend_blast_campaigns"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "friend_blacklists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "friend_blacklists" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "friend_blacklists";
CREATE POLICY tenant_isolation ON "friend_blacklists"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "pinned_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pinned_messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pinned_messages";
CREATE POLICY tenant_isolation ON "pinned_messages"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');

-- Child tables inherit tenant scope through their parent.
ALTER TABLE "order_status_histories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_status_histories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "order_status_histories";
CREATE POLICY tenant_isolation ON "order_status_histories"
  USING (
    EXISTS (
      SELECT 1 FROM "orders" parent
      WHERE parent."id" = "order_id"
        AND (parent."org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "orders" parent
      WHERE parent."id" = "order_id"
        AND (parent."org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
    )
  );

ALTER TABLE "friend_blast_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "friend_blast_recipients" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "friend_blast_recipients";
CREATE POLICY tenant_isolation ON "friend_blast_recipients"
  USING (
    EXISTS (
      SELECT 1 FROM "friend_blast_campaigns" parent
      WHERE parent."id" = "campaign_id"
        AND (parent."org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "friend_blast_campaigns" parent
      WHERE parent."id" = "campaign_id"
        AND (parent."org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
    )
  );
