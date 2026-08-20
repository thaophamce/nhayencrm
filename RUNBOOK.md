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
- Backups: `/opt/zalocrm/backups/` (automated daily at 2 AM)

---

## Daily Operations

### Check System Health

```bash
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
```

---

### View Logs

```bash
# Application logs (last 100 lines)
docker logs --tail 100 -f zalo-crm-app

# Database logs
docker logs --tail 100 zalo-crm-db

# All errors in last hour
docker logs --since 1h zalo-crm-app 2>&1 | grep -iE "error|fatal|exception"
```

---

### Restart Services

```bash
# Restart application only (safe, <10s downtime)
docker compose restart app

# Restart all services (use for DB/Redis issues, ~30s downtime)
cd /opt/zalocrm
docker compose restart

# Full redeployment (use for code updates, ~2min downtime)
cd /opt/zalocrm
docker compose down
docker compose up -d
```

---

## Troubleshooting

### Application Not Responding

**Symptoms:** Health endpoint returns 503 or timeout

**Steps:**
1. Check container status: `docker ps | grep zalo-crm-app`
2. If exited, check logs: `docker logs --tail 50 zalo-crm-app`
3. Common causes:
   - Database connection failed → Check `zalo-crm-db` container
   - Out of memory → Check `docker stats`
4. Restart: `docker compose restart app`
5. If still failing after 2 restarts → Escalate to Dev Team

---

### Database Slow

**Symptoms:** Queries taking >5 seconds

**Steps:**
1. Check active queries:
   ```bash
   docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "
     SELECT pid, now() - query_start AS duration, query 
     FROM pg_stat_activity 
     WHERE state = 'active' AND (now() - query_start) > interval '5 seconds';"
   ```

2. If long-running query found, consider killing it:
   ```bash
   docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "SELECT pg_terminate_backend(<pid>);"
   ```

3. Check disk I/O: `iostat -x 1 5` (if available)
4. If consistently slow → Escalate for index optimization

---

### Disk Full

**Symptoms:** Docker logs show "no space left on device"

**Steps:**
1. Check disk usage: `df -h /`
2. Find large files: `du -sh /var/lib/docker/volumes/* | sort -rh | head -10`
3. Clean old Docker images: `docker system prune -a` (CAUTION: removes unused images)
4. Clean old backups (keep last 7 days): `find /opt/zalocrm/backups -name "*.dump" -mtime +7 -delete`
5. If media files too large → Escalate for S3/R2 migration

---

### Zalo Session Disconnected

**Symptoms:** No new messages arriving, "disconnected" status in UI

**Steps:**
1. Check Zalo account status:
   ```bash
   docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "
     SELECT id, phone, status, updated_at 
     FROM zalo_accounts 
     WHERE archived_at IS NULL 
     ORDER BY updated_at DESC LIMIT 5;"
   ```

2. Restart app to trigger reconnect: `docker compose restart app`
3. If still disconnected → User must re-scan QR code in UI
4. If QR not appearing → Escalate to Dev Team

---

## Backup & Restore

### Manual Backup

```bash
# Create backup now
cd /opt/zalocrm
./scripts/backup-db.sh

# Or manually:
docker exec zalo-crm-db pg_dump -U crmuser -Fc zalocrm > backups/manual-$(date +%Y%m%d-%H%M%S).dump

# Verify backup created
ls -lh backups/ | tail -5
```

**Automated backup:** Daily at 2 AM via cron (check: `crontab -l`)

---

### Restore from Backup

**CAUTION:** This will overwrite current database. Backup current state first.

```bash
# 1. Stop application
docker compose stop app

# 2. Backup current state (just in case)
docker exec zalo-crm-db pg_dump -U crmuser -Fc zalocrm > backups/before-restore-$(date +%Y%m%d-%H%M%S).dump

# 3. Drop and recreate database
docker exec zalo-crm-db psql -U crmuser -d postgres -c "DROP DATABASE zalocrm;"
docker exec zalo-crm-db psql -U crmuser -d postgres -c "CREATE DATABASE zalocrm OWNER crmuser;"

# 4. Restore (replace YYYYMMDD-HHMMSS with actual backup filename)
docker exec -i zalo-crm-db pg_restore -U crmuser -d zalocrm -v < backups/zalocrm-YYYYMMDD-HHMMSS.dump

# 5. Start application
docker compose up -d app

# 6. Verify
curl http://127.0.0.1:3080/health
```

---

## System Information

### Version

- Backend: 3.5.0
- Frontend: 3.5.0
- PostgreSQL: 16
- Redis: 7
- Node.js: 22

### Deployed Features (as of 2026-08-16)

- ✅ Login without @domain (username-only login)
- ✅ Chat performance optimization (reply state denormalization)
- ✅ Order stats performance indexes
- ✅ Zalo friend sync optimizations
- ✅ Firebase sync hardening
- ✅ Long attachment upload fixes
- ✅ Mobile order status updates

### Known Issues

1. **Autotags transaction timeout** (5s limit)
   - Impact: ~10 errors/hour
   - Workaround: Increase timeout to 15s (planned Week 1)

2. **UniqueConstraintViolation race conditions**
   - Impact: ~2 errors/hour
   - Workaround: Add skipDuplicates to bulk inserts (planned Week 1)

3. **Zalo group 404 errors**
   - Impact: WARN only, not critical
   - Cause: Groups deleted or access revoked

---

## Emergency Contacts

| Role | Contact Method | Escalation Level |
|---|---|---|
| CTO | [To be filled] | L3 (critical only) |
| Backend Team | [To be filled] | L2 (code issues) |
| DevOps/Server | root@103.209.34.224 | L1 (infrastructure) |

**Escalation Rules:**
- L1 handles routine issues (restart, logs, disk cleanup)
- L2 for code bugs, database issues, Zalo API problems
- L3 only for: data loss, security breach, >2 hour outage

---

## Maintenance Schedule

**Daily Automated Tasks:**
- 2:00 AM: Database backup (`/opt/zalocrm/scripts/backup-db.sh`)
- Automatic: OS security updates (unattended-upgrades)
- Automatic: fail2ban SSH protection

**Weekly Manual Tasks (suggested):**
- Check backup success: `ls -lh /opt/zalocrm/backups/`
- Review error logs: `docker logs --since 168h zalo-crm-app 2>&1 | grep -ciE "error|fatal"`
- Clean old Docker images: `docker system prune`
- Monitor disk usage: `df -h /`

**Monthly Tasks:**
- Test backup restore procedure (on test environment)
- Review and rotate old backups (>30 days)
- Check for OS updates: `apt update && apt list --upgradable`

---

## Useful Commands Reference

```bash
# Check resource usage
docker stats --no-stream

# Check database connections
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Check database size
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "SELECT pg_size_pretty(pg_database_size(current_database()));"

# Check slow queries
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c "SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE (now() - query_start) > interval '5 seconds' AND state = 'active';"

# Follow app logs in real-time
docker logs -f --tail 100 zalo-crm-app

# Count specific error type
docker logs --since 1h zalo-crm-app 2>&1 | grep -i "transaction timeout" | wc -l

# Check container uptime
docker ps --filter "name=zalo-crm" --format "table {{.Names}}\t{{.Status}}"

# Check fail2ban status
fail2ban-client status sshd

# View cron jobs
crontab -l
```

---

**Version:** 1.0  
**Owner:** CTO / DevOps Team  
**Next Review:** 2026-09-16
