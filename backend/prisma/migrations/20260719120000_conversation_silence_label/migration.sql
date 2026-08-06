-- MVP phân loại hội thoại theo ngày im (2026-07-19).
-- 1 cột nhãn dùng chung cho SALES (threadType=user) lẫn DESIGN (threadType=group).
-- Quét ngày ghi hot/warm/cool/cold; danh sách đọc thẳng vẽ badge. Additive → an toàn prod.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "silence_label" TEXT;
