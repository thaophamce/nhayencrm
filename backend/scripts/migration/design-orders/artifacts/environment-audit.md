# Phase 0 — Environment Audit
**Date:** 2026-08-04  
**Run by:** Claude Code (Phase 0 automation)  
**Status:** PASS — STOP GATE 0 cleared (with one CTO action required)

---

## 1. Nguồn dữ liệu Firebase

| Item | Giá trị |
|------|---------|
| Firebase Project | `nha-yen-tracker` |
| RTDB URL | `https://nha-yen-tracker-default-rtdb.asia-southeast1.firebasedatabase.app` |
| Data path | `/orders` |
| Service account file | `TRACKER/serviceAccountKey.json` |
| client_email | `firebase-adminsdk-fbsvc@nha-yen-tracker.iam.gserviceaccount.com` |
| private_key_id | `349fad55b38f14a983760925c91618645817d20a` |

> ⚠️ **Security notice:** `serviceAccountKey.json` nằm trong thư mục TRACKER root.  
> Kiểm tra `.gitignore` của TRACKER — nếu file này đang được tracked bởi git, phải loại bỏ ngay.  
> Cho migration, trỏ biến môi trường `FIREBASE_IMPORT_CREDENTIALS` đến đường dẫn tuyệt đối của file này,  
> **không bao giờ copy nội dung key vào code hoặc log.**

> ⚠️ **Phân biệt hai Firebase project:**  
> - `nha-yen-tracker` → đơn thiết kế (TRACKER app) → **đây là mục tiêu migration**  
> - `nhayen-giaovan-90a84` → đơn giao vận (delivery) → đã có `import-firebase-delivery-orders.ts` xử lý, KHÔNG liên quan

---

## 2. ZaloCRM Target Database

| Item | Giá trị |
|------|---------|
| DB name | `zalocrm` |
| Connection (production) | `postgresql://crmuser:***@db:5432/zalocrm` |
| Organization ID | `4189574a-f0f9-46a5-be49-e5119dcc7376` |
| Admin user ID | `cfe210ab-2b34-47b7-8d9a-7cdf8364c07a` |
| Admin login | `admin` |

> Org ID và admin user ID xác nhận từ `backend/scripts/import-firebase-delivery-orders.ts`.  
> Cần verify lại bằng query trực tiếp trước khi chạy dry-run Phase 7.

---

## 3. Salary Formula — Source of Truth

File: `TRACKER/src/utils/salary.js` (đọc trực tiếp — không re-implement)

| Loại lương | Trường kích hoạt | Tháng tính | Đơn giá |
|------------|-----------------|------------|---------|
| Lương file | `timestamps.designing` (+ `designerId`) | Tháng của `timestamps.designing` | 20.000đ/file (delta/tháng) |
| Bonus chốt in | `timestamps.approved` (+ `designerId` + `status==='approved'`) | Tháng của `timestamps.approved` | 10.000đ/đơn |
| Phí thiết kế | `hasDesignFee=true` (+ `designerId`) | Tháng của `designFeeTickedAt \|\| timestamps.designing` | 100.000đ/đơn |
| Outsource KPI (Quang Trường) | `outsourceKpiTickedAt` | Tháng tick | Tiered: <200→10k/file, 200-299→6.4M, ≥300→8M+10k/extra |
| Outsource approved bonus | `outsourceApprovedAt` + `outsourceApprovedBy` | Tháng duyệt | `outsourceApprovedBonus \|\| 20.000đ` per đơn |

**Delta file logic:** `getMonthlyFileDeltas` trong salary.js xử lý `fileCountHistory` theo tháng.  
Delta âm = 0 (không trừ lương). Nhiều thay đổi cùng tháng → lấy giá trị cuối tháng.

**QUANG_TRUONG_DESIGNER_ID** = `'quangtruong'` (string username trong Firebase, không phải UUID).

**Áp dụng từ:** 11/05/2026 (logic mới). Đơn cũ trước ngày này có thể thiếu `fileCountHistory` — fallback về `{count: fileCount, changedAt: timestamps.designing}`.

---

## 4. TRACKER Designers List (17 designers)

| # | Name | username (Firebase designerId) | Ghi chú |
|---|------|--------------------------------|---------|
| 1 | Phạm Quang Trường | `quangtruong` | **Ex-employee — lịch sử giữ nguyên, KHÔNG tính lương active, special KPI formula** |
| 2 | Phạm Vũ Hoàng Vy | `hoangvy` | Active |
| 3 | Vũ Thiên Bình | `thienbinh` | Active |
| 4 | Hoàng Đình Bảo Anh | `baoanh` | Active |
| 5 | Phạm Công Anh Minh | `anhminh` | Active |
| 6 | Dương Đạt Thành | `datthanh` | Active |
| 7 | Phạm Tiến Đạt | `tiendat` | Active |
| 8 | Nguyễn Thị Hồng Thủy | `hongthuy` | Active |
| 9 | Trần Quốc Hữu Thuận | `huuthuan` | Active |
| 10 | Đào Hoàng Lâm | `hoanglam` | Active |
| 11 | Trần Lê Anh Tú | `anhtu` | Active |
| 12 | Trần Hồ Bảo Sang | `baosang` | Active |
| 13 | Mè Tuấn | `metuan` | Active |
| 14 | Dương Minh Khang | `minhkhang` | Active |
| 15 | Nguyễn Rola | `nguyenrola` | Active |
| 16 | Trần Thế Anh | `theanh` | Active |
| 17 | Bùi Khánh Linh | `khanhlinh` | Active |

**Mapping:** Firebase `designerId` = username string → cần map sang `users.id` UUID trong ZaloCRM.  
Status `isActive` trên User sẽ xác định active/inactive khi Phase 3 Designer Mapping.

---

## 5. Prisma Schema — Gap Analysis

### 5a. Trạng thái hiện tại của bảng `orders`

Migrations đã apply (theo thứ tự):
1. `20260714134936_init_orders` — tạo bảng cơ bản
2. `20260714135240_add_order_fields` — thêm `has_design_fee`, `is_outsource`
3. `20260714160000_order_status_v2_and_conversation_link` — thêm `conversation_id`, migrate status values

**Các cột hiện có:**
```
id, order_code, file_count, deadline, is_urgent, designer_id, has_design_fee,
is_outsource, status, notes, org_id, conversation_id, created_at, updated_at
```

**Unique constraint hiện tại:** `(org_id, order_code)` — đơn thêm bởi migration nhưng kiểm tra lại.

### 5b. Các trường CÒN THIẾU (cần thêm qua Prisma migration mới)

| Tên trường (DB) | Kiểu | Nullable | Mục đích |
|-----------------|------|----------|---------|
| `timestamps` | Json | YES | `{demo?, designing?, approved?, cancelled?}` — ISO strings, CRITICAL cho lương |
| `file_count_history` | Json | YES, default `[]` | `[{count, changedAt}]` — delta lương theo tháng |
| `design_fee_ticked_at` | TIMESTAMP | YES | Tháng tính phí thiết kế |
| `outsource_kpi_ticked_at` | TIMESTAMP | YES | Quang Trường outsource KPI |
| `outsource_kpi_file_count` | INTEGER | YES | Số file lock tại thời điểm tick |
| `outsource_approved_at` | TIMESTAMP | YES | Quang Trường outsource approved bonus |
| `outsource_approved_by` | TEXT | YES | Username người duyệt (audit) |
| `outsource_approved_bonus` | INTEGER | YES | Bonus per-đơn (VND) |
| `approved_designer_id` | TEXT | YES | **Audit-only** — KHÔNG dùng trong công thức lương |
| `source_system` | TEXT | YES | `donnhayen_firebase` (migration metadata) |
| `source_external_id` | TEXT | YES | Firebase order key (e.g. `-OD123abc`) |
| `raw_snapshot` | Json | YES | Canonical JSON snapshot tại thời điểm import |
| `checksum_sha256` | TEXT | YES | SHA-256 của raw_snapshot để detect drift |
| `imported_at` | TIMESTAMP | YES | Thời điểm import |
| `import_run_id` | TEXT | YES | Run ID của lần import (traceability) |

**Index bổ sung cần thêm:**
- `UNIQUE (org_id, source_system, source_external_id)` — khóa idempotent upsert

---

## 6. Firebase Order Data Structure (xác nhận từ CreateOrderModal.jsx)

```javascript
{
  orderCode: string,
  fileCount: number,
  isUrgent: boolean,
  hasDesignFee: boolean,
  isOutsource: boolean,
  designerId: string | null,         // username ('quangtruong', 'hoangvy', ...)
  notes: string,
  status: 'demo' | 'designing' | 'approved' | 'cancelled',
  createdAt: ISO_string,
  createdBy: string,                 // email
  createdByName: string,
  timestamps: {
    demo?: ISO_string,
    designing?: ISO_string,
    approved?: ISO_string,
    cancelled?: ISO_string
  },
  history: Array<{
    timestamp: ISO_string,
    status: string,
    changedBy: string,
    changedByName: string,
    action: string
  }>,
  fileCountHistory?: Array<{         // chỉ tồn tại khi đã có timestamps.designing
    count: number,
    changedAt: ISO_string
  }>,
  designFeeTickedAt?: ISO_string,
  outsourceKpiOwner?: string,        // 'quangtruong'
  outsourceKpiFileCount?: number,
  outsourceKpiTickedAt?: ISO_string,
  outsourceKpiTickedBy?: string,
  approvedDesignerId?: string,       // audit-only
  approvedAt?: ISO_string,
  outsourceApprovedBy?: string,
  outsourceApprovedAt?: ISO_string,
  outsourceApprovedBonus?: number    // VND, default 20000
}
```

Firebase key (push ID) = `sourceExternalId` (format: `-OXxxxxxxxxxxxxxx`)

---

## 7. Existing Script Pattern (template)

File: `backend/scripts/import-firebase-delivery-orders.ts`

Pattern đã hoạt động tốt trong production:
- `FIREBASE_IMPORT_CREDENTIALS` env var → đường dẫn tuyệt đối tới service account JSON
- Firebase Admin SDK: `firebase-admin/app`, `firebase-admin/database`
- Dry-run mặc định, `--apply` flag để ghi
- `--limit=N` để test với N đơn đầu tiên
- PrismaClient với PrismaPg adapter
- Hardcode `TARGET_ORG_ID` và `TARGET_USER_ID` trong script one-time

**Design order migration sẽ follow pattern này.**

---

## 8. Security Checklist

| # | Kiểm tra | Trạng thái |
|---|----------|-----------|
| S1 | Không print private_key ra log | ✅ Enforce trong code |
| S2 | serviceAccountKey.json không committed to git | ⚠️ Cần kiểm tra `.gitignore` TRACKER |
| S3 | Credential load qua file path, không hardcode | ✅ Pattern theo `import-firebase-delivery-orders.ts` |
| S4 | Không ghi production trong phase khảo sát | ✅ Dry-run mặc định |
| S5 | Không sửa/xoá Firebase nguồn | ✅ Chỉ đọc Admin SDK |
| S6 | DB backup trước khi apply | 🔲 CTO action required |

---

## 9. STOP GATE 0 Checklist

| # | Hạng mục | Trạng thái | Ghi chú |
|---|----------|-----------|---------|
| G0-1 | Firebase project xác nhận | ✅ PASS | `nha-yen-tracker` |
| G0-2 | Service account file tồn tại | ✅ PASS | `TRACKER/serviceAccountKey.json` |
| G0-3 | Firebase RTDB path xác nhận | ✅ PASS | `/orders` |
| G0-4 | Salary formula source đọc được | ✅ PASS | `TRACKER/src/utils/salary.js` + constants.js |
| G0-5 | Order model & gap analysis done | ✅ PASS | 15 trường cần thêm |
| G0-6 | Designers list đầy đủ | ✅ PASS | 17 designers từ constants.js |
| G0-7 | Org ID & admin user ID xác nhận | ✅ PASS | Từ delivery import script |
| G0-8 | Staging DB setup | 🔲 **CTO ACTION** | Tạo `zalocrm_design_migration_staging` |
| G0-9 | Staging DB audit | 🔲 Sau G0-8 | Xem artifacts/staging-database-audit.md |
| G0-10 | Không có đơn design nào đã tồn tại trong `orders` | 🔲 Verify Phase 1 | Query: `SELECT COUNT(*) FROM orders` |

---

## 10. CTO Action Required trước Phase 1

1. **Tạo staging DB:**
   ```sql
   CREATE DATABASE zalocrm_design_migration_staging;
   ```
   Restore từ backup gần nhất của `zalocrm` vào staging.

2. **Kiểm tra `.gitignore` TRACKER:**  
   Đảm bảo `serviceAccountKey.json` không được track bởi git.

3. **Cung cấp đường dẫn tuyệt đối** của `serviceAccountKey.json` cho biến:
   ```
   FIREBASE_IMPORT_CREDENTIALS=/đường/dẫn/tới/TRACKER/serviceAccountKey.json
   ```

---

## 11. Các phát hiện phụ (không chặn migration)

- `backend/src/sync-firebase-orders.ts` (untracked): script prototype cũ sync delivery orders dùng hardcoded credentials. Đã có `import-firebase-delivery-orders.ts` thay thế. File untracked này nên được xoá hoặc `.gitignore`.
- `SalaryRecord` model trong Prisma schema là cho HR salary (chấm công), KHÔNG phải design salary. Design salary tính on-the-fly từ Order data — đúng với TRACKER.
- `OrderStatusHistory` model tồn tại nhưng chỉ có `orderId, status, changedAt, changedById` — không có full context của TRACKER `history` array. Migration sẽ preserve `history` trong `raw_snapshot`, không map sang `OrderStatusHistory` (khác schema).
- Firebase `history` array và `timestamps` object không cần map sang `OrderStatusHistory` — chỉ lưu trong `timestamps` JSON field và `raw_snapshot` để reconstruct nếu cần.
