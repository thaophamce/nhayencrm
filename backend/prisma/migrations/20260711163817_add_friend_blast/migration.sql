-- DropIndex
DROP INDEX "contacts_pool_robin_idx";

-- DropIndex
DROP INDEX "zalo_accounts_org_id_archived_at_idx";

-- AlterTable
ALTER TABLE "automation_triggers" ALTER COLUMN "welcome_delay_seconds" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "lead_notify_acks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "friend_blast_campaigns" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "message_text" TEXT,
    "image_url" TEXT,
    "image_filename" TEXT,
    "pacing" JSONB NOT NULL DEFAULT '{}',
    "state" TEXT NOT NULL DEFAULT 'draft',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "sent_today" INTEGER NOT NULL DEFAULT 0,
    "sent_today_date" TEXT,
    "created_by_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friend_blast_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_blast_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "friend_uid" TEXT NOT NULL,
    "display_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friend_blast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_blacklists" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "zalo_account_id" TEXT NOT NULL,
    "friend_uid" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friend_blacklists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "friend_blast_campaigns_org_id_zalo_account_id_state_idx" ON "friend_blast_campaigns"("org_id", "zalo_account_id", "state");

-- CreateIndex
CREATE INDEX "friend_blast_recipients_campaign_id_status_idx" ON "friend_blast_recipients"("campaign_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friend_blast_recipients_campaign_id_friend_uid_key" ON "friend_blast_recipients"("campaign_id", "friend_uid");

-- CreateIndex
CREATE INDEX "friend_blacklists_org_id_zalo_account_id_idx" ON "friend_blacklists"("org_id", "zalo_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "friend_blacklists_zalo_account_id_friend_uid_key" ON "friend_blacklists"("zalo_account_id", "friend_uid");

-- CreateIndex
CREATE INDEX "contacts_org_id_pooled_count_last_pooled_at_idx" ON "contacts"("org_id", "pooled_count", "last_pooled_at");

-- AddForeignKey
ALTER TABLE "friend_blast_recipients" ADD CONSTRAINT "friend_blast_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "friend_blast_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_zalo_account_id_fkey" FOREIGN KEY ("source_zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "lead_pool_distributions_org_id_assigned_to_user_id_distributed_" RENAME TO "lead_pool_distributions_org_id_assigned_to_user_id_distribu_idx";
