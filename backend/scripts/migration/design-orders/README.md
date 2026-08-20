# Migration: Design Orders Firebase → ZaloCRM

Migration một chiều đơn thiết kế từ Firebase RTDB (`nha-yen-tracker`) vào PostgreSQL (`zalocrm`).

## Thứ tự chạy

```
backend/                                      ← chạy mọi lệnh từ đây
scripts/migration/design-orders/
  src/
    01-snapshot-firebase.ts    Phase 1 — chụp dữ liệu Firebase (read-only)
    03-build-designer-map.ts   Phase 3 — map username → User.id (read-only)
    07-import-design-orders.ts Phase 7 — import chính (dry-run → apply)
    08-final-delta.ts          Phase 8 — kiểm tra delta cuối trước khi cutover
    lib/
      canonical-json.ts        canonical JSON + SHA-256
      firebase-types.ts        TypeScript types cho Firebase order
      salary-golden-ref.ts     Wrapper gọi TRACKER/src/utils/salary.js
  artifacts/
    environment-audit.md       Phase 0 report
    designer-map.json          Output của Phase 3
    snapshots/<RUN_ID>/        Output của Phase 1
    runs/<RUN_ID>/rollback.sql Output của Phase 7 --apply
```

## Env vars

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `FIREBASE_IMPORT_CREDENTIALS` | ✅ | Đường dẫn tuyệt đối đến `TRACKER/serviceAccountKey.json` |
| `DATABASE_URL` | ✅ | PostgreSQL connection string (staging trước, production sau) |
| `TRACKER_PATH` | ✅ Phase 7 | Đường dẫn thư mục TRACKER (để load `salary.js`) |

## Cách chạy

### Bước 1: Apply Prisma migration

```bash
cd backend
npx prisma migrate deploy
```

### Bước 2: Phase 1 — Snapshot Firebase (read-only, an toàn)

```bash
node --env-file=.env --import tsx scripts/migration/design-orders/src/01-snapshot-firebase.ts
```

### Bước 3: Phase 3 — Build designer map

```bash
node --env-file=.env --import tsx scripts/migration/design-orders/src/03-build-designer-map.ts
```

Kiểm tra output: `artifacts/designer-map.json`. Mọi designer phải `active_matched` hoặc `inactive_historical_matched`.

### Bước 4: Phase 7 — Dry-run import (STAGING)

```bash
# Test với 10 đơn đầu tiên
node --env-file=.env --import tsx scripts/migration/design-orders/src/07-import-design-orders.ts --limit=10

# Full dry-run
node --env-file=.env --import tsx scripts/migration/design-orders/src/07-import-design-orders.ts
```

### Bước 5: Phase 7 — Apply (sau khi đã xem xét dry-run)

```bash
# Staging
node --env-file=.env --import tsx scripts/migration/design-orders/src/07-import-design-orders.ts --apply

# Production (đổi DATABASE_URL trong .env thành production)
node --env-file=.env --import tsx scripts/migration/design-orders/src/07-import-design-orders.ts --apply
```

### Bước 6: Phase 8 — Final delta (trước khi tắt TRACKER)

```bash
# Kiểm tra delta (dry-run)
node --env-file=.env --import tsx scripts/migration/design-orders/src/08-final-delta.ts

# Nếu có delta, chạy lại Phase 7 --apply
```

## Rollback

```bash
# Xem file rollback đã tạo sau --apply
psql $DATABASE_URL -f scripts/migration/design-orders/artifacts/runs/<RUN_ID>/rollback.sql
```

## STOP GATEs

- **Phase 1**: Firebase project phải là `nha-yen-tracker`
- **Phase 3**: Mọi designer phải được map (unmatchedCount = 0)
- **Phase 7**: Cần `designer-map.json` đầy đủ + salary.js load được
