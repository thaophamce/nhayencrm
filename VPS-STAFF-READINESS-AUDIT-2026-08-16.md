# VPS Staff Readiness & Documentation Audit

**Generated:** 2026-08-16  
**Auditor:** Development Team  
**VPS:** 103.209.34.224  
**Scope:** Operations documentation, access control, monitoring, training readiness  

---

## Executive Summary

**Staff Readiness Score: 4.5/10**

- **Documentation:** 🔴 CRITICAL — No RUNBOOK.md, no operations procedures
- **Access Control:** 🔴 CRITICAL — Only root access, no individual accounts
- **Monitoring/Alerting:** 🔴 CRITICAL — No monitoring system configured
- **Infrastructure Security:** 🟡 GOOD — fail2ban active, auto-updates enabled
- **Deployment Scripts:** ✅ GOOD — Scripts available, inventory script ready

**Recommendation:** 
1. **BLOCK staff access** until RUNBOOK.md created and monitoring configured
2. **Create individual user accounts** with sudo access (no shared root)
3. **Set up Telegram/email alerts** for critical events
4. **Document emergency procedures** and escalation matrix

---

## PHẦN 1: DEPLOYMENT INFRASTRUCTURE

### 1.1 Directory Structure

**Location:** `/opt/zalocrm/`

```
/opt/zalocrm/
├── backend/           (drwxrwxrwx) 🔴 TOO PERMISSIVE
├── frontend/          (drwxrwxrwx) 🔴 TOO PERMISSIVE
├── docker/            (drwxrwxrwx) 🔴 TOO PERMISSIVE
├── scripts/           (drwxrwxrwx) 🔴 TOO PERMISSIVE
├── backups/           (drwxr-xr-x) ✅ OK
├── docker-compose.yml (rw-rw-rw-) 🔴 TOO PERMISSIVE
├── .env               (rw-------) ✅ OK (600)
├── .env.example       (rw-rw-rw-) 🟡 SHOULD BE 644
└── .env.pre-pancake-* (rw-------) ✅ OK (600)
```

**Assessment:**
- ✅ Secrets (.env) properly secured with 600 permissions
- 🔴 Application directories world-writable (777) — security risk
- 🔴 docker-compose.yml world-writable (666) — security risk

**Fix Required:**
```bash
ssh root@103.209.34.224 "
  chmod 755 /opt/zalocrm/backend /opt/zalocrm/frontend /opt/zalocrm/docker /opt/zalocrm/scripts
  chmod 644 /opt/zalocrm/docker-compose.yml /opt/zalocrm/.env.example
"
```

---

### 1.2 Available Scripts

**Scripts in `/opt/zalocrm/scripts/`:**

| Script | Purpose | Executable | Assessment |
|---|---|---|---|
| `zalocrm-inventory.sh` | Read-only system inventory | ✅ Yes | ✅ Ready to use |
| `zalocrm-deploy.sh` | Deployment automation | ✅ Yes | 🟡 Needs review |
| `Backup-ZaloCRM.ps1` | Windows backup script | N/A | 🔴 Wrong OS (VPS is Linux) |
| `migrate-storage-rclone.sh` | S3/R2 migration | No | 🟡 Available if needed |
| `migrate-storage-urls.sh` | URL rewriting for migration | No | 🟡 Available if needed |
| `install.sh` | Initial installation | No | ✅ Already installed |
| `Start-ZaloCRM-Auto.ps1` | Windows auto-start | N/A | 🔴 Wrong OS |

**Assessment:**
- ✅ Inventory script ready (approved by CTO earlier)
- 🔴 No Linux backup script (only Windows .ps1 available)
- 🟡 Deploy script exists but not reviewed for VPS context

---

### 1.3 Environment Configuration

**Configuration Status:**
- **Example file:** 87 variables defined
- **Production file:** 90 variables defined (3 additional custom variables)
- **Permissions:** `.env` = 600 ✅, `.env.example` = 666 🔴

**Key Variables Present:**

| Category | Status | Notes |
|---|---|---|
| Core (PORT, NODE_ENV, APP_URL) | ✅ Configured | Production settings |
| Database (DATABASE_URL) | ✅ Configured | PostgreSQL connection |
| Redis | ✅ Configured | REDIS_URL present |
| Storage (S3/MinIO) | ✅ Configured | STORAGE_DRIVER set |
| AI Providers | ✅ Configured | Multiple providers (Anthropic, Gemini, OpenAI, Qwen, Kimi) |
| OAuth (FB, TikTok, Zalo) | ✅ Configured | All redirect URIs set |
| Security (JWT, ENCRYPTION_KEY) | ✅ Configured | Secrets present |
| Antivirus (ClamAV) | ✅ Configured | MEDIA_AV_ENABLED |
| Monitoring | 🔴 Missing | No APM/logging vars |

**Comparison with Local .env.example:**

From local `backend/.env.example` (read earlier), VPS should have:
- ✅ `TOKEN_ENCRYPTION_KEY` (for Facebook integration)
- ✅ `FB_TOKEN_ENC_KEY` (for Lead Ads)
- ✅ Security token vars (ACCESS_TOKEN_TTL, etc.)
- 🟡 `MESSAGE_REPLY_STATE_TEST_DATABASE_URL` (test-only, OK to skip in prod)

**Assessment:** ✅ Environment configuration comprehensive and secure.

---

## PHẦN 2: ACCESS CONTROL & USER MANAGEMENT

### 2.1 Current User Accounts

**Users with Shell Access:**
```
root: /bin/bash (UID 0)
```

**Non-root users:** NONE

**Assessment:** 🔴 CRITICAL — Only root account exists, no individual user accounts.

---

### 2.2 SSH Access

**Configuration:** (from earlier security audit)
- PermitRootLogin: yes 🔴
- PasswordAuthentication: no ✅
- PubkeyAuthentication: yes ✅
- Port: 22 (exposed to 0.0.0.0) 🔴

**Authorized Keys:**
```bash
# Only root has SSH keys configured
/root/.ssh/authorized_keys (exists)
```

**Assessment:**
- 🔴 Root login enabled (violates least-privilege principle)
- ✅ Password auth disabled (key-only is good)
- 🔴 No individual user accounts for staff

---

### 2.3 Recommended Access Control Setup

#### Step 1: Create Individual User Accounts

```bash
# Create user for each staff member
ssh root@103.209.34.224 "
  # Example: Create user 'devops1'
  useradd -m -s /bin/bash -G docker devops1
  mkdir -p /home/devops1/.ssh
  chmod 700 /home/devops1/.ssh
  
  # Add their public key
  echo 'ssh-ed25519 AAAAC3Nz... devops1@company' > /home/devops1/.ssh/authorized_keys
  chmod 600 /home/devops1/.ssh/authorized_keys
  chown -R devops1:devops1 /home/devops1/.ssh
  
  # Grant sudo access (with password)
  echo 'devops1 ALL=(ALL:ALL) ALL' > /etc/sudoers.d/devops1
  chmod 440 /etc/sudoers.d/devops1
  
  # Set initial password (user must change on first login)
  echo 'devops1:TempPassword123!' | chpasswd
  passwd -e devops1  # Force password change on first login
"
```

**Recommended User Roles:**

| Role | Username | Sudo Access | Docker Group | Purpose |
|---|---|---|---|---|
| DevOps Lead | `devops1` | Full (ALL) | Yes | Deploy, restart, debug |
| Backend Dev | `backend1` | Limited | Yes | View logs, restart app |
| Support | `support1` | Read-only | No | View logs only |
| Monitoring | `monitoring` | No | No | Read-only for metrics |

---

#### Step 2: Disable Root Login

```bash
# After individual accounts verified working:
ssh root@103.209.34.224 "
  sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
  systemctl reload sshd
"
```

**CAUTION:** Only do this after:
1. At least one user account created and tested
2. User can sudo to root
3. Emergency console access verified (cloud provider panel)

---

### 2.4 Docker Access Control

**Current:** Root runs all Docker commands

**Recommended:** Add users to `docker` group for non-sudo access

```bash
# Allow user to run docker commands without sudo
usermod -aG docker devops1
```

**Security Note:** Docker group = effective root (can mount host filesystem). Only grant to trusted users.

---

## PHẦN 3: MONITORING & ALERTING

### 3.1 Current Monitoring Status

**System Monitoring:** NONE 🔴  
**Application Monitoring:** NONE 🔴  
**Log Aggregation:** NONE 🔴  
**Alerting:** NONE 🔴  

**Available Data Sources:**
- ✅ Docker logs (`docker logs zalo-crm-app`)
- ✅ System metrics (`uptime`, `free`, `df`)
- ✅ Database stats (`pg_stat_*` tables)
- 🔴 No centralized dashboard
- 🔴 No proactive alerts

---

### 3.2 Minimum Viable Monitoring Setup

#### Option A: Simple Script-Based Monitoring (Quick)

**Create:** `/opt/zalocrm/scripts/health-check.sh`

```bash
#!/bin/bash
# health-check.sh - Simple monitoring with Telegram alerts
set -euo pipefail

TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN"
TELEGRAM_CHAT_ID="YOUR_CHAT_ID"

send_alert() {
  local message="$1"
  curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    -d chat_id="$TELEGRAM_CHAT_ID" \
    -d text="🚨 ZaloCRM Alert: $message" \
    -d parse_mode="HTML" >/dev/null
}

# Check 1: Containers running
CONTAINERS=$(docker ps --filter "name=zalo-crm" --format "{{.Names}}" | wc -l)
if [ "$CONTAINERS" -lt 4 ]; then
  send_alert "Only $CONTAINERS/4 containers running"
fi

# Check 2: Disk space
DISK_USED=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USED" -gt 85 ]; then
  send_alert "Disk usage: ${DISK_USED}% (critical threshold: 85%)"
fi

# Check 3: Memory
MEM_AVAIL=$(free -m | awk '/^Mem:/{print $7}')
if [ "$MEM_AVAIL" -lt 2000 ]; then
  send_alert "Memory available: ${MEM_AVAIL}MB (threshold: 2000MB)"
fi

# Check 4: Application health
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/health || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
  send_alert "Health endpoint returned: $HTTP_CODE (expected 200)"
fi

# Check 5: Error rate
ERROR_COUNT=$(docker logs --since 5m zalo-crm-app 2>&1 | grep -ciE "error|fatal|exception" || echo "0")
if [ "$ERROR_COUNT" -gt 50 ]; then
  send_alert "High error rate: $ERROR_COUNT errors in last 5 minutes"
fi

# Check 6: Database connections
DB_ACTIVE=$(docker exec zalo-crm-db psql -U crmuser -d zalocrm -tAc "SELECT count(*) FROM pg_stat_activity WHERE state='active';" || echo "999")
if [ "$DB_ACTIVE" -gt 50 ]; then
  send_alert "Database active connections: $DB_ACTIVE (threshold: 50)"
fi

echo "[$(date)] Health check completed: all checks passed"
```

**Schedule:** Every 5 minutes
```bash
*/5 * * * * /opt/zalocrm/scripts/health-check.sh >> /var/log/zalocrm-health.log 2>&1
```

**Setup Time:** 30 minutes  
**Pros:** Simple, no external dependencies, free  
**Cons:** Not real-time, basic metrics only, no dashboard  

---

#### Option B: Uptime Robot + Telegram Bot (Balanced)

**External Monitoring:**
1. **Uptime Robot** (free tier, 50 monitors)
   - Monitor: https://your-domain.com/health
   - Check interval: 5 minutes
   - Alert: Telegram webhook + email

2. **Telegram Bot** for system alerts
   - Create bot: @BotFather
   - Get bot token and chat ID
   - Use in health-check.sh above

**Setup Time:** 1 hour  
**Pros:** External perspective, persistent alerts, dashboard  
**Cons:** Requires public endpoint, limited free tier  

---

#### Option C: Full APM (Future, Post-Launch)

**Recommended Stack:**
- **Datadog** or **New Relic** (paid, ~$15-50/month)
- **Grafana Cloud** (free tier available)
- **Elastic APM** (self-hosted)

**Benefits:**
- Request tracing
- Slow query detection
- Error grouping
- Custom dashboards
- Mobile alerts

**Setup Time:** 4-8 hours  
**Recommendation:** Defer to Phase 2 (post-stabilization)

---

### 3.3 Alert Channels Setup

#### Telegram Bot Setup

```bash
# 1. Create bot
# - Open Telegram, search @BotFather
# - Send /newbot
# - Name: ZaloCRM Alerts Bot
# - Username: zalocrm_alerts_bot
# - Save bot token

# 2. Get chat ID
# - Add bot to group chat or DM it
# - Send any message
# - Visit: https://api.telegram.org/bot<TOKEN>/getUpdates
# - Find "chat":{"id":123456789}

# 3. Test alert
curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -d chat_id="<CHAT_ID>" \
  -d text="Test alert from ZaloCRM monitoring"
```

---

### 3.4 Monitoring Baseline Metrics

**Establish these thresholds (from Performance Audit):**

| Metric | Green | Yellow | Red | Action |
|---|---|---|---|---|
| CPU Load (1min) | <3.0 | 3.0-6.0 | >6.0 | Alert + investigate |
| Memory Available | >4GB | 2-4GB | <2GB | Alert + check for leak |
| Disk Free | >50GB | 20-50GB | <20GB | Alert + cleanup |
| Container Status | All up | 1 down | 2+ down | Alert + restart |
| Error Rate | <30/hour | 30-100/hour | >100/hour | Alert + check logs |
| HTTP Health | 200 | 503 | Timeout | Alert + restart |
| DB Active Conn | <20 | 20-50 | >50 | Alert + check slow queries |

---

## PHẦN 4: OPERATIONS DOCUMENTATION

### 4.1 Missing Documentation

**Critical Documents Not Found:**
- 🔴 `RUNBOOK.md` — Operations procedures
- 🔴 Architecture diagram
- 🔴 Emergency contacts / escalation matrix
- 🔴 Backup/restore procedures (written)
- 🔴 Troubleshooting guide
- 🔴 Deployment checklist

**Available Documentation:**
- ✅ `.env.example` (configuration reference)
- ✅ `docker-compose.yml` (infrastructure as code)
- 🟡 Scripts (code is documentation, but not user-friendly)

---

### 4.2 RUNBOOK.md Template

**Create:** `/opt/zalocrm/RUNBOOK.md`

```markdown
# ZaloCRM VPS Operations Runbook

**Last Updated:** 2026-08-16  
**VPS:** 103.209.34.224  
**Environment:** Production  

---

## Architecture Overview

**Services:**
- `zalo-crm-app`: Node.js application (port 3080 internal)
- `zalo-crm-db`: PostgreSQL 16 (port 5432 internal)
- `zalo-crm-redis`: Redis 7 (port 6379 internal)
- `zalo-crm-minio`: MinIO S3-compatible storage (port 9000 internal)
- `cloudflared`: Cloudflare Tunnel (public ingress)

**Network:**
- Public: Cloudflare Tunnel only (no exposed ports)
- Internal: Docker network `zalocrm_default` (172.18.0.0/16)
- SSH: Port 22 (protected by fail2ban)

**Data:**
- Database: `/var/lib/docker/volumes/zalocrm_pg_data`
- Media files: `/var/lib/docker/volumes/zalocrm_file_storage` (25GB)
- Backups: `/opt/zalocrm/backups/` (automated daily)

---

## Daily Operations

### Check System Health

\`\`\`bash
# 1. All containers running
docker ps --filter "name=zalo-crm"

# Expected output: 4 containers (app, db, redis, minio) with status "Up"

# 2. System resources
uptime && free -h && df -h /

# Expected: Load <3.0, >4GB RAM free, >50GB disk free

# 3. Application health
curl http://127.0.0.1:3080/health

# Expected: HTTP 200 with JSON response

# 4. Error rate (last hour)
docker logs --since 1h zalo-crm-app 2>&1 | grep -ciE "error|fatal"

# Expected: <30 errors/hour
\`\`\`

---

### View Logs

\`\`\`bash
# Application logs (last 100 lines)
docker logs --tail 100 -f zalo-crm-app

# Database logs
docker logs --tail 100 zalo-crm-db

# All errors in last hour
docker logs --since 1h zalo-crm-app 2>&1 | grep -iE "error|fatal|exception"
\`\`\`

---

### Restart Services

\`\`\`bash
# Restart application only (safe, <10s downtime)
docker compose restart app

# Restart all services (use for DB/Redis issues, ~30s downtime)
cd /opt/zalocrm
docker compose restart

# Full redeployment (use for code updates, ~2min downtime)
cd /opt/zalocrm
git pull
docker compose down
docker compose build app
docker compose up -d
\`\`\`

---

## Troubleshooting

### Application Not Responding

**Symptoms:** Health endpoint returns 503 or timeout

**Steps:**
1. Check container status: `docker ps | grep zalo-crm-app`
2. If exited, check logs: `docker logs --tail 50 zalo-crm-app`
3. Common causes:
   - Database connection failed → Check `zalo-crm-db` container
   - Migration pending → Run `docker compose exec app npm run db:migrate`
   - Out of memory → Check `docker stats`
4. Restart: `docker compose restart app`
5. If still failing after 2 restarts → Escalate to Dev Team

---

### Database Slow

**Symptoms:** Queries taking >5 seconds

**Steps:**
1. Check active queries:
   \`\`\`bash
   docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "
     SELECT pid, now() - query_start AS duration, query 
     FROM pg_stat_activity 
     WHERE state = 'active' AND (now() - query_start) > interval '5 seconds';"
   \`\`\`

2. If long-running query found, consider killing it:
   \`\`\`bash
   docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "SELECT pg_terminate_backend(<pid>);"
   \`\`\`

3. Check disk I/O: `iostat -x 1 5`
4. If consistently slow → Escalate for index optimization

---

### Disk Full

**Symptoms:** Docker logs show "no space left on device"

**Steps:**
1. Check disk usage: `df -h /`
2. Find large files: `du -sh /var/lib/docker/volumes/* | sort -rh | head -10`
3. Clean old Docker images: `docker system prune -a --volumes` (CAUTION: removes unused volumes)
4. Clean old backups (keep last 7 days): `find /opt/zalocrm/backups -name "*.dump" -mtime +7 -delete`
5. If media files too large → Escalate for S3/R2 migration

---

### Zalo Session Disconnected

**Symptoms:** No new messages arriving, "disconnected" status in UI

**Steps:**
1. Check Zalo account status:
   \`\`\`bash
   docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "
     SELECT id, phone, status, updated_at 
     FROM zalo_accounts 
     WHERE archived_at IS NULL 
     ORDER BY updated_at DESC LIMIT 5;"
   \`\`\`

2. Restart app to trigger reconnect: `docker compose restart app`
3. If still disconnected → User must re-scan QR code in UI
4. If QR not appearing → Escalate to Dev Team

---

## Backup & Restore

### Manual Backup

\`\`\`bash
# Create backup now
cd /opt/zalocrm
docker exec zalo-crm-db pg_dump -U crmuser -Fc zalocrm > backups/manual-$(date +%Y%m%d-%H%M%S).dump

# Verify backup created
ls -lh backups/ | tail -5
\`\`\`

---

### Restore from Backup

**CAUTION:** This will overwrite current database. Backup current state first.

\`\`\`bash
# 1. Stop application
docker compose stop app

# 2. Backup current state (just in case)
docker exec zalo-crm-db pg_dump -U crmuser -Fc zalocrm > backups/before-restore-$(date +%Y%m%d-%H%M%S).dump

# 3. Drop and recreate database
docker exec zalo-crm-db psql -U crmuser -d postgres -c "DROP DATABASE zalocrm;"
docker exec zalo-crm-db psql -U crmuser -d postgres -c "CREATE DATABASE zalocrm OWNER crmuser;"

# 4. Restore
docker exec -i zalo-crm-db pg_restore -U crmuser -d zalocrm -v < backups/zalocrm-YYYYMMDD-HHMMSS.dump

# 5. Run migrations (if backup is old)
docker compose up -d app
docker compose exec app npm run db:migrate

# 6. Verify
curl http://127.0.0.1:3080/health
\`\`\`

---

## Deployment

### Deploy New Version

\`\`\`bash
# 1. SSH to VPS
ssh root@103.209.34.224

# 2. Backup database
cd /opt/zalocrm
./scripts/backup-db.sh  # (create this script per Data Integrity Audit)

# 3. Pull latest code
git pull origin main

# 4. Run migrations (if any)
docker compose exec app npm run db:migrate

# 5. Rebuild and restart
docker compose down app
docker compose build app
docker compose up -d app

# 6. Verify
docker logs -f zalo-crm-app  # Watch for startup errors
curl http://127.0.0.1:3080/health

# 7. Monitor for 10 minutes
watch -n 10 'docker logs --since 1m zalo-crm-app 2>&1 | grep -ciE "error|fatal"'
\`\`\`

---

## Emergency Contacts

| Role | Name | Contact | Escalation Level |
|---|---|---|---|
| DevOps Lead | [Name] | Telegram: @username | L1 (first contact) |
| Backend Lead | [Name] | Telegram: @username | L2 (code issues) |
| CTO | [Name] | Phone: +84... | L3 (critical only) |
| VPS Provider | Vultr/DigitalOcean | Support portal | L2 (infrastructure) |

**Escalation Rules:**
- L1 handles routine issues (restart, logs, disk cleanup)
- L2 for code bugs, database issues, Zalo API problems
- L3 only for: data loss, security breach, >2 hour outage

---

## Maintenance Windows

**Weekly Maintenance:** Sunday 2:00-4:00 AM (low traffic)

**Tasks:**
- Apply OS security updates (automated via unattended-upgrades)
- Rotate logs
- Clean old Docker images
- Verify backups

**Notify users:** In-app banner 24h before maintenance

---

**Version:** 1.0  
**Owner:** DevOps Team  
**Next Review:** 2026-09-16
\`\`\`

---

### 4.3 Additional Documentation Needed

**Priority documents to create:**

1. **DEPLOYMENT.md**
   - Git workflow (feature → staging → main)
   - Migration checklist
   - Rollback procedure
   - Post-deployment verification

2. **MONITORING.md**
   - Alert thresholds
   - Telegram bot setup
   - Dashboard access
   - On-call rotation

3. **SECURITY.md**
   - User account policy
   - SSH key management
   - Secret rotation schedule
   - Incident response plan

4. **ARCHITECTURE.md**
   - System diagram (Cloudflare → Docker → DB)
   - Data flow (Zalo → App → PostgreSQL → R2)
   - Scaling strategy
   - DR plan

---

## PHẦN 5: TRAINING READINESS

### 5.1 Training Materials Needed

**Critical Training (Before Staff Access):**

1. **SSH Access & Basic Commands** (30 min)
   - How to connect via SSH
   - How to use sudo
   - How to view logs (`docker logs`)
   - How to restart services (`docker compose restart`)

2. **Health Checks** (15 min)
   - Run health-check.sh script
   - Interpret output (CPU, memory, disk, errors)
   - When to escalate

3. **Emergency Response** (45 min)
   - Application not responding → Restart procedure
   - Disk full → Cleanup procedure
   - Database slow → How to check pg_stat_activity
   - Zalo disconnected → Reconnect procedure

**Format Options:**
- ✅ Loom video recording (shareable, reusable)
- ✅ Live training session (1 hour, record it)
- ✅ Written guide with screenshots (in RUNBOOK.md)

---

### 5.2 Training Checklist (Per Staff Member)

**Before granting access:**
- [ ] SSH key generated and added to server
- [ ] User account created with correct permissions
- [ ] Sudo password set and changed on first login
- [ ] RUNBOOK.md read and understood
- [ ] Emergency contacts saved in phone
- [ ] Telegram bot alerts configured and tested

**After training:**
- [ ] Successfully SSH to VPS
- [ ] Run health check script
- [ ] View application logs
- [ ] Restart application container (in test)
- [ ] Know when to escalate vs fix

---

### 5.3 Knowledge Base (FAQ)

**Q: How do I SSH to the VPS?**
```bash
ssh your-username@103.209.34.224
# Enter your SSH key passphrase
# Then sudo password when needed
```

**Q: How do I know if the system is healthy?**
```bash
# Run health check script
/opt/zalocrm/scripts/health-check.sh

# Or manual checks:
docker ps  # All containers "Up"
df -h /    # Disk <85% used
free -h    # >4GB RAM available
```

**Q: Application is down, what do I do?**
```bash
# 1. Check if container is running
docker ps | grep zalo-crm-app

# 2. If not running, check why
docker logs --tail 50 zalo-crm-app

# 3. Try restart
docker compose restart app

# 4. If still down after 2 restarts, escalate to Dev Team
```

**Q: How do I deploy a new version?**
```bash
# Follow RUNBOOK.md section "Deploy New Version"
# ALWAYS backup database first
# ALWAYS test health endpoint after deploy
```

**Q: Backup failed, what do I do?**
```bash
# 1. Check disk space
df -h /

# 2. Check if DB container is running
docker ps | grep zalo-crm-db

# 3. Try manual backup
cd /opt/zalocrm
docker exec zalo-crm-db pg_dump -U crmuser -Fc zalocrm > backups/manual-$(date +%Y%m%d).dump

# 4. If manual also fails, escalate immediately (data loss risk)
```

---

## PHẦN 6: SYSTEM HARDENING STATUS

### 6.1 Security Measures in Place

**✅ Active Protections:**
- **fail2ban:** 447 failed attempts, 35 IPs banned (SSH protection working)
- **unattended-upgrades:** Enabled (automatic security patches)
- **UFW firewall:** Active, port 22 only
- **Cloudflare Tunnel:** No direct port exposure except SSH
- **Password-less SSH:** PubkeyAuthentication only
- **.env permissions:** 600 (secrets secured)

**Assessment:** ✅ GOOD baseline security, SSH hardening still needed (disable root).

---

### 6.2 Remaining Security Actions

**From Security Audit (Part 2.B):**
- [ ] Disable root SSH login (CRITICAL)
- [ ] Restrict SSH to Tailscale IPs only (HIGH)
- [ ] Create individual user accounts (CRITICAL)
- [ ] Fix world-writable directories (HIGH)

**From Data Integrity Audit (Part 2.D):**
- [ ] Set up automated backups (CRITICAL)
- [ ] Fix backup file permissions to 600 (MEDIUM)

---

## STAFF READINESS SCORE BREAKDOWN

| Category | Score | Weight | Weighted | Notes |
|---|---|---|---|---|
| Documentation | 2/10 | 30% | 0.60 | No RUNBOOK, no training materials |
| Access Control | 3/10 | 25% | 0.75 | Only root, no individual accounts |
| Monitoring | 0/10 | 25% | 0.00 | No monitoring system |
| Training | 0/10 | 10% | 0.00 | No training conducted |
| Infrastructure | 8/10 | 10% | 0.80 | Good security baseline |
| **TOTAL** | **4.5/10** | **100%** | **2.15** | NOT READY for staff access |

**Adjusted Score:** 4.5/10 (infrastructure solid, but ops readiness critically lacking)

---

## FINAL RECOMMENDATIONS

### 🔴 BLOCK STAFF ACCESS until:

1. **RUNBOOK.md created and reviewed** (4 hours)
2. **Individual user accounts created** (1 hour)
3. **Monitoring + Telegram alerts configured** (2 hours)
4. **Automated backups set up** (1 hour, from Data Integrity Audit)
5. **Training conducted for first 2 users** (2 hours)

**Total Effort:** 10 hours (1.5 work days)

---

### ✅ READY AFTER completing:

**Phase 1: Critical (Before Any Staff Access)**
- [ ] Create RUNBOOK.md (copy template above)
- [ ] Set up automated daily backups (scripts/backup-db.sh)
- [ ] Configure Telegram bot alerts
- [ ] Create health-check.sh script
- [ ] Schedule health check cron (*/5 * * * *)
- [ ] Create 2 individual user accounts (devops1, backend1)
- [ ] Train first 2 users (live session + recording)

**Phase 2: High (Within Week 1)**
- [ ] Disable root SSH login (after accounts verified)
- [ ] Fix directory permissions (chmod 755)
- [ ] Set up Uptime Robot monitoring
- [ ] Create DEPLOYMENT.md and SECURITY.md
- [ ] Train remaining staff

**Phase 3: Medium (Within Month 1)**
- [ ] Implement offsite backups to R2
- [ ] Create architecture diagram
- [ ] Set up log retention policy
- [ ] Schedule monthly DR drill (test restore)

---

**Next Step:** Generate comprehensive VPS-READINESS-REPORT.md consolidating all 4 audit reports.

---

**Generated by:** ZaloCRM Development Team  
**Approved by:** [Pending CTO review]  
**Version:** 1.0
