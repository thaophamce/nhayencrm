# Biên bản deploy toàn bộ thay đổi Local lên VPS

**Thời điểm:** 2026-08-18 12:29 Asia/Bangkok  
**Public origin:** `https://nhayencrm.com` → VPS `103.209.34.224`  
**Nguồn chuẩn:** VPS production; Local chỉ là bản sao phát triển/backup.

## Phạm vi

Đã đưa vào image production toàn bộ thay đổi code hiện có ở Local tại thời điểm deploy:

- Bảng lương đơn thiết kế: lấy người theo đơn phát sinh, gồm `hoangvy` và `nguyenrola` dù thuộc Sale.
- Finance: đọc state server-side từ `app_settings.finance_state_v1`.
- Zalo/media/mobile/chat/marketing: các file Local đã build thành công.
- Docker build: cài rõ `lightningcss-linux-x64-musl` để build Alpine không phụ thuộc optional package của Windows.

Không restore, truncate, hoặc ghi đè database.

## Release

| Hạng mục | Kết quả |
|---|---|
| Image | `zalocrm-app:codex-20260818-1215-all-local` |
| Digest | `sha256:0bfcbab0479ab061d00c42b184af11d923dd6d2186f2ae018c11bc5dce0a2036` |
| Build | PASS, no-cache |
| Backend build | PASS (`tsc`) |
| Frontend build | PASS (`vue-tsc -b && vite build`) |
| Unit tests mục tiêu | PASS: 4 files, 67 tests |
| Schema/migrations | Hash schema khớp; không có migration mới cần chạy |
| Health | `{status:ok,db:connected}` |
| Public `/orders` | HTTP 200 |

## Backup và rollback

- DB trước deploy: `/opt/zalocrm/backups/pre-20260818-1224.dump`.
- SHA-256 DB: `e43428e8cda536ad6367eef80a8b3964ad87b6056fa01814687fa34c6e27c21d`.
- Image rollback giữ trên VPS: `zalocrm-app:rollback-20260818-1224`.
- Env trước sửa Redis: `/opt/zalocrm/backups/pre-redis-auth-20260818-1227.env`.
- Không đổi volume file/media và không chạm dữ liệu nghiệp vụ.

## Kiểm tra sau deploy

| Chỉ số | VPS sau deploy |
|---|---:|
| `users` trong org | 27 |
| `orders` tháng 08/2026 | 649 |
| `salary_records` | 20 |
| `leave_requests` | 16 |
| `attendance_records` | 664 |

Hai tài khoản vẫn có phát sinh đơn và được giữ trong luồng bảng lương:

| Username | Tên đúng | Active | Đơn tháng 08 theo kiểm tra DB |
|---|---|---:|---:|
| `hoangvy` | Phạm Vũ Hoàng Vy | Có | 21 |
| `nguyenrola` | Nguyễn Rola | Có | 8 |

## Sự cố phát hiện và xử lý

Sau lần recreate app đầu tiên, log có `NOAUTH Authentication required` vì Redis VPS bật `requirepass` nhưng `REDIS_URL` thiếu password. Đã:

1. Xác nhận password Redis bằng `PONG`.
2. Backup `.env` trước sửa.
3. Đặt `REDIS_URL=redis://:<password>@redis:6379` trên VPS.
4. Recreate riêng app.
5. Xác nhận không còn `NOAUTH` trong log 60 giây sau restart; health vẫn PASS.

## Kết luận

**PASS kỹ thuật.** VPS đã chạy image mới, DB production giữ nguyên, Finance và bảng lương đã có code mới. Local app/origin tiếp tục tắt; chỉ nên tắt hẳn máy Local sau khi người dùng đăng nhập kiểm tra trực quan `/orders` và `/finance` trên public origin.
