# VPS Security Audit Report

**Generated:** 2026-08-16  
**Auditor:** Development Team  
**VPS:** 103.209.34.224  
**Scope:** Production security posture assessment  

---

## Executive Summary

**Security Score: 6.5/10**

- **CRITICAL Issues:** 1 (root SSH login enabled)
- **HIGH Issues:** 3 (SSH exposed, transaction timeouts, foreign key violations)
- **MEDIUM Issues:** 2 (MinIO image outdated, single authorized key)
- **GOOD Practices:** 6 (firewall active, app ports localhost-only, fail2ban running, secrets not in image, auto-updates enabled, proper key permissions)

**Recommendation:** Fix CRITICAL issue (disable root SSH) before allowing staff access. HIGH issues are operational (not security-blocking) but should be addressed within 48h.

---

## PHẦN 1: HỆ THỐNG BẢO MẬT

### ⚠️ CRITICAL Issues

#### 1. Root SSH Login Enabled

**Finding:**
```bash
PermitRootLogin yes
```

**Risk:** Attackers can brute-force or exploit vulnerabilities to gain root access directly. This is the #1 vector for VPS compromise.

**Remediation:**
```bash
# 1. Tạo user riêng với sudo
ssh root@103.209.34.224
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# 2. Test login bằng user mới
ssh deploy@103.209.34.224 sudo whoami
# Expected: root

# 3. Disable root login
sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# 4. Verify
grep PermitRootLogin /etc/ssh/sshd_config
# Expected: PermitRootLogin no
```

**Priority:** CRITICAL — phải fix trước khi staff access

---

### 🔴 HIGH Issues

#### 2. SSH Port Exposed to Internet

**Finding:**
```bash
Port 22 open: 0.0.0.0:22 (IPv4) and :::22 (IPv6)
UFW allows from anywhere
```

**Risk:** Port 22 là target phổ biến nhất cho botnet brute-force. Mặc dù có fail2ban, vẫn tạo noise và risk.

**Current Mitigations:**
- ✅ fail2ban đang chạy
- ✅ Chỉ 1 authorized key
- ✅ Key-based auth (PasswordAuthentication NO)

**Recommended Hardening (chọn 1 trong 3):**

**Option A: Tailscale-only SSH (recommended)**
```bash
# 1. Cài Tailscale trên VPS (nếu chưa có)
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up

# 2. UFW chặn SSH từ internet, chỉ cho phép từ Tailscale
ufw delete allow 22/tcp
ufw allow in on tailscale0 to any port 22 proto tcp
ufw reload

# 3. Test SSH qua Tailscale IP
ssh root@<tailscale-ip>
```

**Option B: Port knocking**
```bash
# Cài knockd, cấu hình sequence để mở port 22 tạm thời
apt install knockd
# Config: /etc/knockd.conf
```

**Option C: Whitelist IP (nếu có static IP)**
```bash
ufw delete allow 22/tcp
ufw allow from <office-ip> to any port 22 proto tcp
ufw allow from <home-ip> to any port 22 proto tcp
ufw reload
```

**Priority:** HIGH — không block deployment nhưng nên fix trong 48h

---

#### 3. Transaction Timeout Errors (Operational)

**Finding:**
```
[ERROR] [autotags-dirty] Transaction API error: timeout 5000ms, actual 9743ms
[ERROR] [autotags-dirty] Transaction API error: timeout 5000ms, actual 7805ms
```

**Impact:** Autotags background job đang fail 2 lần/5 phút. Không ảnh hưởng trực tiếp security nhưng có thể mask các vấn đề nghiêm trọng hơn.

**Root Cause:** Transaction quá dài hoặc database lock contention.

**Remediation:**
```typescript
// backend/src/modules/contacts/autotags-service.ts
// Tăng timeout hoặc giảm batch size
const result = await prisma.$transaction(async (tx) => {
  // ...
}, {
  timeout: 15000, // tăng từ 5000 lên 15000
});
```

**Priority:** HIGH (operational) — fix sau khi deploy migrations mới

---

#### 4. Foreign Key Constraint Violations (Data Integrity)

**Finding:**
```
ERROR: insert or update on table "media_usage_events" violates foreign key constraint 
"media_usage_events_media_asset_id_fkey"
```

**Frequency:** 10+ lần trong 50 dòng log gần nhất (15:19–15:20)

**Impact:** Application code đang cố gắng tạo media_usage_events cho media_asset_id không tồn tại. Có thể là race condition hoặc logic bug.

**Investigation Needed:**
```sql
-- Kiểm tra orphaned events
SELECT COUNT(*) 
FROM media_usage_events mue
WHERE NOT EXISTS (
  SELECT 1 FROM media_assets ma WHERE ma.id = mue.media_asset_id
);

-- Tìm asset_id bị reference nhầm
SELECT DISTINCT media_asset_id 
FROM media_usage_events 
WHERE media_asset_id NOT IN (SELECT id FROM media_assets)
LIMIT 10;
```

**Remediation:**
1. Debug code gọi media_usage_events (có thể trong media-routes.ts)
2. Thêm existence check trước khi insert
3. Xem xét soft-delete cho media_assets thay vì hard-delete

**Priority:** HIGH (data integrity) — cần investigate trong 24-48h

---

### 🟡 MEDIUM Issues

#### 5. MinIO Image Outdated

**Finding:**
```
minio/minio   latest   241MB   2025-09-07 (11 tháng cũ)
minio/mc      latest   117MB   2025-09-07 (11 tháng cũ)
```

**Risk:** MinIO phát hành security patches thường xuyên. Image cũ 11 tháng có thể chứa CVE đã patch.

**Remediation:**
```bash
cd /path/to/app
docker compose pull minio mc
docker compose up -d minio
```

**Priority:** MEDIUM — update trong maintenance window tuần tới

---

#### 6. Single Authorized SSH Key

**Finding:**
```
1 key in /root/.ssh/authorized_keys (ssh-ed25519 ...cursor)
```

**Risk:** Nếu private key bị mất/lộ và không có backup access, sẽ bị lock khỏi VPS (cần console recovery).

**Recommendation:**
- Thêm 1 backup key (stored securely offline)
- Hoặc enable password-based emergency console access (qua provider dashboard)

**Priority:** MEDIUM — không gấp nhưng nên có backup plan

---

## PHẦN 2: DOCKER & APPLICATION SECURITY

### ✅ Good Practices

#### 1. Application Ports Localhost-Only

**Finding:**
```bash
127.0.0.1:3080 → app
127.0.0.1:5432 → postgres
127.0.0.1:6379 → redis
127.0.0.1:9000 → minio
127.0.0.1:9001 → minio console
```

**Assessment:** ✅ EXCELLENT — No application ports exposed to internet. All traffic goes through Cloudflare Tunnel.

---

#### 2. Cloudflare Tunnel Configured

**Finding:**
```bash
cloudflared running: tunnel to http://127.0.0.1:3080
```

**Assessment:** ✅ GOOD — Zero-trust ingress, no direct port exposure for HTTP/HTTPS.

---

#### 3. Firewall Active

**Finding:**
```bash
UFW: active
Default: deny (incoming), allow (outgoing)
Only port 22/tcp allowed
```

**Assessment:** ✅ GOOD — Minimal attack surface.

---

#### 4. fail2ban Running

**Finding:**
```bash
fail2ban-server running (PID 694)
```

**Assessment:** ✅ GOOD — Auto-ban brute-force attempts.

---

#### 5. No Credential Files in Volumes

**Finding:**
```bash
find /var/lib/docker/volumes/zalocrm_app-data/_data -name '*.env' -o -name '*.key'
# No results
```

**Assessment:** ✅ GOOD — Secrets passed via environment variables, not files in image.

---

#### 6. Proper SSH Key Permissions

**Finding:**
```bash
drwx------ /root/.ssh/
-rw------- /root/.ssh/authorized_keys
```

**Assessment:** ✅ GOOD — Correct permissions (700 for dir, 600 for file).

---

#### 7. Automatic Security Updates Enabled

**Finding:**
```bash
unattended-upgrades: enabled
```

**Assessment:** ✅ GOOD — System packages auto-update for security patches.

---

## PHẦN 3: SECRETS MANAGEMENT

### Environment Variables Audit

**Found 21 sensitive variables in app container:**
- DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, TOKEN_ENCRYPTION_KEY
- S3_ACCESS_KEY, S3_SECRET_KEY, MINIO_ROOT_PASSWORD
- FB_APP_SECRET, FB_TOKEN_ENC_KEY, FB_WEBHOOK_VERIFY_TOKEN
- TIKTOK_APP_SECRET, TIKTOK_WEBHOOK_VERIFY_TOKEN
- ZALO_OA_APP_SECRET
- PANCAKE_POS_API_KEY, TELEGRAM_BRIDGE_BOT_TOKEN
- ANTHROPIC_AUTH_TOKEN, OPENAI_AUTH_TOKEN, GEMINI_AUTH_TOKEN, QWEN_AUTH_TOKEN, KIMI_AUTH_TOKEN

**Assessment:** ✅ Secrets properly injected via Docker env (not hardcoded in image).

**Recommendations:**
1. ✅ DONE: Secrets không in ra logs (đã redact khi audit)
2. TODO: Rotate FB_APP_SECRET và ZALO_OA_APP_SECRET nếu từng commit vào git history
3. TODO: Xem xét dùng Docker secrets hoặc Vault cho production-grade secret management (phase 2)

---

## PHẦN 4: CONTAINER IMAGE SECURITY

### Image Inventory

| Image | Tag | Size | Age | Assessment |
|---|---|---|---|---|
| zalocrm-app | latest | 1.43GB | 2026-08-16 (today) | ✅ Fresh build |
| postgres | 16-alpine | 420MB | 2026-08-13 (3 days) | ✅ Recent |
| redis | 7-alpine | 57.8MB | 2026-07-26 (21 days) | ✅ Acceptable |
| minio/minio | latest | 241MB | 2025-09-07 (11 months) | 🟡 Outdated |
| minio/mc | latest | 117MB | 2025-09-07 (11 months) | 🟡 Outdated |

**Node.js Version:** v22.23.2 (latest LTS) ✅  
**npm Version:** 10.9.8 ✅

---

## PHẦN 5: NETWORK TOPOLOGY

### Docker Network

**Network:** zalocrm_default (bridge)  
**Subnet:** 172.18.0.0/16  
**Containers:** app, db, redis, minio (all on same private network)

**Assessment:** ✅ GOOD — Internal service communication isolated from host network.

---

### External Access

**Ingress:** Cloudflare Tunnel (cloudflared) → 127.0.0.1:3080  
**SSH:** Port 22 → 0.0.0.0 (⚠️ exposed to internet)  
**Application ports:** All on 127.0.0.1 ✅

---

## PHẦN 6: USER ACCOUNTS & ACCESS

### System Users

**Shell users:** Only root  
**Last login:** Aug 14 15:07 from 103.153.69.46

**Assessment:** 
- 🟡 MEDIUM: No non-root user for day-to-day operations
- ✅ GOOD: No suspicious users

**Recommendation:** Tạo `deploy` user với sudo (xem remediation section ở đầu).

---

## PHẦN 7: SCHEDULED TASKS

### Cron Jobs

**Checked:**
- `/etc/crontab` — only system defaults
- `crontab -l` — no root crontab
- `/etc/cron.d/` — standard system crons

**Assessment:** ✅ GOOD — No suspicious scheduled tasks.

---

## ACTIONABLE REMEDIATION PLAN

### Giai đoạn 1: Trước khi staff access (BẮT BUỘC)

**Thời gian:** 30 phút  
**Impact:** Không downtime

1. **[CRITICAL] Disable root SSH login**
   ```bash
   # Chạy script remediation ở phần "Root SSH Login Enabled"
   # Test kỹ bằng user mới trước khi disable root
   ```

2. **[HIGH] Restrict SSH to Tailscale**
   ```bash
   # Option A: Tailscale-only (recommended)
   # Chạy script ở phần "SSH Port Exposed"
   ```

**Acceptance Criteria:**
- [ ] Login bằng `deploy` user thành công
- [ ] `sudo` hoạt động cho `deploy` user
- [ ] Root login bị reject: `Permission denied (publickey).`
- [ ] SSH chỉ accessible qua Tailscale IP

---

### Giai đoạn 2: Sau deployment (48h)

**Thời gian:** 2 giờ  
**Impact:** Maintenance window (off-peak hours)

1. **[HIGH] Fix transaction timeouts**
   - Deploy code tăng timeout autotags transaction
   - Monitor logs 24h sau deploy

2. **[HIGH] Investigate foreign key violations**
   - Run diagnostic queries
   - Fix media_usage_events logic
   - Deploy hotfix nếu cần

3. **[MEDIUM] Update MinIO**
   ```bash
   docker compose pull minio mc
   docker compose up -d minio
   ```

4. **[MEDIUM] Add backup SSH key**
   - Generate new ed25519 key
   - Add to `/home/deploy/.ssh/authorized_keys`
   - Store private key in 1Password/vault

---

### Giai đoạn 3: Hardening nâng cấp (tuần tới)

**Optional improvements:**

1. **Security headers** (nếu chưa có):
   ```typescript
   // backend: thêm helmet middleware
   app.use(helmet({
     contentSecurityPolicy: false, // CSP_MODE đã handle
     hsts: { maxAge: 31536000, includeSubDomains: true },
   }));
   ```

2. **Rate limiting** (nếu chưa có):
   ```typescript
   // backend: thêm rate limit cho API
   import rateLimit from '@fastify/rate-limit';
   app.register(rateLimit, {
     max: 100,
     timeWindow: '1 minute',
   });
   ```

3. **Docker secrets migration**:
   - Chuyển từ env vars sang Docker secrets
   - Requires Docker Swarm hoặc Kubernetes (defer đến phase 2)

4. **Vulnerability scanning**:
   ```bash
   # Cài Trivy
   apt install trivy
   
   # Scan images
   trivy image zalocrm-app:latest
   trivy image postgres:16-alpine
   ```

---

## MONITORING REQUIREMENTS

Sau khi fix CRITICAL issues, monitor 24h:

### Security Metrics

- [ ] SSH failed login attempts: `journalctl -u ssh | grep 'Failed password'`
- [ ] fail2ban bans: `fail2ban-client status sshd`
- [ ] Unauthorized sudo attempts: `grep sudo /var/log/auth.log`
- [ ] Docker container restarts: `docker ps -a --filter 'status=restarted'`

### Application Metrics

- [ ] Transaction timeout errors: `docker logs zalo-crm-app | grep 'Transaction API error'`
- [ ] Foreign key violations: `docker logs zalo-crm-db | grep 'violates foreign key'`
- [ ] HTTP 5xx rate: (từ Cloudflare dashboard)
- [ ] Database connection pool: `docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"`

---

## SECURITY CHECKLIST SUMMARY

### ✅ Pass (6 items)
- [x] Application ports localhost-only
- [x] Cloudflare Tunnel configured
- [x] Firewall active (UFW)
- [x] fail2ban running
- [x] Secrets not in image/volumes
- [x] SSH key permissions correct
- [x] Automatic security updates enabled

### ⚠️ Must Fix Before Staff Access (1 item)
- [ ] Disable root SSH login → create deploy user

### 🔴 Fix Within 48h (3 items)
- [ ] Restrict SSH to Tailscale-only
- [ ] Fix transaction timeout errors
- [ ] Investigate & fix foreign key violations

### 🟡 Fix Within 1 Week (2 items)
- [ ] Update MinIO images
- [ ] Add backup SSH key

---

## FINAL SCORE BREAKDOWN

| Category | Score | Weight | Weighted |
|---|---|---|---|
| Network Security | 7/10 | 25% | 1.75 |
| Access Control | 5/10 | 30% | 1.50 |
| Secrets Management | 8/10 | 20% | 1.60 |
| Container Security | 7/10 | 15% | 1.05 |
| Monitoring & Updates | 7/10 | 10% | 0.70 |
| **TOTAL** | **6.6/10** | **100%** | **6.60** |

**Adjusted Score:** 6.5/10 (rounded)

---

**Next Step:** Chạy Performance & Stability Audit (Phần 2.C).

---

**Generated by:** ZaloCRM Development Team  
**Approved by:** [Pending CTO review]  
**Version:** 1.0
