# Kế Hoạch Đồng Bộ Dữ Liệu Local → VPS

**Ngày:** 2026-08-16  
**Mục tiêu:** Cập nhật toàn bộ dữ liệu tin nhắn/media từ local lên VPS production

---

## 1. Phân Tích Hiện Trạng

### Dữ Liệu Local (Development)
```
Database size:     1915 MB
Conversations:     30,898 records
Messages:          1,045,058 records  
Media blobs:       975 files (192 MB)
Media assets:      975 records
Contacts:          41,078 records
Zalo accounts:     6 accounts (0904, 0779, 0777, 0786, 0913, 0818)

Date range:        2026-07-07 → 2026-08-16 12:53:23
MinIO storage:     /var/lib/docker/volumes/zalocrm_minio_data/_data
```

### Dữ Liệu VPS (Production)
```
Database size:     1591 MB
Conversations:     30,700 records  (-198 vs local)
Messages:          1,025,907 records  (-19,151 vs local)
Media blobs:       972 files (-3 vs local)
Media assets:      972 records
Contacts:          40,850 records (-228 vs local)
Zalo accounts:     6 accounts (SAME IDs as local)

Date range:        2026-07-07 → 2026-08-16 12:50:51
MinIO storage:     280K (hầu như trống)
```

### Delta Cần Đồng Bộ
```
Conversations:     ~198 records mới
Messages:          ~19,151 messages mới
Media blobs:       ~3 files mới (5 MB)
Contacts:          ~228 contacts mới
Media files:       ~192 MB cần sync từ MinIO
```

---

## 2. Rủi Ro & Vấn Đề

### ⚠️ RỦI RO CAO

**2.1 Conflict UUIDs**
- Cả local và VPS đều có 6 Zalo accounts với CÙNG UUIDs
- Nếu dump toàn bộ → conflict PRIMARY KEY
- **Nguyên nhân:** VPS đã được sync lần đầu vào Aug 14
- **Hậu quả:** Restore sẽ FAIL nếu không xử lý

**2.2 Foreign Key Dependencies**
- `messages` → `conversations` (conversation_id)
- `media_blobs` → `media_assets` (asset_id)
- `contacts` → `zalo_accounts` (zalo_account_id)
- Phải sync đúng thứ tự, không được thiếu parent records

**2.3 Media Files Mismatch**
- Database có 975 media_blobs records
- Nhưng MinIO trên VPS chỉ có 280K (gần như trống)
- **Vấn đề:** Nếu chỉ sync database, users sẽ thấy broken images

**2.4 Downtime**
- Restore database = stop application
- Với 1.9GB data, restore có thể mất 10-30 phút
- **Impact:** Staff không thể làm việc trong thời gian này

**2.5 Data Loss Risk**
- VPS đang chạy production, có tin nhắn MỚI từ 12:50:51 → hiện tại
- Nếu restore toàn bộ → mất data production mới
- **Critical:** Phải merge, không được overwrite

---

## 3. Chiến Lược Đồng Bộ

### ❌ **KHÔNG NÊN: Full Restore**
```bash
# KHÔNG LÀM NHƯ NÀY - SẼ MẤT DATA PRODUCTION
pg_dump local > backup.dump
pg_restore backup.dump > VPS  # ← Overwrite toàn bộ VPS
```
**Tại sao:** Mất data production mới, conflict UUIDs, downtime lâu

---

### ✅ **ĐỀ XUẤT: Incremental Merge Strategy**

#### **Phase 1: Preparation (1 hour)**

**1.1 Backup VPS trước khi làm**
```bash
ssh root@103.209.34.224 "
  docker exec zalo-crm-db pg_dump -U crmuser -Fc zalocrm > \
    /opt/zalocrm/backups/pre-sync-$(date +%Y%m%d-%H%M%S).dump
"
```

**1.2 Xác định cut-off timestamp**
```sql
-- Lấy timestamp cuối cùng trên VPS
SELECT MAX(created_at) FROM messages;  -- VPS: 2026-08-16 12:50:51

-- Set cut-off = 12:50:00 để có overlap buffer
CUT_OFF = '2026-08-16 12:50:00'
```

**1.3 Export incremental data từ local**
```bash
# Export conversations mới (created_at > cut-off)
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "
  COPY (
    SELECT * FROM conversations 
    WHERE created_at > '2026-08-16 12:50:00'
  ) TO STDOUT WITH CSV HEADER
" > conversations-new.csv

# Export messages mới
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "
  COPY (
    SELECT * FROM messages 
    WHERE created_at > '2026-08-16 12:50:00'
  ) TO STDOUT WITH CSV HEADER
" > messages-new.csv

# Export contacts mới
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "
  COPY (
    SELECT c.* FROM contacts c
    WHERE c.updated_at > '2026-08-16 12:50:00'
  ) TO STDOUT WITH CSV HEADER
" > contacts-new.csv

# Export media mới (last 3 files)
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "
  COPY (
    SELECT * FROM media_blobs 
    WHERE created_at > '2026-08-16 12:50:00'
  ) TO STDOUT WITH CSV HEADER
" > media-blobs-new.csv

docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "
  COPY (
    SELECT * FROM media_assets 
    WHERE created_at > '2026-08-16 12:50:00'
  ) TO STDOUT WITH CSV HEADER
" > media-assets-new.csv
```

---

#### **Phase 2: Media Sync (30 minutes)**

**2.1 Tar toàn bộ MinIO data từ local**
```bash
# Trên local
docker run --rm \
  -v zalocrm_minio_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/minio-data.tar.gz -C /data .

# Check size
ls -lh minio-data.tar.gz  # Expected: ~150-200 MB compressed
```

**2.2 Upload lên VPS**
```bash
scp minio-data.tar.gz root@103.209.34.224:/tmp/
```

**2.3 Extract vào MinIO trên VPS (KHÔNG stop container)**
```bash
ssh root@103.209.34.224 "
  # Stop MinIO tạm thời
  docker stop zalo-crm-minio
  
  # Extract data
  docker run --rm \
    -v zalocrm_minio_data:/data \
    -v /tmp:/backup \
    alpine tar xzf /backup/minio-data.tar.gz -C /data
  
  # Start MinIO
  docker start zalo-crm-minio
  
  # Verify
  docker exec zalo-crm-minio ls -lh /data
  
  # Cleanup
  rm /tmp/minio-data.tar.gz
"
```

**Downtime:** ~2-3 phút (chỉ MinIO, app vẫn chạy)

---

#### **Phase 3: Database Merge (15 minutes)**

**3.1 Upload CSV files lên VPS**
```bash
scp conversations-new.csv messages-new.csv contacts-new.csv \
    media-blobs-new.csv media-assets-new.csv \
    root@103.209.34.224:/tmp/
```

**3.2 Import vào VPS database**
```bash
ssh root@103.209.34.224 "
  # Import với ON CONFLICT DO NOTHING để skip duplicates
  
  # 1. Conversations
  docker exec -i zalo-crm-db psql -U crmuser -d zalocrm <<'SQL'
CREATE TEMP TABLE temp_conversations (LIKE conversations INCLUDING ALL);
COPY temp_conversations FROM '/tmp/conversations-new.csv' WITH CSV HEADER;
INSERT INTO conversations 
  SELECT * FROM temp_conversations
  ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_conversations;
SQL

  # 2. Messages
  docker exec -i zalo-crm-db psql -U crmuser -d zalocrm <<'SQL'
CREATE TEMP TABLE temp_messages (LIKE messages INCLUDING ALL);
COPY temp_messages FROM '/tmp/messages-new.csv' WITH CSV HEADER;
INSERT INTO messages 
  SELECT * FROM temp_messages
  ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_messages;
SQL

  # 3. Contacts
  docker exec -i zalo-crm-db psql -U crmuser -d zalocrm <<'SQL'
CREATE TEMP TABLE temp_contacts (LIKE contacts INCLUDING ALL);
COPY temp_contacts FROM '/tmp/contacts-new.csv' WITH CSV HEADER;
INSERT INTO contacts 
  SELECT * FROM temp_contacts
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = EXCLUDED.updated_at;
DROP TABLE temp_contacts;
SQL

  # 4. Media assets
  docker exec -i zalo-crm-db psql -U crmuser -d zalocrm <<'SQL'
CREATE TEMP TABLE temp_media_assets (LIKE media_assets INCLUDING ALL);
COPY temp_media_assets FROM '/tmp/media-assets-new.csv' WITH CSV HEADER;
INSERT INTO media_assets 
  SELECT * FROM temp_media_assets
  ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_media_assets;
SQL

  # 5. Media blobs
  docker exec -i zalo-crm-db psql -U crmuser -d zalocrm <<'SQL'
CREATE TEMP TABLE temp_media_blobs (LIKE media_blobs INCLUDING ALL);
COPY temp_media_blobs FROM '/tmp/media-blobs-new.csv' WITH CSV HEADER;
INSERT INTO media_blobs 
  SELECT * FROM temp_media_blobs
  ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_media_blobs;
SQL

  # Cleanup
  rm /tmp/*.csv
"
```

**Downtime:** ZERO (app vẫn chạy, chỉ lock tables tạm thời)

---

#### **Phase 4: Verification (10 minutes)**

**4.1 Check record counts**
```bash
ssh root@103.209.34.224 "
  docker exec zalo-crm-db psql -U crmuser -d zalocrm -t -c '
    SELECT 
      (SELECT COUNT(*) FROM conversations) as conversations,
      (SELECT COUNT(*) FROM messages) as messages,
      (SELECT COUNT(*) FROM media_blobs) as media_blobs,
      (SELECT COUNT(*) FROM contacts) as contacts;
  '
"
# Expected: 
# conversations: ~30,898 (hoặc hơn nếu có data mới từ production)
# messages: ~1,045,058
# media_blobs: ~975
# contacts: ~41,078
```

**4.2 Check MinIO files**
```bash
ssh root@103.209.34.224 "
  du -sh /var/lib/docker/volumes/zalocrm_minio_data/_data
  # Expected: ~200 MB (thay vì 280K)
  
  docker exec zalo-crm-minio ls -R /data | wc -l
  # Expected: ~900-1000 files
"
```

**4.3 Smoke test UI**
- Mở random conversation → check ảnh hiển thị
- Mở chat mới nhất → verify tin nhắn không bị mất
- Check media trong album → verify thumbnails load

---

## 4. Lịch Trình Thực Hiện

### **Đề Xuất: Tối nay (2026-08-16 22:00 - 23:30)**

**22:00 - 22:15** — Phase 1: Preparation
- Backup VPS
- Export incremental data từ local
- Tar MinIO data

**22:15 - 22:45** — Phase 2: Media Sync
- Upload minio-data.tar.gz (192 MB)
- Stop MinIO, extract, restart
- Downtime: 2-3 phút

**22:45 - 23:00** — Phase 3: Database Merge
- Upload CSV files
- Import vào VPS với ON CONFLICT
- Zero downtime

**23:00 - 23:10** — Phase 4: Verification
- Check counts
- Test UI
- Monitor errors

**23:10 - 23:30** — Monitoring
- Watch logs for 20 minutes
- Verify no broken images

---

## 5. Rollback Plan

**Nếu có vấn đề, rollback ngay:**

```bash
# 1. Stop application
docker compose stop app

# 2. Restore database backup
docker exec -i zalo-crm-db pg_restore -U crmuser -d zalocrm -v < \
  /opt/zalocrm/backups/pre-sync-YYYYMMDD-HHMMSS.dump

# 3. Restart application
docker compose up -d app

# Downtime: ~5 minutes
```

**Media rollback:** Không cần (MinIO merge không xóa file cũ)

---

## 6. Alternative: Script Tự Động

Thay vì manual, có thể viết script `sync-data.sh`:

```bash
#!/bin/bash
set -euo pipefail

# Config
VPS_HOST="root@103.209.34.224"
CUT_OFF="2026-08-16 12:50:00"
LOCAL_DB="zalo-crm-db"

echo "[1/4] Backing up VPS..."
ssh $VPS_HOST "docker exec zalo-crm-db pg_dump -U crmuser -Fc zalocrm > /opt/zalocrm/backups/pre-sync-\$(date +%Y%m%d-%H%M%S).dump"

echo "[2/4] Exporting incremental data from local..."
# ... (export commands)

echo "[3/4] Syncing media files..."
# ... (tar + scp + extract)

echo "[4/4] Merging database..."
# ... (CSV import)

echo "✅ Sync complete!"
```

---

## 7. Quyết Định Cần CTO

### ❓ **Câu Hỏi Cần Trả Lời:**

1. **Timeline:** 
   - ✅ Tối nay (22:00-23:30)?
   - ⏸️ Hoãn đến cuối tuần?

2. **Downtime:**
   - ✅ Chấp nhận 2-3 phút MinIO downtime?
   - ❌ Zero downtime (nhưng phức tạp hơn)?

3. **Scope:**
   - ✅ Sync incremental (chỉ data mới từ 12:50:00)?
   - 🔄 Sync full (overwrite toàn bộ, mất data production)?

4. **Script:**
   - ✅ Manual step-by-step (an toàn, dễ debug)?
   - 🤖 Automated script (nhanh nhưng rủi ro hơn)?

5. **Media Priority:**
   - ✅ Sync toàn bộ 192 MB MinIO?
   - 📦 Chỉ sync 3 files mới (5 MB)?

---

## 8. Đề Xuất của Em

**✅ Recommendation:**

- **Strategy:** Incremental merge (Phase 1-4 như trên)
- **Timeline:** Tối nay 22:00-23:30 (off-peak hours)
- **Downtime:** 2-3 phút MinIO only
- **Scope:** Sync full MinIO (192 MB) + incremental database
- **Approach:** Manual step-by-step (safer for first time)

**Lý do:**
- ✅ An toàn: Backup trước, không mất data production
- ✅ Nhanh: 1.5 giờ total, 2-3 phút downtime
- ✅ Verifiable: Check từng bước, rollback dễ dàng
- ✅ Complete: Media + database đều sync đủ

**Risk:** LOW (có backup, có rollback plan, test được trước)

---

**Anh xem và quyết định:**
1. Làm tối nay hay hoãn?
2. Chấp nhận 2-3 phút MinIO downtime?
3. Muốn manual hay script tự động?
