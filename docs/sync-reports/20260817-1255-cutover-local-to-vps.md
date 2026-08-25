# Biên bản cutover nhayencrm.com → VPS
**Thời điểm:** 2026-08-17 ~12:55 Asia/Bangkok  
**Mục tiêu:** Chuyển origin public khỏi Local Windows sang VPS `103.209.34.224` để có thể tắt máy local.

## Kết quả
- `https://nhayencrm.com` → **200** qua Cloudflare Tunnel trên VPS
- `https://www.nhayencrm.com` → **200**
- VPS app `zalo-crm-app` running image `zalocrm-app` (salary designer fix)
- Tunnel service VPS: `cloudflared-nhayencrm.service` = **active (enabled)**
- Local named tunnel process đã stop
- Local scheduled tasks đã disable:
  - `ZaloCRM Cloudflare Tunnel`
  - `ZaloCRM Dev AutoStart`
- Local app container: **stopped** (không còn origin)
- 6/6 nick Zalo status `connected` trên VPS sau restart app

## Các bước đã thực hiện
1. Freeze Local app (`docker stop zalo-crm-app`)
2. Dump DB Local: `backups/cutover-local-20260817-124601.dump` (~178MB)
3. Backup DB VPS trước restore: `/opt/zalocrm/backups/pre-cutover-vps-20260817-054714.dump`
4. Restore full snapshot Local → VPS (swap DB):
   - DB cũ VPS giữ lại: `zalocrm_old_20260817125008`
   - DB hiện tại: `zalocrm` = snapshot Local
5. Upload/run image app mới `zalocrm-app:latest`
6. Sửa `.env` VPS:
   - `APP_URL=https://nhayencrm.com`
   - `CRM_LOGIN_URL=https://nhayencrm.com`
   - `LOCAL_PUBLIC_URL=https://nhayencrm.com/files`
   - `S3_PUBLIC_URL=https://nhayencrm.com/files`
   - xóa dòng hỏng `/zalocrm-attachments`
7. Cài/chạy cloudflared named tunnel trên VPS với credential tunnel `c24afbd5-...`
8. Stop tunnel Local + disable auto-start tasks

## Snapshot sau cutover (VPS)
| Bảng | Count |
|---|---:|
| orders | 3482 |
| delivery_orders | 2478 |
| messages | 1,056,458+ |
| salary_records | 20 |
| attendance_records | 655 |
| zalo_accounts | 6 connected |
| orphan messages | 0 |

## Identity kiểm tra
- `hoangvy` / Phạm Vũ Hoàng Vy: active, 21 đơn 08/2026
- `nguyenrola` / Nguyễn Rola: active, 8 đơn 08/2026, salary 2026-08 net 1,947,115

## Rollback nếu cần
1. Trên VPS: `systemctl stop cloudflared-nhayencrm`
2. Trên Local: enable lại task `ZaloCRM Cloudflare Tunnel` + start tunnel
3. Start local app: `docker start zalo-crm-app`
4. Nếu cần DB VPS cũ: rename `zalocrm_old_20260817125008` trở lại

## Việc anh có thể làm ngay
- Hard refresh `https://nhayencrm.com/orders` kiểm tra bảng lương designer (có Hoàng Vy + Nguyễn Rola)
- Kiểm tra chat 1-2 nick Zalo gửi/nhận tin
- Sau khi ổn 30–60 phút: **tắt máy Local được**

## Lưu ý
- Local DB/volume vẫn giữ làm backup; không xóa dump/volume vội.
- Media files VPS ~24.4G (gần parity Local). Nếu thiếu ảnh lẻ, sync delta volume `file_storage` sau.
- Finance đã migrate từ localStorage local vào `app_settings.finance_state_v1` trên DB VPS.
- Finance production đọc/ghi server-side; localStorage chỉ còn cache/fallback. DB snapshot trước migrate nằm trong `/opt/zalocrm/backups/pre-finance-*.dump`.
