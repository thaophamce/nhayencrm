# Biên bản migrate Finance Local → VPS

**Ngày:** 2026-08-18 10:47 Asia/Bangkok  
**Origin:** `https://nhayencrm.com`  
**VPS:** `103.209.34.224`

## Nguồn dữ liệu

Finance trước đây chỉ lưu trong Chrome `localStorage`, key:

`nhayen-finance-v2-cfo-20260729`

Snapshot local được đọc từ origin `http://localhost:5174`. Bản này mới hơn bản đã lưu ở `https://nhayencrm.com`.

## Dữ liệu đã migrate

| Trường | Giá trị |
|---|---:|
| Tiền ngân hàng | 103.800.000 |
| Quỹ dự phòng | 81.800.000 |
| Quỹ lợi nhuận | 102.000.000 |
| Nhà cung cấp | 3 |
| Giao dịch | 49 |

## Thay đổi triển khai

- Thêm API `GET/PUT /api/v1/finance/state`.
- Lưu state theo `orgId` trong `app_settings.finance_state_v1` trên PostgreSQL VPS.
- `FinanceView` đọc DB server-side; localStorage chỉ giữ cache/fallback.
- Rebuild/restart `zalo-crm-app`; không xóa volume, không thay đổi bảng nghiệp vụ khác.

## Kiểm tra

- Backend build: pass.
- Frontend build: pass.
- VPS health: `{"status":"ok","db":"connected"}`.
- DB VPS: `finance_state_v1`, 3 nhà cung cấp, 49 giao dịch.
- Route finance có trong image production.
- Backup DB trước migrate: `/opt/zalocrm/backups/pre-finance-*.dump`.

Sau khi đăng nhập lại, mở `https://nhayencrm.com/finance` và hard refresh. Local có thể tắt; dữ liệu finance đã nằm trên DB VPS.
