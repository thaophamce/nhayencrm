# Biên bản chốt VPS và đối chiếu Local

**Thời điểm:** 2026-08-18 11:38 Asia/Bangkok  
**Public origin:** `https://nhayencrm.com` → VPS `103.209.34.224`  
**Nguyên tắc:** VPS là nguồn dữ liệu production sau cutover; Local chỉ giữ bản sao cũ/backup.

## Deploy

- Image chạy: `zalocrm-app:codex-20260818-1125`.
- Health: `{status:ok,db:connected}`.
- Backup DB trước deploy: `/opt/zalocrm/backups/pre-codex-deploy-20260818-043109.dump`.
- Rollback image: `zalocrm-app:rollback-codex-20260818-043109`.
- Không xóa volume, không restore DB, không đổi dữ liệu nghiệp vụ trong lần deploy này.

## Tài chính

State Finance đã nằm trên `app_settings.finance_state_v1` của VPS:

| Chỉ số | VPS |
|---|---:|
| Tiền ngân hàng | 103.800.000 |
| Quỹ dự phòng | 81.800.000 |
| Quỹ lợi nhuận | 102.000.000 |
| Nhà cung cấp | 3 |
| Giao dịch | 49 |

Frontend production gọi server-state; `localStorage` chỉ còn cache/fallback.

## Bảng lương designer tháng 08/2026

Runtime tính được **13 người có phát sinh**. Hai tài khoản Sale vẫn xuất hiện đúng:

| Username | Tên hiển thị | Phòng quyền | Đơn | File | Duyệt | Phí thiết kế |
|---|---|---|---:|---:|---:|---:|
| `hoangvy` | Phạm Vũ Hoàng Vy | Sale | 35 | 27 | 14 | 1 |
| `nguyenrola` | Nguyễn Rola | Sale | 17 | 9 | 8 | 3 |

Đây là logic theo phát sinh lương tháng, không filter theo nhóm quyền `Designer`.

## Đối chiếu dữ liệu lõi

Snapshot read-only sau deploy:

| Bảng | Local | VPS | Nhận định |
|---|---:|---:|---|
| `orders` | 3.482 | 3.530 | VPS có 48 đơn mới hơn |
| `order_status_histories` | 1.098 | 1.216 | VPS có 118 history mới hơn |
| `delivery_orders` | 2.478 | 2.517 | VPS có 39 đơn mới hơn |
| `delivery_status_events` | 1.626 | 1.639 | VPS có 13 event mới hơn |
| `attendance_records` | 655 | 664 | VPS có 9 bản ghi mới hơn |
| `salary_records` | 20 | 20 | Hash khớp |
| `leave_requests` | 16 | 16 | Khớp |
| `contacts` | 41.349 | 41.566 | VPS có 217 bản ghi mới hơn |
| `conversations` | 31.131 | 31.401 | VPS có 270 bản ghi mới hơn |
| `messages` | 1.056.651 | 1.078.514 | VPS có 21.863 tin mới hơn |

Theo tháng, `orders` tháng 08 là Local 601 / VPS 649; tháng 06–07 khớp. `delivery_orders` tháng 08 là Local 473 / VPS 512; tháng 07 khớp.

Hai phía đều không có orphan `messages`, `order_status_histories`, `delivery_status_events`.

## Kết luận

- **PASS:** Finance, bảng lương, dữ liệu nhân sự cốt lõi, runtime production.
- **PASS có chênh lệch hợp lệ:** VPS có dữ liệu phát sinh sau snapshot Local; không được sync ngược Local → VPS bằng full dump.
- **Không còn việc migrate Finance:** state đã ở DB VPS.
- Local app/origin đã dừng; Local DB/dump chỉ giữ làm backup. Có thể tắt máy Local sau khi không cần tra cứu bản sao cũ.

## Quy trình lần sau

1. Ghi `SYNC_START`, xác định origin và nguồn chuẩn.
2. Backup cả hai DB; tuyệt đối không `truncate` hoặc restore ngược chiều.
3. Pre-check count, max timestamp, ID set, hash salary/attendance.
4. Dry-run theo từng bảng; map khóa unique trước khi upsert.
5. Sync incremental theo watermark; không dùng count tổng để kết luận đồng bộ.
6. Post-check count theo tháng, hash, orphan FK và API smoke.
7. Ghi biên bản PASS/PARTIAL/FAIL; chỉ tắt Local khi public origin, DB, media và backup đều xác nhận.
