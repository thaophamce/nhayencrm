CREATE TABLE "order_activities" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" TEXT NOT NULL,

    CONSTRAINT "order_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_activities_order_id_changed_at_idx"
    ON "order_activities"("order_id", "changed_at");
CREATE INDEX "order_activities_changed_at_idx"
    ON "order_activities"("changed_at");

ALTER TABLE "order_activities"
    ADD CONSTRAINT "order_activities_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_activities"
    ADD CONSTRAINT "order_activities_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the status audit trail that existed before the unified activity feed.
INSERT INTO "order_activities" (
    "id", "order_id", "type", "old_value", "new_value", "changed_at", "changed_by_id"
)
SELECT
    "id", "order_id", 'status', NULL, "status", "changed_at", "changed_by_id"
FROM "order_status_histories"
ON CONFLICT ("id") DO NOTHING;
