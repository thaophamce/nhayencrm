# Quy trình kiểm tra đồng bộ dữ liệu Local ↔ VPS
**Ngày lập:** 2026-08-17  
**Phạm vi:** Giao vận / Đơn thiết kế / Nhân sự / Tài chính  
**Mục tiêu:** Xác nhận dữ liệu production đã được đồng bộ chính xác lên VPS trước/sau mỗi lần sync.

## 0. Nguyên tắc bắt buộc
1. **Xác định source of truth trước khi so sánh.**
   - Hiện tại `nhayencrm.com` trỏ Cloudflare Tunnel vào VPS `103.209.34.224`.
   - Local Windows chỉ còn bản sao cũ/backup, **không phải** origin public.
2. Chỉ so sánh khi đã biết:
   - Local container DB: `zalo-crm-db` (host port `5433`)
   - VPS container DB: `zalo-crm-db`
   - Org production: `4189574a-f0f9-46a5-be49-e5119dcc7376` (Thiệp Cưới Nhà Yến)
3. **Không sync blind.** Mọi lần sync phải:
   - Backup DB 2 bên
   - Chạy checklist count + max timestamp + hash
   - Ghi log kết quả PASS/FAIL
4. Finance (`/finance`) lưu state server-side trong `app_settings.finance_state_v1` trên DB VPS. `localStorage` chỉ còn cache/fallback; không dùng dump nghiệp vụ để ghi đè.
5. Với thay đổi code, phải ghi release tag/image, hash image, kết quả build/test, health sau restart và đường dẫn rollback trước khi kết luận đã deploy.
6. Nếu VPS bật Redis password, `REDIS_URL` phải chứa credential tương ứng; kiểm tra `redis-cli ... ping = PONG` và không có `NOAUTH` trong log sau restart.
7. Finance phải chọn snapshot theo origin cụ thể. Không lấy bản ghi `localhost`; phải đối chiếu origin `https://nhayencrm.com`, số dư, số giao dịch, ngày mới nhất và ID giao dịch trước import.

## 1. Checklist nhanh (15–20 phút)
Chạy cùng SQL trên Local và VPS, so sánh từng dòng.

### 1.1 Count bảng cốt lõi
```sql
SELECT 'orders' t, count(*) FROM orders
UNION ALL SELECT 'order_status_histories', count(*) FROM order_status_histories
UNION ALL SELECT 'pancake_order_links', count(*) FROM pancake_order_links
UNION ALL SELECT 'delivery_orders', count(*) FROM delivery_orders
UNION ALL SELECT 'delivery_status_events', count(*) FROM delivery_status_events
UNION ALL SELECT 'attendance_records', count(*) FROM attendance_records
UNION ALL SELECT 'leave_requests', count(*) FROM leave_requests
UNION ALL SELECT 'salary_records', count(*) FROM salary_records
UNION ALL SELECT 'users_active', count(*) FROM users WHERE is_active
UNION ALL SELECT 'contacts', count(*) FROM contacts
UNION ALL SELECT 'conversations', count(*) FROM conversations
UNION ALL SELECT 'messages', count(*) FROM messages
ORDER BY 1;
```

### 1.2 Max timestamp theo site
```sql
SELECT 'orders' t, max(updated_at) FROM orders
UNION ALL SELECT 'delivery_orders', max(updated_at) FROM delivery_orders
UNION ALL SELECT 'delivery_status_events', max(created_at) FROM delivery_status_events
UNION ALL SELECT 'order_status_histories', max(changed_at) FROM order_status_histories
UNION ALL SELECT 'pancake_order_links', max(updated_at) FROM pancake_order_links
UNION ALL SELECT 'attendance_records', max(created_at) FROM attendance_records
UNION ALL SELECT 'leave_requests', max(created_at) FROM leave_requests
UNION ALL SELECT 'salary_records', max(updated_at) FROM salary_records
ORDER BY 1;
```

### 1.3 Tiêu chí PASS
- Count khớp 100% **hoặc** chênh lệch được giải thích bằng dữ liệu mới phát sinh sau mốc sync cuối.
- `max(timestamp)` VPS không được cũ hơn Local quá cửa sổ cho phép (mặc định ≤ 15 phút nếu sync real-time; ≤ 24h nếu sync batch ngày).
- Không có bảng cốt lõi bị thiếu hoàn toàn.

## 2. Checklist theo site

### 2.1 Nhân sự (`/salary`)
**Bảng:** `users`, `attendance_records`, `leave_requests`, `salary_records`

#### A. User trùng / gán sai phiếu lương
```sql
-- Tìm user trùng tên gần giống
SELECT id, username, full_name, email, is_active, payroll_order, created_at
FROM users
WHERE org_id = '4189574a-f0f9-46a5-be49-e5119dcc7376'
  AND (
    lower(full_name) LIKE '%rola%'
    OR lower(coalesce(username,'')) LIKE '%rola%'
  )
ORDER BY created_at;

-- Phiếu lương theo user
SELECT u.username, u.full_name, u.is_active, sr.period, sr.base_salary, sr.work_days, sr.net_salary, sr.is_manual_override
FROM salary_records sr
JOIN users u ON u.id = sr.user_id
WHERE sr.org_id = '4189574a-f0f9-46a5-be49-e5119dcc7376'
ORDER BY sr.period, u.full_name;
```

#### B. Hash salary + attendance
```sql
SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.user_id, x.period)) salary_hash, count(*)
FROM (
  SELECT user_id, period, base_salary, work_days, total_salary, net_salary, is_manual_override
  FROM salary_records
) x;

SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY x.id)) attendance_hash, count(*)
FROM (
  SELECT id, user_id, date, shift, status, late_minutes, checkin_time
  FROM attendance_records
) x;
```

#### C. API bảng lương (owner/admin)
Gọi:
- `GET /api/v1/payroll?period=YYYY-MM`
So sánh:
- số dòng active
- `workDays` auto (nếu chưa lưu)
- `baseSalary/netSalary` của dòng đã lưu

**PASS khi:**
- User đúng (ví dụ `nguyenrola` / Nguyễn Rola) giữ phiếu lương.
- Không còn user ghost trùng tên active mang phiếu lương.
- Hash salary/attendance Local = VPS.

### 2.2 Đơn thiết kế (`/orders`)
**Bảng:** `orders`, `order_status_histories`, `pancake_order_links`

```sql
-- Count theo tháng tạo
SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM') ym, count(*)
FROM orders
GROUP BY 1 ORDER BY 1;

-- Lệch theo tháng gần nhất
SELECT count(*) orders_aug, coalesce(sum(file_count),0) files_aug
FROM orders
WHERE created_at >= date_trunc('month', now())
  AND created_at < date_trunc('month', now()) + interval '1 month';

-- Designer salary source
SELECT u.username, u.full_name, count(*) orders
FROM orders o
JOIN users u ON u.id = o.designer_id
WHERE o.created_at >= date_trunc('month', now())
GROUP BY 1,2
ORDER BY orders DESC;
```

API kiểm tra:
- `GET /api/v1/orders/reports?month=YYYY-MM`
- `GET /api/v1/orders/stats?month=YYYY-MM`

**PASS khi:**
- Count `orders` + `order_status_histories` khớp hoặc lệch đúng cửa sổ thời gian.
- Báo cáo lương designer không mất user có phát sinh trong tháng.

### 2.3 Giao vận (`/pancake-orders` / delivery)
**Bảng:** `delivery_orders`, `delivery_status_events`

```sql
SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM') ym, count(*), coalesce(sum(total_amount),0) revenue
FROM delivery_orders
GROUP BY 1 ORDER BY 1;

SELECT delivery_status, count(*)
FROM delivery_orders
WHERE deleted_at IS NULL
GROUP BY 1 ORDER BY 2 DESC;

SELECT payment_status, count(*), coalesce(sum(total_amount),0)
FROM delivery_orders
WHERE deleted_at IS NULL
GROUP BY 1 ORDER BY 2 DESC;
```

**PASS khi:**
- Count đơn + tổng `total_amount` theo tháng khớp.
- `delivery_status_events` không lệch quá số đơn mới.
- Không có orphan event: event trỏ đơn không tồn tại.

```sql
SELECT count(*) orphan_events
FROM delivery_status_events e
LEFT JOIN delivery_orders d ON d.id = e.delivery_order_id
WHERE d.id IS NULL;
```

### 2.4 Tài chính (`/finance`)
**Lưu ý quan trọng:**
- Module finance lưu state server-side ở `app_settings.finance_state_v1` trên DB VPS. `localStorage` frontend (`FinanceView.vue`) chỉ là cache/fallback.
- Báo cáo doanh thu giao vận có thể đọc từ `delivery_orders` + file tĩnh lịch sử.

Checklist:
1. Đọc state qua API `/api/v1/finance/state` và đối chiếu `app_settings.finance_state_v1` trên VPS.
2. Nếu cần backup finance:
   - Backup DB VPS trước thay đổi.
   - Có thể export thêm localStorage admin để đối chiếu, không dùng nó ghi đè DB.
3. Đối chiếu doanh thu:
   - So `sum(total_amount)` của `delivery_orders` theo tháng giữa Local/VPS.
   - So số liệu tab Doanh thu giao vận nếu dùng dữ liệu live.

**PASS khi:**
- State Finance API/DB khớp snapshot đã duyệt.
- Phần doanh thu phụ thuộc `delivery_orders` đã khớp theo mục 2.3.

## 3. Phát hiện lệch kiểu “sync không cẩn thận”
Các dấu hiệu dev sync ẩu:
1. **VPS max timestamp dừng ở một mốc cũ** trong khi Local vẫn phát sinh (thường sau lần `sync-local-to-vps`/`full-sync`).
2. **Count bảng nghiệp vụ lệch theo tháng mới nhất**, các tháng cũ khớp.
3. **User trùng** (cùng tên, username null/email lạ) mang `salary_records`.
4. **Hash salary khớp nhưng attendance lệch** → sync bảng lương có, chấm công thiếu.
5. **Orphan FK** (event/history trỏ id không tồn tại).
6. Sync full dump ghi đè nhầm chiều (VPS → Local hoặc ngược lại) không có dry-run.

## 4. Quy trình vận hành mỗi lần sync
1. **Freeze cửa sổ**
   - Ghi giờ bắt đầu: `SYNC_START`.
2. **Backup**
   - Local: `pg_dump -Fc`
   - VPS: `pg_dump -Fc`
3. **Pre-check**
   - Chạy mục 1.1 + 1.2, lưu kết quả `pre-local.tsv` / `pre-vps.tsv`.
4. **Dry-run diff**
   - Liệt kê bảng lệch + số bản ghi thiếu theo tháng.
   - Duyệt danh sách trước khi import.
5. **Sync theo bảng, incremental**
   - Ưu tiên upsert theo PK/unique key.
   - Dùng `ON CONFLICT DO NOTHING/UPDATE` — cấm truncate bừa.
6. **Post-check**
   - Chạy lại 1.1 + 1.2 + hash salary/attendance/orders/delivery.
   - Với code deploy: kiểm tra image digest đang chạy, `/health`, HTTP public, log `ERROR/FATAL/NOAUTH`.
   - API smoke:
     - `/api/v1/payroll?period=current`
     - `/api/v1/orders/reports?month=current`
     - delivery list/stats
7. **Ghi biên bản**
   - File: `docs/sync-reports/YYYYMMDD-HHMM-local-vps.md`
   - Gồm: count trước/sau, max ts, bảng lệch, người thực hiện, kết luận PASS/FAIL.

## 5. Tiêu chuẩn PASS cuối cùng
- [ ] `salary_records` hash Local = VPS
- [ ] `attendance_records` hash Local = VPS
- [ ] `leave_requests` count + hash khớp
- [ ] `orders` count theo tháng khớp (hoặc lệch đúng cửa sổ sau SYNC_START)
- [ ] `delivery_orders` count + sum(total_amount) khớp
- [ ] Không còn user ghost active mang phiếu lương
- [ ] API payroll/orders/delivery trả số liệu nhất quán
- [ ] Finance state khớp `app_settings.finance_state_v1` trên VPS; browser chỉ là cache/fallback
- [ ] Finance snapshot đúng origin public, hash payload Local = VPS, không còn cache Local cũ được dùng làm nguồn chuẩn

## 6. Kết quả audit 2026-08-17
### 6.1 Baseline sáng (trước full sync)
- Phiếu lương tháng `2026-08` chuyển từ user ghost `Rola` (`rilalove60@gmail.com`) → `nguyenrola` / **Nguyễn Rola**.
- User ghost `Rola` set `is_active=false` trên Local + VPS.
- Đồng bộ 10 attendance records thiếu (15–17/08) Local → VPS.
- Hash: `attendance_records` 655/655 khớp; `salary_records` 20/20 khớp.

### 6.2 Full incremental sync (sau duyệt)
Biên bản chi tiết: [`docs/sync-reports/20260817-1215-local-vps.md`](sync-reports/20260817-1215-local-vps.md)

| Bảng | Local | VPS | Kết luận |
|---|---:|---:|---|
| orders | 3482 | 3482 | PASS |
| order_status_histories | 1098 | 1099 | PASS có note (+1 extra VPS) |
| delivery_orders | 2478 | 2478 | PASS |
| delivery_status_events | 1626 | 1626 | PASS |
| pancake_order_links | 50 | 51 | PASS có note (+1 extra VPS) |
| attendance_records | 655 | 655 | PASS hash |
| leave_requests | 16 | 16 | PASS |
| salary_records | 20 | 20 | PASS hash |
| contacts | 41272 | 41313 | PARTIAL (unique remap + live) |
| conversations | 31110 | 31120 | PARTIAL |
| messages | 1055901 | 1051891 | PARTIAL (Local live ingest) |

### 6.3 Bảng lương designer
- Code Local đã deploy: lấy designer theo phát sinh đơn trong tháng, không phụ thuộc group Designer.
- SQL simulation tháng `2026-08` Local/VPS đều có:
  - `Phạm Vũ Hoàng Vy` (Sale)
  - `Nguyễn Rola` (Sale)
- Hard refresh `/orders` trên `nhayencrm.com` để nhận frontend/backend mới.

### 6.4 Diễn giải
- Business modules (đơn thiết kế / giao vận / nhân sự) đã kéo sát sau full incremental.
- Chat vẫn lệch vì production Local tiếp tục ghi trong lúc sync + unique key remap.
- Dòng trạng thái mirror/local ở biên bản cũ chỉ phản ánh trước cutover; hiện public origin là VPS.

## 7. Lệnh chạy nhanh (PowerShell)
```powershell
# Local
$sql = Get-Content .\scripts\audit-local-vps-core.sql -Raw
$sql | docker exec -i zalo-crm-db psql -U crmuser -d zalocrm -P pager=off -F "`t" -A |
  Set-Content .runtime/precheck-local.tsv

# VPS
$sql | ssh root@103.209.34.224 "docker exec -i zalo-crm-db psql -U crmuser -d zalocrm -P pager=off -F '`t' -A" |
  Set-Content .runtime/precheck-vps.tsv

Compare-Object (Get-Content .runtime/precheck-vps.tsv) (Get-Content .runtime/precheck-local.tsv)
```

## 8. Việc tiếp theo khuyến nghị
1. Catch-up residual `messages/contacts/conversations` theo watermark nếu cần; không sync ngược VPS về Local.
2. Điều tra 1 `order_status_histories` + 1 `pancake_order_links` extra trên VPS khi có nghiệp vụ cần đối chiếu.
3. Đã deploy parity code salary report và Finance server-state lên VPS; lần sau chỉ rebuild từ source đã sync.
4. Gắn checklist này vào cuối mọi script `scripts/sync-*.sh`.
5. Mỗi lần sync phải tạo biên bản mới trong `docs/sync-reports/`.

## 9. Cutover production 2026-08-17
- Origin public đã chuyển: Cloudflare Tunnel `nhayencrm` chạy trên VPS `103.209.34.224`.
- Local Windows **không còn** là origin; task auto-start tunnel/app local đã disable.
- Biên bản: [`docs/sync-reports/20260817-1255-cutover-local-to-vps.md`](sync-reports/20260817-1255-cutover-local-to-vps.md)
- Sau cutover: mọi thay đổi code/data production phải deploy lên VPS, không sửa Local rồi quên sync.
