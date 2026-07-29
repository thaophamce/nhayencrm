CREATE TABLE "delivery_orders" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "order_code" TEXT NOT NULL,
  "product_type" TEXT NOT NULL DEFAULT 'invitation',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "deposit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
  "delivery_method" TEXT NOT NULL DEFAULT 'viettelpost',
  "delivery_status" TEXT NOT NULL DEFAULT 'pending',
  "warehouse_name" TEXT,
  "recipient_name" TEXT,
  "recipient_phone" TEXT,
  "address_line" TEXT,
  "province_name" TEXT,
  "district_name" TEXT,
  "ward_name" TEXT,
  "carrier_name" TEXT,
  "tracking_code" TEXT,
  "tracking_link" TEXT,
  "cod_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "shipping_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "pancake_order_id" TEXT,
  "contact_id" TEXT,
  "conversation_id" TEXT,
  "design_order_id" TEXT,
  "notes" TEXT,
  "created_by_id" TEXT NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "delivery_status_events" (
  "id" TEXT NOT NULL,
  "delivery_order_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "status_text" TEXT,
  "location" TEXT,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "external_updated_at" TIMESTAMP(3),
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_status_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "delivery_orders_org_id_order_code_key" ON "delivery_orders"("org_id", "order_code");
CREATE INDEX "delivery_orders_org_id_payment_status_created_date_idx" ON "delivery_orders"("org_id", "payment_status", "created_date");
CREATE INDEX "delivery_orders_org_id_delivery_status_created_date_idx" ON "delivery_orders"("org_id", "delivery_status", "created_date");
CREATE INDEX "delivery_orders_org_id_tracking_code_idx" ON "delivery_orders"("org_id", "tracking_code");
CREATE INDEX "delivery_status_events_delivery_order_id_created_at_idx" ON "delivery_status_events"("delivery_order_id", "created_at");
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_status_events" ADD CONSTRAINT "delivery_status_events_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "delivery_orders" USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on') WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');
ALTER TABLE "delivery_status_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_status_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "delivery_status_events" USING (EXISTS (SELECT 1 FROM "delivery_orders" d WHERE d."id" = "delivery_order_id" AND (d."org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')));

-- Existing system groups need grants for newly introduced resource.
UPDATE "permission_groups"
SET "grants" = COALESCE("grants", '{}'::jsonb) || '{"delivery":{"access":true,"create":true,"edit":true,"delete":true,"view_all":true}}'::jsonb
WHERE "is_system" = true AND "name" = 'Admin';
UPDATE "permission_groups"
SET "grants" = COALESCE("grants", '{}'::jsonb) || '{"delivery":{"access":true,"create":true,"edit":true}}'::jsonb
WHERE "is_system" = true AND "name" = 'Sale';
