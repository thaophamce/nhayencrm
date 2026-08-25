# Audit VPS Deployment & Feature Parity Check

**Mục đích:** Kiểm tra đồng bộ giữa local development và VPS production, đồng thời audit toàn diện hệ thống trước khi nhân sự làm việc.

---

## PHẦN 1: KIỂM TRA TÍNH NĂNG LOCAL CHƯA CÓ TRÊN VPS

### A. Cấu trúc kiểm tra

Sử dụng prompt sau cho Claude để quét toàn bộ codebase local và so sánh với VPS:

```
# CONTEXT
- Local repo: D:\CTY TNHH THIEP CUOI\CLAUDE\ZaloCRM
- VPS production: 103.209.34.224
- Mục tiêu: Tìm tính năng/fix local chưa deploy lên VPS

# TASK 1: Quét code thay đổi gần đây
1. Đọc git log từ ngày 2026-08-01 đến nay:
   - Liệt kê commit message và file thay đổi
   - Phân loại: feature mới / bug fix / performance / test / config
   
2. Kiểm tra database schema:
   - So sánh backend/prisma/schema.prisma local vs VPS
   - Liệt kê migration chưa chạy trên VPS (folder backend/prisma/migrations/)
   - Đặc biệt chú ý index, constraint và relation mới

3. Kiểm tra dependencies:
   - So sánh backend/package.json và frontend/package.json
   - Tìm package mới thêm hoặc version upgrade
   - Highlight package liên quan security/performance

# TASK 2: Quét tính năng nghiệp vụ
1. Backend routes mới:
   - Grep tất cả file *-routes.ts trong backend/src/modules/
   - Tìm endpoint mới (POST/GET/PUT/DELETE) được thêm gần đây
   - Kiểm tra middleware authentication/authorization mới

2. Frontend components mới:
   - Tìm file .vue được tạo hoặc sửa đổi lớn trong frontend/src/
   - Đặc biệt chú ý: views/, components/chat/, components/orders/
   - Tìm route mới trong frontend/src/router/

3. Integration mới:
   - Tìm biến môi trường mới trong backend/.env.example
   - Tìm credential/secret mới cần thiết
   - Kiểm tra module tích hợp: Zalo, Firebase, Pancake, AI, Telegram

# TASK 3: Performance & optimization
1. Tìm query optimization:
   - Index database mới (migration files)
   - Cache logic mới (Redis)
   - Query n+1 đã fix

2. Tìm background job mới:
   - BullMQ queue mới
   - Cron job mới
   - Worker logic thay đổi

# OUTPUT FORMAT
Tạo bảng Markdown:

| Hạng mục | Mô tả | Files liên quan | Ưu tiên | Cần action |
|---|---|---|---|---|
| Migration: order stats index | Thêm index org+month cho performance | backend/prisma/migrations/20260811102000_* | HIGH | Chạy migration |
| Feature: auto-search design orders | Tự động tìm đơn từ hội thoại | backend/src/modules/orders/, frontend/src/components/ | HIGH | Deploy code + test |
| ... | ... | ... | ... | ... |

**Ưu tiên:**
- CRITICAL: Ảnh hưởng security/data integrity
- HIGH: Feature nghiệp vụ quan trọng hoặc bug fix
- MEDIUM: Optimization, UX improvement
- LOW: Test, refactor, documentation

**Action:**
- Deploy code
- Chạy migration
- Cập nhật .env
- Restart service
- Test nghiệp vụ
```

---

## PHẦN 2: AUDIT TOÀN DIỆN VPS PRODUCTION

### B. Security Audit

Sử dụng prompt sau:

```
# SECURITY AUDIT VPS: 103.209.34.224

## TASK 1: Kiểm tra cấu hình hệ thống
SSH vào VPS và kiểm tra:

1. SSH security:
   - `sudo cat /etc/ssh/sshd_config | grep -E "(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|MaxAuthTries)"`
   - Xác nhận: Root login disabled, Password disabled, PubkeyAuthentication only
   
2. Firewall:
   - `sudo ufw status verbose`
   - Xác nhận: Chỉ mở port cần thiết, SSH chỉ qua Tailscale

3. User accounts:
   - `cat /etc/passwd | grep -E "bash|sh$"`
   - `sudo lastlog | head -20`
   - Tìm user không rõ nguồn gốc hoặc lần login lạ

4. Running processes:
   - `ps aux --sort=-%mem | head -20`
   - `ps aux --sort=-%cpu | head -20`
   - Tìm process lạ hoặc chiếm tài nguyên bất thường

5. Network connections:
   - `sudo netstat -tulpn | grep LISTEN`
   - Xác nhận: Không có port lạ listening
   
6. Scheduled tasks:
   - `sudo crontab -l`
   - `cat /etc/crontab`
   - `ls -la /etc/cron.d/`
   - Tìm cron job không rõ nguồn gốc

## TASK 2: Kiểm tra Docker stack
1. Container security:
   - `docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"`
   - Xác nhận: Không có container lạ, ports mapping đúng thiết kế

2. Docker image:
   - `docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"`
   - Highlight image không có tag hoặc quá cũ

3. Docker network:
   - `docker network ls`
   - `docker network inspect <network-name>`
   - Xác nhận network isolation đúng thiết kế

4. Volume và disk usage:
   - `docker system df -v`
   - Cảnh báo nếu disk usage > 70%

5. Container logs:
   - `docker logs --tail 100 zalo-crm-app 2>&1 | grep -iE "(error|fatal|exception|failed)"`
   - `docker logs --tail 100 zalo-crm-db 2>&1 | grep -iE "(error|fatal)"`
   - Highlight lỗi nghiêm trọng

## TASK 3: Kiểm tra secrets & credentials
1. Environment files:
   - `ls -la /path/to/app/.env*`
   - Xác nhận permission 600 hoặc 400, owner đúng

2. Secret trong container:
   - `docker exec zalo-crm-app env | grep -iE "(password|secret|key|token)" | wc -l`
   - Đếm số biến nhạy cảm, không in giá trị

3. Database credentials:
   - Xác nhận PostgreSQL không dùng default password
   - Xác nhận Redis có requirepass

4. Exposed secrets:
   - `docker exec zalo-crm-app find /app -name "*.env" -o -name "*.key" -o -name "*secret*"`
   - Cảnh báo nếu có file credential trong image

## OUTPUT
Tạo báo cáo:

### Security Score: ?/10

**CRITICAL Issues:**
- [ ] Item 1
- [ ] Item 2

**HIGH Issues:**
- [ ] Item 3

**MEDIUM Issues:**
- [ ] Item 4

**Recommendations:**
1. ...
2. ...
```

---

### C. Performance & Stability Audit

Sử dụng prompt sau:

```
# PERFORMANCE & STABILITY AUDIT

## TASK 1: Resource usage baseline
1. System metrics tại thời điểm check:
   - `uptime`
   - `free -h`
   - `df -h`
   - `iostat -x 1 5` (nếu có sysstat)

2. Docker stats:
   - `docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"`

3. Database size:
   - `docker exec zalo-crm-db psql -U <user> -d <db> -c "SELECT pg_size_pretty(pg_database_size(current_database()));"`
   - `docker exec zalo-crm-db psql -U <user> -d <db> -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 10;"`

## TASK 2: Application health
1. HTTP endpoints:
   - `curl -w "@curl-format.txt" -o /dev/null -s https://crm.domain.com/health`
   - Kiểm tra response time, status code

2. WebSocket:
   - Xác nhận Socket.IO hoạt động (từ frontend hoặc wscat)

3. Background jobs:
   - `docker exec zalo-crm-app cat /path/to/bullmq/queue/stats` (nếu có endpoint stats)
   - Kiểm tra job pending/failed

4. Error rate:
   - `docker logs --since 1h zalo-crm-app 2>&1 | grep -i error | wc -l`
   - Đếm số lỗi trong 1 giờ qua

## TASK 3: Bottleneck detection
1. Slow queries:
   - `docker exec zalo-crm-db psql -U <user> -d <db> -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds' AND state = 'active' ORDER BY duration DESC;"`

2. Missing indexes:
   - `docker exec zalo-crm-db psql -U <user> -d <db> -c "SELECT schemaname, tablename, attname, n_distinct, correlation FROM pg_stats WHERE schemaname='public' AND n_distinct > 100 ORDER BY n_distinct DESC LIMIT 20;"`
   - Highlight bảng lớn chưa có index phù hợp

3. Connection pool:
   - `docker exec zalo-crm-db psql -U <user> -d <db> -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"`
   - Cảnh báo nếu idle connection quá nhiều

## OUTPUT
Performance Report:

**Bottlenecks:**
- Database: ...
- App: ...
- Network: ...

**Resource headroom:**
- CPU: ?% available
- RAM: ?GB available
- Disk: ?GB available
- IOPS: ?% utilization

**Recommendations:**
1. Thêm index cho bảng X
2. Tăng connection pool
3. ...
```

---

### D. Data Integrity & Backup Audit

Sử dụng prompt sau:

```
# DATA INTEGRITY & BACKUP AUDIT

## TASK 1: Database integrity
1. Orphaned records:
   ```sql
   -- Kiểm tra message không có conversation
   SELECT COUNT(*) FROM messages m WHERE NOT EXISTS (SELECT 1 FROM conversations c WHERE c.id = m.conversation_id);
   
   -- Kiểm tra order không có contact
   SELECT COUNT(*) FROM orders o WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = o.contact_id);
   ```

2. Data consistency:
   ```sql
   -- Kiểm tra user không thuộc org nào
   SELECT COUNT(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = u.org_id);
   ```

3. Duplicate check:
   ```sql
   -- Tìm contact trùng phone trong cùng org
   SELECT phone, org_id, COUNT(*) FROM contacts WHERE phone IS NOT NULL GROUP BY phone, org_id HAVING COUNT(*) > 1;
   ```

## TASK 2: Backup validation
1. Backup files:
   - `ls -lh /path/to/backups/ | tail -10`
   - Xác nhận backup hằng ngày có chạy

2. Backup size trend:
   - So sánh kích thước backup 7 ngày gần nhất
   - Cảnh báo nếu thay đổi đột ngột (>30%)

3. Backup integrity:
   - `pg_restore --list /path/to/latest/backup.dump | head -20`
   - Xác nhận file backup không corrupt

4. Restore test (nếu có môi trường test):
   - Restore backup vào test database
   - Đếm số record quan trọng (users, conversations, orders)
   - So sánh với production

## TASK 3: Media storage
1. S3/R2/MinIO stats:
   - Tổng object count
   - Tổng dung lượng
   - So sánh với `media_blobs` table

2. Missing files:
   ```sql
   -- Tìm media_blobs không có file
   SELECT id, path, size_bytes FROM media_blobs WHERE path NOT IN (SELECT key FROM s3_list);
   ```
   (Cần script query S3)

## OUTPUT
Data Health Report:

**Integrity Issues:**
- Orphaned records: ?
- Inconsistent relations: ?
- Duplicates: ?

**Backup Status:**
- Last successful: YYYY-MM-DD HH:MM
- Backup size: ?GB
- Oldest backup: ? days ago
- Restore test: PASS/FAIL

**Media Storage:**
- Objects: ?
- Size: ?GB
- Missing: ?
```

---

## PHẦN 3: CHUẨN BỊ CHO NHÂN SỰ

### E. Documentation & Access Setup

Sử dụng prompt sau:

```
# NHÂN SỰ ONBOARDING PREPARATION

## TASK 1: Tạo runbook vận hành
Tạo file RUNBOOK.md với nội dung:

1. Thông tin VPS:
   - IP, hostname, region
   - Cách truy cập (Tailscale, SSH key)
   - Emergency console

2. Kiến trúc hệ thống:
   - Sơ đồ services (app, db, redis, minio, cloudflared)
   - Network topology
   - Port mapping

3. Quy trình thường ngày:
   - Kiểm tra health: `docker ps`, `docker logs`
   - Restart service: `docker compose restart <service>`
   - Kiểm tra disk: `df -h`
   - Kiểm tra logs: `docker logs --tail 100 zalo-crm-app`

4. Xử lý sự cố:
   - App không response → Check logs → Restart
   - Database slow → Check slow queries
   - Disk đầy → Clean logs, rotate backup
   - Zalo disconnect → Check listener logs

5. Backup & restore:
   - Lệnh backup thủ công
   - Lệnh restore
   - Vị trí backup files

## TASK 2: Access control checklist
- [ ] Tạo user riêng cho từng nhân sự (không dùng chung root)
- [ ] Phân quyền sudo theo nhu cầu
- [ ] Thêm SSH public key cho từng người
- [ ] Cấu hình Tailscale cho từng device
- [ ] Thiết lập 2FA cho dashboard quản lý (nếu có)
- [ ] Tạo read-only database user cho analyst/report
- [ ] Giới hạn quyền Docker (nếu cần)

## TASK 3: Monitoring & alerting setup
- [ ] Uptime Robot hoặc tương đương đã bật
- [ ] Telegram alert bot đã config
- [ ] Disk usage alert (>70%, >85%, >95%)
- [ ] Memory alert (>90%)
- [ ] Container restart alert
- [ ] Backup failure alert
- [ ] Zalo session disconnect alert
- [ ] HTTP 5xx spike alert

## TASK 4: Training material
Tạo video hoặc document:
1. Cách SSH vào VPS
2. Cách đọc logs
3. Cách restart service an toàn
4. Cách kiểm tra Zalo session status
5. Cách trigger manual backup
6. Ai gọi khi gặp vấn đề gì (escalation matrix)

## OUTPUT
Checklist:

**Infrastructure:**
- [ ] VPS access documented
- [ ] Runbook complete
- [ ] Emergency procedures clear

**Security:**
- [ ] Individual accounts created
- [ ] SSH keys distributed
- [ ] Sudo permissions reviewed
- [ ] Secrets documented in 1Password/Bitwarden

**Monitoring:**
- [ ] All alerts configured
- [ ] Alert channels tested
- [ ] On-call rotation defined

**Training:**
- [ ] Documentation complete
- [ ] Training session scheduled
- [ ] Q&A log started
```

---

## CÁCH SỬ DỤNG BỘ PROMPT NÀY

### Bước 1: Chạy từng phần tuần tự
1. Copy prompt Phần 1 (Feature Parity Check) → Paste cho Claude
2. Đợi output hoàn chỉnh → Review → Note các action cần làm
3. Copy prompt Phần 2.B (Security Audit) → Paste cho Claude
4. Lặp lại cho 2.C, 2.D, 3.E

### Bước 2: Tổng hợp kết quả
Tạo file `VPS-READINESS-REPORT.md`:

```markdown
# VPS Production Readiness Report
Date: YYYY-MM-DD
Auditor: [Tên]

## Executive Summary
- Overall Score: ?/10
- Critical Issues: ?
- Ready for staff: YES/NO

## Feature Parity
[Paste kết quả Phần 1]

## Security
[Paste kết quả Phần 2.B]

## Performance
[Paste kết quả Phần 2.C]

## Data Integrity
[Paste kết quả Phần 2.D]

## Staff Readiness
[Paste kết quả Phần 3.E]

## Action Items (Priority Order)
1. [ ] CRITICAL: ...
2. [ ] HIGH: ...
3. [ ] MEDIUM: ...

## Sign-off
- [ ] CTO reviewed
- [ ] All CRITICAL issues resolved
- [ ] Staff training complete
- [ ] Ready for production handover
```

### Bước 3: Execute action items
Không cho nhân sự làm việc trên VPS cho đến khi:
- Tất cả CRITICAL issues đã fix
- Tất cả HIGH issues có kế hoạch fix rõ ràng
- Monitoring và alerting hoạt động
- Backup đã được kiểm chứng restore thành công
- Runbook và training hoàn tất

---

## LƯU Ý QUAN TRỌNG

1. **Không chạy blind:** Đọc kỹ từng câu lệnh audit trước khi chạy. Một số lệnh có thể gây load database.

2. **Giờ chạy audit:** Nên chạy ngoài giờ cao điểm để tránh ảnh hưởng performance.

3. **Backup trước audit:** Luôn có backup mới nhất trước khi chạy bất kỳ audit query nào.

4. **Credentials:** Không paste output chứa password/token vào chat hoặc file không mã hóa.

5. **Staging first:** Nếu có thể, test các audit query trên staging trước khi chạy production.

---

**Version:** 1.0  
**Last updated:** 2026-08-16  
**Owner:** CTO / DevOps Lead
