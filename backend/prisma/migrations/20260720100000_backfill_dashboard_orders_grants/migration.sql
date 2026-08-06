-- Backfill khóa hiển thị MỚI (2026-07-20) cho các nhóm quyền đã seed trước đây.
-- Redesign Phân quyền dạng cây bật/tắt thêm 3 resource: dashboard, orders, orders_salary.
-- seedDefaultPermissionGroups() idempotent-by-name → BỎ QUA nhóm đã tồn tại, không cập
-- nhật grants. Nếu không backfill, sau khi gate route /`/orders`, non-admin mất 2 site oan.
--
-- Chốt với anh: Dashboard + Đơn hàng mặc định BẬT cho MỌI nhóm ("để không ai mất oan").
--   orders_salary (Lương thiết kế, nhạy cảm) KHÔNG backfill — chỉ Admin có sẵn qua fullCrud.
-- Additive: chỉ set access:true khi resource CHƯA có key (nhóm mới seed đã có sẵn → giữ nguyên).
-- Admin (grants có mọi resource) cũng đã có 2 key này nên jsonb_set không đổi gì.

UPDATE "permission_groups"
SET "grants" = jsonb_set(
      "grants",
      '{dashboard}',
      '{"access": true}'::jsonb,
      true  -- create_missing
    )
WHERE NOT ("grants" ? 'dashboard');

UPDATE "permission_groups"
SET "grants" = jsonb_set(
      "grants",
      '{orders}',
      '{"access": true}'::jsonb,
      true
    )
WHERE NOT ("grants" ? 'orders');
