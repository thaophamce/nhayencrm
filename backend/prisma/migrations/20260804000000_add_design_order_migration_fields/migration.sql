-- Design order migration fields
-- Thêm các trường lương và metadata import từ Firebase TRACKER app (project: nha-yen-tracker)

ALTER TABLE "orders" ADD COLUMN "timestamps"              JSONB;
ALTER TABLE "orders" ADD COLUMN "file_count_history"      JSONB;
ALTER TABLE "orders" ADD COLUMN "design_fee_ticked_at"    TIMESTAMPTZ;
ALTER TABLE "orders" ADD COLUMN "outsource_kpi_ticked_at" TIMESTAMPTZ;
ALTER TABLE "orders" ADD COLUMN "outsource_kpi_file_count" INTEGER;
ALTER TABLE "orders" ADD COLUMN "outsource_approved_at"   TIMESTAMPTZ;
ALTER TABLE "orders" ADD COLUMN "outsource_approved_by"   TEXT;
ALTER TABLE "orders" ADD COLUMN "outsource_approved_bonus" INTEGER;
ALTER TABLE "orders" ADD COLUMN "approved_designer_id"    TEXT;
ALTER TABLE "orders" ADD COLUMN "source_system"           TEXT;
ALTER TABLE "orders" ADD COLUMN "source_external_id"      TEXT;
ALTER TABLE "orders" ADD COLUMN "raw_snapshot"            JSONB;
ALTER TABLE "orders" ADD COLUMN "checksum_sha256"         TEXT;
ALTER TABLE "orders" ADD COLUMN "imported_at"             TIMESTAMPTZ;
ALTER TABLE "orders" ADD COLUMN "import_run_id"           TEXT;

-- Idempotent upsert key (NULLs treated as distinct — safe for pre-migration rows)
CREATE UNIQUE INDEX "orders_org_source_external_key"
  ON "orders"("org_id", "source_system", "source_external_id");

CREATE INDEX "orders_source_system_idx"  ON "orders"("source_system");
CREATE INDEX "orders_import_run_id_idx"  ON "orders"("import_run_id");
