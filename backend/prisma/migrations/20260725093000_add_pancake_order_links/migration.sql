CREATE TABLE "pancake_order_links" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "shop_id" TEXT NOT NULL,
  "pancake_order_id" TEXT,
  "display_id" TEXT,
  "custom_id" TEXT,
  "order_code" TEXT,
  "pancake_status" INTEGER,
  "pancake_status_name" TEXT,
  "sync_status" TEXT NOT NULL DEFAULT 'creating',
  "last_error" TEXT,
  "raw_response" JSONB,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pancake_order_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pancake_order_links_conversation_id_key" ON "pancake_order_links"("conversation_id");
CREATE UNIQUE INDEX "pancake_order_links_shop_id_pancake_order_id_key" ON "pancake_order_links"("shop_id", "pancake_order_id");
CREATE INDEX "pancake_order_links_org_id_idx" ON "pancake_order_links"("org_id");
CREATE INDEX "pancake_order_links_sync_status_idx" ON "pancake_order_links"("sync_status");

ALTER TABLE "pancake_order_links" ADD CONSTRAINT "pancake_order_links_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pancake_order_links" ADD CONSTRAINT "pancake_order_links_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pancake_order_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pancake_order_links" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pancake_order_links";
CREATE POLICY tenant_isolation ON "pancake_order_links"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');
