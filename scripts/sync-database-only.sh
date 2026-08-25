#!/bin/bash
set -euo pipefail

# ============================================================================
# Sync Incremental Database: Local → VPS
# ============================================================================
# Chỉ sync database (messages, contacts), bỏ qua media
# Media đã ở trên CDN/production, không cần sync
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

VPS_HOST="${VPS_HOST:-root@103.209.34.224}"
CUT_OFF_TIME="2026-08-16 12:50:00"
LOCAL_DB_CONTAINER="zalo-crm-db"
BACKUP_DIR="/opt/zalocrm/backups"
TEMP_DIR="/tmp/zalocrm-sync-$(date +%Y%m%d-%H%M%S)"
LOCAL_TEMP="./sync-temp-$(date +%Y%m%d-%H%M%S)"

DB_USER="crmuser"
DB_NAME="zalocrm"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! docker ps | grep -q "$LOCAL_DB_CONTAINER"; then
        log_error "Local database container not running"
        exit 1
    fi

    if ! ssh -o ConnectTimeout=5 "$VPS_HOST" "echo ok" &> /dev/null; then
        log_error "Cannot connect to VPS"
        exit 1
    fi

    log_success "Prerequisites OK"
}

backup_vps() {
    log_info "Phase 1/4: Backing up VPS database..."

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
    log_info "Phase 2/4: Exporting incremental data from local..."

    mkdir -p "$LOCAL_TEMP"

    log_info "  Exporting conversations..."
    docker exec "$LOCAL_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        COPY (
            SELECT * FROM conversations
            WHERE created_at > '$CUT_OFF_TIME'
            ORDER BY created_at
        ) TO STDOUT WITH CSV HEADER
    " > "$LOCAL_TEMP/conversations.csv"
    local conv_count=$(tail -n +2 "$LOCAL_TEMP/conversations.csv" | wc -l)
    log_info "    → $conv_count conversations"

    log_info "  Exporting messages..."
    docker exec "$LOCAL_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        COPY (
            SELECT * FROM messages
            WHERE created_at > '$CUT_OFF_TIME'
            ORDER BY created_at
        ) TO STDOUT WITH CSV HEADER
    " > "$LOCAL_TEMP/messages.csv"
    local msg_count=$(tail -n +2 "$LOCAL_TEMP/messages.csv" | wc -l)
    log_info "    → $msg_count messages"

    log_info "  Exporting contacts..."
    docker exec "$LOCAL_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        COPY (
            SELECT * FROM contacts
            WHERE updated_at > '$CUT_OFF_TIME'
            ORDER BY updated_at
        ) TO STDOUT WITH CSV HEADER
    " > "$LOCAL_TEMP/contacts.csv"
    local contact_count=$(tail -n +2 "$LOCAL_TEMP/contacts.csv" | wc -l)
    log_info "    → $contact_count contacts"

    log_success "Data exported"
}

merge_database() {
    log_info "Phase 3/4: Merging database on VPS..."

    ssh "$VPS_HOST" "mkdir -p $TEMP_DIR"

    log_info "  Uploading CSV files..."
    scp "$LOCAL_TEMP"/*.csv "$VPS_HOST:$TEMP_DIR/"

    log_info "  Importing conversations..."
    ssh "$VPS_HOST" "cat $TEMP_DIR/conversations.csv | docker exec -i $LOCAL_DB_CONTAINER psql -U $DB_USER -d $DB_NAME" <<'EOF'
BEGIN;
CREATE TEMP TABLE temp_conversations (LIKE conversations INCLUDING ALL);
\COPY temp_conversations FROM STDIN CSV HEADER
INSERT INTO conversations
    SELECT * FROM temp_conversations
    ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_conversations;
COMMIT;
EOF

    log_info "  Importing messages..."
    ssh "$VPS_HOST" "cat $TEMP_DIR/messages.csv | docker exec -i $LOCAL_DB_CONTAINER psql -U $DB_USER -d $DB_NAME" <<'EOF'
BEGIN;
CREATE TEMP TABLE temp_messages (LIKE messages INCLUDING ALL);
\COPY temp_messages FROM STDIN CSV HEADER
INSERT INTO messages
    SELECT * FROM temp_messages
    ON CONFLICT (id) DO NOTHING;
DROP TABLE temp_messages;
COMMIT;
EOF

    log_info "  Importing contacts..."
    ssh "$VPS_HOST" "cat $TEMP_DIR/contacts.csv | docker exec -i $LOCAL_DB_CONTAINER psql -U $DB_USER -d $DB_NAME" <<'EOF'
BEGIN;
CREATE TEMP TABLE temp_contacts (LIKE contacts INCLUDING ALL);
\COPY temp_contacts FROM STDIN CSV HEADER
INSERT INTO contacts
    SELECT * FROM temp_contacts
    ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = EXCLUDED.updated_at;
DROP TABLE temp_contacts;
COMMIT;
EOF

    ssh "$VPS_HOST" "rm -rf $TEMP_DIR"

    log_success "Database merged"
}

verify_sync() {
    log_info "Phase 4/4: Verifying sync..."

    log_info "  VPS record counts:"
    ssh "$VPS_HOST" "docker exec $LOCAL_DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c \"
        SELECT
            'Conversations: ' || COUNT(*) FROM conversations
        UNION ALL SELECT
            'Messages: ' || COUNT(*) FROM messages
        UNION ALL SELECT
            'Contacts: ' || COUNT(*) FROM contacts;
    \""

    log_info "  Application health:"
    ssh "$VPS_HOST" "curl -s -o /dev/null -w 'HTTP %{http_code} in %{time_total}s' http://127.0.0.1:3080/health && echo"

    log_success "Verification complete"
}

cleanup_local() {
    log_info "Cleaning up local temp files..."
    rm -rf "$LOCAL_TEMP"
    log_success "Cleanup done"
}

main() {
    echo ""
    echo "========================================"
    echo "  ZaloCRM Data Sync: Local → VPS"
    echo "  (Database Only - Media Skipped)"
    echo "========================================"
    echo "VPS: $VPS_HOST"
    echo "Cut-off: $CUT_OFF_TIME"
    echo ""

    check_prerequisites
    backup_vps
    export_incremental_data
    merge_database
    verify_sync
    cleanup_local

    echo ""
    log_success "🎉 Sync completed successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Test UI: Open conversation, check messages appear"
    echo "  2. Monitor logs: ssh $VPS_HOST 'docker logs -f --tail 50 zalo-crm-app'"
    echo ""
}

trap 'log_error "Script failed at line $LINENO"' ERR

main "$@"
