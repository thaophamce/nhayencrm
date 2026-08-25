# Báo Cáo Migration: Đơn Thiết Kế Firebase → ZaloCRM

**Ngày lập:** 04/08/2026  
**Người thực hiện:** Claude Code (AI Engineering Assistant)  
**Phê duyệt:** CTO

---

## 1. Tổng Quan

Migration **một chiều** toàn bộ đơn thiết kế từ Firebase Realtime Database (`nha-yen-tracker`) vào PostgreSQL (`zalocrm`). Dữ liệu bao gồm thông tin lương của designers — tất cả trường lương đều được bảo toàn nguyên vẹn, công thức tính lương vẫn lấy từ `TRACKER/src/utils/salary.js` (không re-implement).

### Phạm vi

- **Nguồn:** Firebase RTDB node `/orders` — dự án `nha-yen-tracker`
- **Đích:** Bảng `orders`, org `4189574a-f0f9-46a5-be49-e5119dcc7376`
- **Tổng designers cần map:** 17 người (gồm Quang Trường — ex-employee, dữ liệu lịch sử giữ nguyên)
- **Idempotent:** chạy lại bất kỳ lúc nào đều an toàn — upsert theo `(orgId, sourceSystem, sourceExternalId)`

---

## 2. Kiến Trúc Giải Pháp

```
Firebase RTDB                      PostgreSQL (ZaloCRM)
  /orders                   →      bảng orders
  { orderCode, designerId,          + 15 trường mới (timestamps, fileCountHistory,
    timestamps, fileCount,            salary fields, provenance)
    ... }                            + source_system = 'donnhayen_firebase'
                                     + source_external_id = Firebase push key
                                     + checksum_sha256 (drift detection)
```

**Bảo toàn tính toàn vẹn:** Mỗi đơn được hash SHA-256 theo canonical JSON. Nếu Firebase thay đổi sau import → phase 8 phát hiện ngay.

---

## 3. Danh Sách File Đã Tạo

### Schema & Migration
| File | Mô tả |
|------|-------|
| `backend/prisma/schema.prisma` | Cập nhật model `Order` thêm 15 trường + 1 unique index |
| `backend/prisma/migrations/20260804000000_.../migration.sql` | SQL migration thêm các cột mới |

### Scripts Migration
| File | Phase | Mô tả |
|------|-------|-------|
| `src/01-snapshot-firebase.ts` | 1 | Chụp toàn bộ Firebase, lưu canonical JSON + SHA-256 |
| `src/03-build-designer-map.ts` | 3 | Map 17 usernames TRACKER → User.id ZaloCRM |
| `src/07-import-design-orders.ts` | 7 | Import chính (dry-run + apply, theo batch 100) |
| `src/08-final-delta.ts` | 8 | Kiểm tra delta cuối trước khi tắt TRACKER |

### Thư Viện
| File | Mô tả |
|------|-------|
| `src/lib/canonical-json.ts` | Canonical JSON + SHA-256 (sort keys đệ quy) |
| `src/lib/firebase-types.ts` | TypeScript interfaces cho Firebase order |
| `src/lib/salary-golden-ref.ts` | Wrapper gọi `salary.js` từ TRACKER |

### Tài Liệu
| File | Mô tả |
|------|-------|
| `artifacts/environment-audit.md` | Phase 0 report — STOP GATE 0: PASS |
| `artifacts/BAO-CAO-MIGRATION.md` | File này |
| `README.md` | Hướng dẫn đầy đủ + rollback |

---

## 4. CTO Actions Bắt Buộc Trước Khi Chạy

> Các bước dưới đây cần CTO thực hiện thủ công — không thể tự động hóa vì yêu cầu truy cập hệ thống và credentials.

### 4.1 Chuẩn Bị Môi Trường

- [ ] **Tạo staging DB** (nếu chưa có):
  ```sql
  CREATE DATABASE zalocrm_design_migration_staging;
  ```
- [ ] **Backup production DB** trước khi apply production:
  ```bash
  pg_dump $PRODUCTION_DATABASE_URL > backup_$(date +%Y%m%d).sql
  ```
- [ ] **Kiểm tra `.gitignore`** trong thư mục TRACKER: `serviceAccountKey.json` phải được gitignore, không được commit vào repo.

### 4.2 Cấu Hình `.env` (trong `backend/`)

```env
# Firebase service account key — TUYỆT ĐỐI KHÔNG COMMIT FILE NÀY
FIREBASE_IMPORT_CREDENTIALS=/đường/dẫn/tuyệt/đối/tới/serviceAccountKey.json

# PostgreSQL connection string (staging trước, production sau)
DATABASE_URL=postgres://user:pass@host:5432/zalocrm_design_migration_staging

# Đường dẫn thư mục TRACKER (để load salary.js)
TRACKER_PATH=/đường/dẫn/tuyệt/đối/tới/TRACKER
```

### 4.3 Kiểm Tra Email Designers

Script phase 3 match TRACKER username với **tiền tố email** trong ZaloCRM (ví dụ: username `hoangvy` → email `hoangvy@nhayencrm.com`). Nếu email format khác, có thể cần cập nhật `TRACKER_DESIGNERS` list hoặc điều chỉnh matching logic trong `03-build-designer-map.ts`.

---

## 5. Thứ Tự Chạy

> Chạy tất cả lệnh từ thư mục `backend/`

### Bước 1: Apply Migration Schema

```bash
npx prisma migrate deploy
```

### Bước 2: Phase 1 — Snapshot Firebase (read-only, an toàn)

```bash
node --env-file=.env --import tsx scripts/migration/design-orders/src/01-snapshot-firebase.ts
```

Output: `artifacts/snapshots/<RUN_ID>/` — STOP GATE: project phải là `nha-yen-tracker`.

### Bước 3: Phase 3 — Build Designer Map

```bash
node --env-file=.env --import tsx scripts/migration/design-orders/src/03-build-designer-map.ts
```

Output: `artifacts/designer-map.json` — **STOP GATE**: tất cả 17 designers phải có `userId` (unmatchedCount = 0).

### Bước 4: Phase 7 — Dry-run (STAGING)

```bash
# Thử 10 đơn đầu tiên
node --env-file=.env --import tsx scripts/migration/design-orders/src/07-import-design-orders.ts --limit=10

# Full dry-run — in ra: toCreate, toUpdate, unchanged
node --env-file=.env --import tsx scripts/migration/design-orders/src/07-import-design-orders.ts
```

### Bước 5: Phase 7 — Apply (STAGING)

```bash
node --env-file=.env --import tsx scripts/migration/design-orders/src/07-import-design-orders.ts --apply
```

Output: `artifacts/runs/<RUN_ID>/rollback.sql`

### Bước 6: Verify Staging

```bash
# Kiểm tra số lượng đơn đã import
psql $DATABASE_URL -c "SELECT COUNT(*) FROM orders WHERE source_system = 'donnhayen_firebase';"

# Kiểm tra một vài đơn mẫu
psql $DATABASE_URL -c "SELECT order_code, file_count, status, designer_id, import_run_id FROM orders WHERE source_system = 'donnhayen_firebase' LIMIT 5;"
```

### Bước 7: Apply PRODUCTION

Đổi `DATABASE_URL` trong `.env` thành production connection string, sau đó:

```bash
node --env-file=.env --import tsx scripts/migration/design-orders/src/07-import-design-orders.ts --apply
```

### Bước 8: Phase 8 — Final Delta (trước khi tắt TRACKER)

```bash
# Kiểm tra có đơn nào mới/thay đổi sau khi import
node --env-file=.env --import tsx scripts/migration/design-orders/src/08-final-delta.ts

# Nếu còn delta, chạy lại phase 7 --apply
node --env-file=.env --import tsx scripts/migration/design-orders/src/07-import-design-orders.ts --apply
```

---

## 6. STOP GATEs

| Phase | Điều Kiện | Hành Động Nếu Fail |
|-------|-----------|-------------------|
| Phase 1 | Firebase project = `nha-yen-tracker` | Kiểm tra credentials |
| Phase 3 | unmatchedCount = 0 | Map thủ công trong `TRACKER_DESIGNERS` hoặc tạo user ZaloCRM |
| Phase 7 | `designer-map.json` đầy đủ + `salary.js` load được | Chạy lại Phase 3, kiểm tra `TRACKER_PATH` |

---

## 7. Rollback

```bash
# Xem file rollback đã tạo sau --apply
psql $DATABASE_URL -f scripts/migration/design-orders/artifacts/runs/<RUN_ID>/rollback.sql
```

File rollback xóa toàn bộ đơn của run đó theo `import_run_id`. **Không ảnh hưởng** đến đơn gốc (nếu có) trong bảng `orders`.

---

## 8. Kết Quả Dự Kiến

Sau khi hoàn thành:

- Toàn bộ đơn từ Firebase được import vào bảng `orders` với provenance đầy đủ
- Mỗi đơn có `source_system = 'donnhayen_firebase'` và `source_external_id` = Firebase push key
- `checksum_sha256` cho phép phát hiện drift bất kỳ lúc nào bằng Phase 8
- Dữ liệu lịch sử Quang Trường (ex-employee) được bảo toàn 100%
- Công thức lương vẫn gọi `salary.js` từ TRACKER — không có logic lương nào bị re-implement trong ZaloCRM

---

## 9. Bảo Mật

- `serviceAccountKey.json` **KHÔNG** được commit vào git
- `private_key` trong credentials **KHÔNG** bao giờ được in ra log
- Chỉ ghi DB khi có flag `--apply` — mọi lần chạy khác đều là dry-run
- Firebase source là **read-only** — không có mutation nào
- Rollback SQL được lưu local, không gửi đi đâu

---

## 10. Liên Hệ

Bất kỳ câu hỏi kỹ thuật nào về codebase migration, mở issue mới trong session Claude Code hoặc liên hệ trực tiếp với engineering team.

---

*Tài liệu này được tạo tự động bởi Claude Code. Phiên bản: 2026-08-04.*
