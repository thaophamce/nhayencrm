-- Order status v2 (demo/designing/approved/cancelled) + link Order 1-1 tới Conversation (nhóm Zalo)

-- AlterTable: thêm liên kết Order <-> Conversation (1 nhóm = tối đa 1 đơn)
ALTER TABLE "orders" ADD COLUMN "conversation_id" TEXT;
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_key" UNIQUE ("conversation_id");
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate dữ liệu status cũ (5 giá trị) sang bộ 4 giá trị mới
UPDATE "orders" SET "status" = 'demo' WHERE "status" = 'new';
UPDATE "orders" SET "status" = 'approved' WHERE "status" = 'completed';

-- Đổi default cho status mới
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'demo';
