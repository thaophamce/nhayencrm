#!/usr/bin/env bash
#
# ZaloCRM production inventory (REVIEW BEFORE RUNNING)
#
# Read-only inventory for migration sizing. The script:
#   - never prints .env, credentials, message content, names, phone numbers, or email;
#   - forces every PostgreSQL session into read-only mode;
#   - only lists/counts object-storage metadata;
#   - does not create/restart/stop containers or write files.
#
# IMPACT ASSESSMENT:
#   - PostgreSQL queries are read-only but may consume I/O and CPU.
#   - S3 ListObjects may take 1-5 minutes for large buckets.
#   - Total runtime: 2-10 minutes depending on database size.
#   - Run during low-traffic hours if database is under heavy load.
#
# Usage after CTO approval:
#   bash scripts/zalocrm-inventory.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

APP_CONTAINER="${APP_CONTAINER:-zalo-crm-app}"
DB_CONTAINER="${DB_CONTAINER:-zalo-crm-db}"
REDIS_CONTAINER="${REDIS_CONTAINER:-zalo-crm-redis}"
MINIO_CONTAINER="${MINIO_CONTAINER:-zalo-crm-minio}"
DB_USER_NAME="${DB_USER_NAME:-crmuser}"
DB_NAME_VALUE="${DB_NAME_VALUE:-zalocrm}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
section() { printf '\n=== %s ===\n' "$1"; }
need() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

container_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" = "true" ]
}

require_running() {
  container_running "$1" || die "Required container is not running: $1"
}

# All SQL calls are read-only even if a query is accidentally changed later.
psql_ro() {
  docker exec \
    -e PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=60000' \
    "$DB_CONTAINER" psql \
    -X --set=ON_ERROR_STOP=1 --no-psqlrc \
    -U "$DB_USER_NAME" -d "$DB_NAME_VALUE" "$@"
}

bytes_in_container_path() {
  local container="$1" path="$2"
  if ! container_running "$container"; then
    printf 'unavailable (container not running)'
    return 0
  fi

  docker exec "$container" sh -c \
    'if [ -d "$1" ]; then du -sk "$1" | awk "{print \$1 * 1024}"; else printf "unavailable"; fi' \
    sh "$path" 2>/dev/null || printf 'unavailable'
}

need docker
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"
require_running "$DB_CONTAINER"

printf '=== ZaloCRM Production Inventory ===\n'
printf 'Date (UTC): %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf 'Host: [redacted]\n'
printf 'Mode: READ-ONLY / AGGREGATES ONLY\n'

section "PostgreSQL"
psql_ro <<'SQL'
SELECT 'Total database size' AS metric, pg_size_pretty(pg_database_size(current_database())) AS value;

SELECT
  format('%I.%I', schemaname, relname) AS table_name,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)) AS total_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) DESC
LIMIT 5;
SQL

section "Business data (aggregate counts only)"
psql_ro <<'SQL'
SELECT 'Organizations' AS metric, count(*)::bigint AS value FROM organizations
UNION ALL SELECT 'Users', count(*) FROM users
UNION ALL SELECT 'Conversations', count(*) FROM conversations
UNION ALL SELECT 'Messages', count(*) FROM messages
UNION ALL SELECT 'Orders', count(*) FROM orders
ORDER BY metric;
SQL

section "Zalo sessions (aggregate status only)"
psql_ro <<'SQL'
SELECT
  CASE
    WHEN archived_at IS NOT NULL THEN 'archived'
    WHEN status = 'connected' THEN 'active'
    WHEN status = 'disconnected' THEN 'inactive'
    WHEN status = 'qr_pending' THEN 'pending'
    ELSE 'unknown'
  END AS aggregate_status,
  count(*)::bigint AS account_count
FROM zalo_accounts
GROUP BY 1
ORDER BY 1;
SQL

section "Growth (daily aggregates, last 30 days)"
psql_ro <<'SQL'
WITH days AS (
  SELECT generate_series(
    date_trunc('day', now()) - interval '29 days',
    date_trunc('day', now()),
    interval '1 day'
  ) AS day
), message_daily AS (
  SELECT date_trunc('day', created_at) AS day, count(*)::bigint AS count
  FROM messages
  WHERE created_at >= date_trunc('day', now()) - interval '29 days'
  GROUP BY 1
), media_daily AS (
  SELECT
    date_trunc('day', created_at) AS day,
    count(*)::bigint AS count,
    coalesce(sum(size_bytes), 0)::bigint AS bytes
  FROM media_blobs
  WHERE created_at >= date_trunc('day', now()) - interval '29 days'
  GROUP BY 1
), order_daily AS (
  SELECT date_trunc('day', created_at) AS day, count(*)::bigint AS count
  FROM orders
  WHERE created_at >= date_trunc('day', now()) - interval '29 days'
  GROUP BY 1
)
SELECT
  'Messages/day (30d avg)' AS metric,
  round(avg(coalesce(m.count, 0)), 2)::text AS value
FROM days d LEFT JOIN message_daily m USING (day)
UNION ALL
SELECT 'Media objects/day (30d avg)', round(avg(coalesce(md.count, 0)), 2)::text
FROM days d LEFT JOIN media_daily md USING (day)
UNION ALL
SELECT 'Media bytes/day (30d avg)', round(avg(coalesce(md.bytes, 0)), 0)::text
FROM days d LEFT JOIN media_daily md USING (day)
UNION ALL
SELECT 'Orders/day (30d avg)', round(avg(coalesce(o.count, 0)), 2)::text
FROM days d LEFT JOIN order_daily o USING (day)
ORDER BY metric;
SQL

section "Media catalog in PostgreSQL"
psql_ro <<'SQL'
SELECT 'Media blob rows' AS metric, count(*)::bigint::text AS value FROM media_blobs
UNION ALL
SELECT 'Media blob bytes', coalesce(sum(size_bytes), 0)::bigint::text FROM media_blobs
ORDER BY metric;
SQL

section "Object storage (ListObjects metadata only)"
if container_running "$APP_CONTAINER"; then
  if docker exec "$APP_CONTAINER" node -e "require('@aws-sdk/client-s3')" 2>/dev/null; then
    docker exec -i "$APP_CONTAINER" node --input-type=module - <<'NODE'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_KEY;

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  console.log('Unavailable: S3/MinIO runtime configuration is incomplete.');
  process.exit(0);
}

const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

let continuationToken;
let objectCount = 0;
let totalBytes = 0;

do {
  const page = await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    ContinuationToken: continuationToken,
  }));
  for (const object of page.Contents || []) {
    objectCount += 1;
    totalBytes += Number(object.Size || 0);
  }
  continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (continuationToken);

console.log(`Object count: ${objectCount}`);
console.log(`Total bytes: ${totalBytes}`);
NODE
  else
    printf 'Unavailable: @aws-sdk/client-s3 not installed in app container.\n'
  fi
else
  printf 'Unavailable: app container is not running.\n'
fi

section "Docker volume usage (bytes)"
printf 'PostgreSQL data: %s\n' "$(bytes_in_container_path "$DB_CONTAINER" /var/lib/postgresql/data)"
printf 'Redis data: %s\n' "$(bytes_in_container_path "$REDIS_CONTAINER" /data)"
printf 'MinIO data: %s\n' "$(bytes_in_container_path "$MINIO_CONTAINER" /data)"
printf 'App local file storage: %s\n' "$(bytes_in_container_path "$APP_CONTAINER" /var/lib/zalo-crm/files)"

section "Docker images"
docker compose images

section "Current container resources (single sample)"
running_inventory_containers=()
for container in \
  "$APP_CONTAINER" "$DB_CONTAINER" "$REDIS_CONTAINER" "$MINIO_CONTAINER" \
  zalo-crm-backup zalo-crm-clamav; do
  container_running "$container" && running_inventory_containers+=("$container")
done
if [ "${#running_inventory_containers[@]}" -gt 0 ]; then
  docker stats --no-stream \
    --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}' \
    "${running_inventory_containers[@]}"
else
  printf 'Unavailable: no ZaloCRM containers are running.\n'
fi

section "Host filesystem"
df -hP .

printf '\nInventory completed. No application data or infrastructure state was modified.\n'
