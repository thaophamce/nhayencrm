# Biên bản sửa lệch dữ liệu Finance

**Thời điểm:** 2026-08-18 15:05 Asia/Bangkok  
**Public origin:** `https://nhayencrm.com` → VPS `103.209.34.224`  
**Người duyệt:** Chủ dự án đã duyệt snapshot Finance public-origin.

## Nguyên nhân

Lần migrate trước chọn nhầm dữ liệu Local gắn với origin `http://localhost:5174`:

- 49 giao dịch.
- Cập nhật đến `2026-07-31`.
- Ngân hàng `103.800.000`.
- Quỹ dự phòng `81.800.000`.
- Quỹ lợi nhuận `102.000.000`.

Trong Local Storage còn một snapshot gắn với `https://nhayencrm.com`, là dữ liệu mới hơn:

- 62 giao dịch.
- Cập nhật đến `2026-08-17`.
- Ngân hàng `15.034.000`.
- Quỹ dự phòng `69.773.654`.
- Quỹ lợi nhuận `54.220.000`.
- Công nợ Đà Nẵng `297.401.940`.
- Công nợ Hóc Môn `0`.
- Công nợ Tân Phú `0`.

## Thực hiện

1. Backup state VPS cũ: `/opt/zalocrm/backups/finance-before-20260818-1500.json`.
2. Xác thực snapshot được duyệt: 3 nhà cung cấp, 62 giao dịch, ngày mới nhất `2026-08-17`, UTF-8 hợp lệ.
3. Import nguyên tử vào `app_settings.finance_state_v1` của org `4189574a-f0f9-46a5-be49-e5119dcc7376`.
4. Lưu snapshot chuẩn: `/opt/zalocrm/backups/finance-approved-62-20260818-1500.json`.
5. Không restore toàn bộ DB, không truncate, không thay đổi bảng nghiệp vụ khác.

## Kiểm tra sau import

| Chỉ số | Kết quả |
|---|---:|
| Payload SHA-256 Local | `0a74d368519f55ba3313ddc0879fa62058165f383fe1a2d046b85c97ae889a29` |
| Payload SHA-256 VPS | `0a74d368519f55ba3313ddc0879fa62058165f383fe1a2d046b85c97ae889a29` |
| Nhà cung cấp | 3 |
| Giao dịch | 62 |
| Tiền ngân hàng | 15.034.000 đ |
| Quỹ dự phòng | 69.773.654 đ |
| Quỹ lợi nhuận | 54.220.000 đ |
| Health API | PASS: `{status:ok,db:connected}` |
| Public `/finance` | HTTP 200 |

## Kết luận

**PASS.** VPS đã nhận đúng snapshot Finance được duyệt. Cần hard refresh hoặc đăng nhập lại trên `https://nhayencrm.com/finance` để frontend gọi state server mới; không dùng cache cũ trong trình duyệt.
