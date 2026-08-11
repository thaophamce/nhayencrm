-- Các tài khoản cũ từng lưu tên đăng nhập tạm trong cột email (không có @).
-- Giữ nguyên email để tương thích, chỉ backfill username hợp lệ và chưa bị trùng.
UPDATE "users" AS candidate
SET "username" = LOWER(TRIM(candidate."email"))
WHERE candidate."username" IS NULL
  AND candidate."email" IS NOT NULL
  AND candidate."email" NOT LIKE '%@%'
  AND LOWER(TRIM(candidate."email")) ~ '^[a-z0-9._-]{3,32}$'
  AND NOT EXISTS (
    SELECT 1
    FROM "users" AS existing
    WHERE existing."username" = LOWER(TRIM(candidate."email"))
      AND existing."id" <> candidate."id"
  );
