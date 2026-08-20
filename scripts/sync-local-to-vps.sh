#!/bin/bash
set -euo pipefail

# ============================================================================
# Sync Local Data to VPS Production
# ============================================================================
# Đồng bộ incremental data (messages, media) từ local lên VPS
# Strategy: Merge chứ không overwrite để giữ data production
# ============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Config
VPS_HOST="${VPS_HOST:-root@103.209.34.224}"
CUT_OFF_TIME="2026-08-16 12:50:00"
LOCAL_DB_CONTAINER="zalo-crm-db"
BACKUP_DIR="/opt/zalocrm/backups"
TEMP_DIR="/tmp/zalocrm-sync-$(date +%Y%m%d-%H%M%S)"
LOCAL_TEMP="./sync-temp-$(date +%Y%m%d-%H%M%S)"

# Database credentials
DB_USER="crmuser"
DB_NAME="zalocrm"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found"
        exit 1
    fi

    # Check local container
    if ! docker ps | grep -q "$LOCAL_DB_CONTAINER"; then
        log_error "Local database container not running"
        exit 1
    fi

    # Check SSH connection
    if ! ssh -o ConnectTimeout=5 "$VPS_HOST" "echo ok" &> /dev/null; then
        log_error "Cannot connect to VPS"
        exit 1
    fi

    log_success "Prerequisites OK"
}

backup_vps() {
    log_info "Phase 1/5: Backing up VPS database..."

    local backup_file="pre-sync-$(date +%Y%m%d-%H%M%S).dump"

    ssh "$VPS_HOST" "
        mkdir -p $BACKUP_DIR
        docker exec $LOCAL_DB_CONTAINER pg_dump -U $DB_USER -Fc $DB_NAME > \
            $BACKUP_DIR/$backup_file
        ls -lh $BACKUP_DIR/$backup_file
    "

    log_success "VPS backed up: $backup_file"
}

export_incremental_data() {
    log_info "Phase 2/5: Exporting incremental data from local..."

    mkdir -p "$LOCAL_TEMP"

    # Export conversations
    log_info "  Exporting conversations (created > $CUT_OFF_TIME)..."
    docker exec "$LOCAL_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        COPY (
            SELECT * FROM conversations
            WHERE created_at > '$CUT_OFF_TIME'
            ORDER BY created_at
        ) TO STDOUT WITH CSV HEADER
    " > "$LOCAL_TEMP/conversations-new.csv"
    local conv_count=$(tail -n +2 "$LOCAL_TEMP/conversations-new.csv" | wc -l)
    log_info "    → $conv_count conversations"

    # Export messages
    log_info "  Exporting messages (created > $CUT_OFF_TIME)..."
    docker exec "$LOCAL_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        COPY (
            SELECT * FROM messages
            WHERE created_at > '$CUT_OFF_TIME'
            ORDER BY created_at
        ) TO STDOUT WITH CSV HEADER
    " > "$LOCAL_TEMP/messages-new.csv"
    local msg_count=$(tail -n +2 "$LOCAL_TEMP/messages-new.csv" | wc -l)
    log_info "    → $msg_count messages"

    # Export contacts
    log_info "  Exporting contacts (updated > $CUT_OFF_TIME)..."
    docker exec "$LOCAL_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        COPY (
            SELECT * FROM contacts
            WHERE updated_at > '$CUT_OFF_TIME'
            ORDER BY updated_at
        ) TO STDOUT WITH CSV HEADER
    " > "$LOCAL_TEMP/contacts-new.csv"
    local contact_count=$(tail -n +2 "$LOCAL_TEMP/contacts-new.csv" | wc -l)
    log_info "    → $contact_count contacts"

    # Export media_assets
    log_info "  Exporting media_assets (created > $CUT_OFF_TIME)..."
    docker exec "$LOCAL_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        COPY (
            SELECT * FROM media_assets
            WHERE created_at > '$CUT_OFF_TIME'
            ORDER BY created_at
        ) TO STDOUT WITH CSV HEADER
    " > "$LOCAL_TEMP/media-assets-new.csv"
    local asset_count=$(tail -n +2 "$LOCAL_TEMP/media-assets-new.csv" | wc -l)
    log_info "    → $asset_count media assets"

    # Export media_blobs
    log_info "  Exporting media_blobs (created > $CUT_OFF_TIME)..."
    docker exec "$LOCAL_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        COPY (
            SELECT * FROM media_blobs
            WHERE created_at > '$CUT_OFF_TIME'
            ORDER BY created_at
        ) TO STDOUT WITH CSV HEADER
    " > "$LOCAL_TEMP/media-blobs-new.csv"
    local blob_count=$(tail -n +2 "$LOCAL_TEMP/media-blobs-new.csv" | wc -l)
    log_info "    → $blob_count media blobs"

    log_success "Data exported to $LOCAL_TEMP"
}

sync_minio_data() {
    log_info "Phase 3/5: Syncing MinIO media files..."

    # Tar MinIO data - use PowerShell path for Windows
    log_info "  Creating MinIO archive..."
    local win_temp="D:/CTY TNHH THIEP CUOI/CLAUDE/ZaloCRM/$LOCAL_TEMP"
    docker run --rm \
        -v zalocrm_minio_data:/data \
        -v "$win_temp":/backup \
        alpine tar czf /backup/minio-data.tar.gz -C /data .

    local size=$(du -sh "$LOCAL_TEMP/minio-data.tar.gz" | cut -f1)
    log_info "  Archive size: $size"

    # Upload to VPS
    log_info "  Uploading to VPS..."
    scp "$LOCAL_TEMP/minio-data.tar.gz" "$VPS_HOST:/tmp/"

    # Extract on VPS
    log_info "  Extracting on VPS (MinIO will be down 2-3 min)..."
    ssh "$VPS_HOST" "
        # Stop MinIO
        cd /opt/zalocrm
        docker stop zalo-crm-minio

        # Extract
        docker run --rm \
            -v zalocrm_minio_data:/data \
            -v /tmp:/backup \
            alpine sh -c 'rm -rf /data/* && tar xzf /backup/minio-data.tar.gz -C /data'

        # Start MinIO
        docker start zalo-crm-minio

        # Wait for healthy
        sleep 5
        docker ps | grep zalo-crm-minio

        # Cleanup
        rm /tmp/minio-data.tar.gz
    "

    log_success "MinIO synced and restarted"
}

merge_database() {
    log_info "Phase 4/5: Merging database on VPS..."

    # Create temp dir on VPS
    ssh "$VPS_HOST" "mkdir -p $TEMP_DIR"

    # Upload CSV files
    log_info "  Uploading CSV files..."
    scp "$LOCAL_TEMP"/*.csv "$VPS_HOST:$TEMP_DIR/"

    # Import conversations
    log_info "  Importing conversations..."
    ssh "$VPS_HOST" "docker exec -i $LOCAL_DB_CONTAINER psql -U $DB_USER -d $DB_NAME" <<'SQL'
BEGIN;
CREATE TEMP TABLE temp_conversations (LIKE conversations INCLUDING ALL);
\COPY temp_conversations FROM '/tmp/zalocrm-sync-*/conversations-new.csv' WITH CSV HEADER
INSERT INTO conversations
    SELECT * FROM temp_conversations
    ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_conversations;
COMMIT;
SQL

    # Import messages
    log_info "  Importing messages..."
    ssh "$VPS_HOST" "docker exec -i $LOCAL_DB_CONTAINER psql -U $DB_USER -d $DB_NAME" <<'SQL'
BEGIN;
CREATE TEMP TABLE temp_messages (LIKE messages INCLUDING ALL);
\COPY temp_messages FROM '/tmp/zalocrm-sync-*/messages-new.csv' WITH CSV HEADER
INSERT INTO messages
    SELECT * FROM temp_messages
    ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_messages;
COMMIT;
SQL

    # Import contacts
    log_info "  Importing contacts..."
    ssh "$VPS_HOST" "docker exec -i $LOCAL_DB_CONTAINER psql -U $DB_USER -d $DB_NAME" <<'SQL'
BEGIN;
CREATE TEMP TABLE temp_contacts (LIKE contacts INCLUDING ALL);
\COPY temp_contacts FROM '/tmp/zalocrm-sync-*/contacts-new.csv' WITH CSV HEADER
INSERT INTO contacts
    SELECT * FROM temp_contacts
    ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = EXCLUDED.updated_at;
DROP TABLE temp_contacts;
COMMIT;
SQL

    # Import media_assets
    log_info "  Importing media_assets..."
    ssh "$VPS_HOST" "docker exec -i $LOCAL_DB_CONTAINER psql -U $DB_USER -d $DB_NAME" <<'SQL'
BEGIN;
CREATE TEMP TABLE temp_media_assets (LIKE media_assets INCLUDING ALL);
\COPY temp_media_assets FROM '/tmp/zalocrm-sync-*/media-assets-new.csv' WITH CSV HEADER
INSERT INTO media_assets
    SELECT * FROM temp_media_assets
    ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_media_assets;
COMMIT;
SQL

    # Import media_blobs
    log_info "  Importing media_blobs..."
    ssh "$VPS_HOST" "docker exec -i $LOCAL_DB_CONTAINER psql -U $DB_USER -d $DB_NAME" <<'SQL'
BEGIN;
CREATE TEMP TABLE temp_media_blobs (LIKE media_blobs INCLUDING ALL);
\COPY temp_media_blobs FROM '/tmp/zalocrm-sync-*/media-blobs-new.csv' WITH CSV HEADER
INSERT INTO media_blobs
    SELECT * FROM temp_media_blobs
    ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_media_blobs;
COMMIT;
SQL

    # Cleanup
    ssh "$VPS_HOST" "rm -rf $TEMP_DIR"

    log_success "Database merged"
}

verify_sync() {
    log_info "Phase 5/5: Verifying sync..."

    # Check VPS counts
    log_info "  VPS record counts:"
    ssh "$VPS_HOST" "docker exec $LOCAL_DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c \"
        SELECT
            'Conversations: ' || COUNT(*) FROM conversations
        UNION ALL SELECT
            'Messages: ' || COUNT(*) FROM messages
        UNION ALL SELECT
            'Media blobs: ' || COUNT(*) FROM media_blobs
        UNION ALL SELECT
            'Contacts: ' || COUNT(*) FROM contacts;
    \""

    # Check MinIO size
    log_info "  MinIO storage size:"
    ssh "$VPS_HOST" "du -sh /var/lib/docker/volumes/zalocrm_minio_data/_data"

    # Check application health
    log_info "  Application health:"
    ssh "$VPS_HOST" "curl -s http://127.0.0.1:3080/health | head -n 1"

    log_success "Verification complete"
}

cleanup_local() {
    log_info "Cleaning up local temp files..."
    rm -rf "$LOCAL_TEMP"
    log_success "Cleanup done"
}

# ============================================================================
# Main execution
# ============================================================================

main() {
    echo ""
    echo "========================================"
    echo "  ZaloCRM Data Sync: Local → VPS"
    echo "========================================"
    echo "VPS: $VPS_HOST"
    echo "Cut-off: $CUT_OFF_TIME"
    echo ""

    check_prerequisites
    backup_vps
    export_incremental_data
    sync_minio_data
    merge_database
    verify_sync
    cleanup_local

    echo ""
    log_success "🎉 Sync completed successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Test UI: Open random conversation, check images load"
    echo "  2. Monitor logs: ssh $VPS_HOST 'docker logs -f --tail 100 zalo-crm-app'"
    echo "  3. Check errors: ssh $VPS_HOST 'docker logs --since 10m zalo-crm-app 2>&1 | grep -i error'"
    echo ""
}

# Trap errors
trap 'log_error "Script failed at line $LINENO"' ERR

# Run
main "$@"
