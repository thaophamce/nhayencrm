#!/bin/bash
set -euo pipefail

# ============================================================================
# Sync Incremental Database: Local → VPS (v2)
# ============================================================================
# Fixed: Use docker cp instead of COPY FROM STDIN
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

VPS_HOST="${VPS_HOST:-root@103.209.34.224}"
CUT_OFF_TIME="2026-08-16 12:50:00"
LOCAL_DB_CONTAINER="zalo-crm-db"
VPS_DB_CONTAINER="zalo-crm-db"
BACKUP_DIR="/opt/zalocrm/backups"
VPS_TEMP_DIR="/tmp/zalocrm-sync"
LOCAL_TEMP="./sync-temp-$(date +%Y%m%d-%H%M%S)"

DB_USER="crmuser"
DB_NAME="zalocrm"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
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
        docker exec $VPS_DB_CONTAINER pg_dump -U $DB_USER -Fc $DB_NAME > \
            $BACKUP_DIR/$backup_file
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

    log_info "  Exporting contacts (FK dependencies)..."
    docker exec "$LOCAL_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        COPY (
            SELECT DISTINCT c.* FROM contacts c
            INNER JOIN conversations conv ON conv.contact_id = c.id
            WHERE conv.created_at > '$CUT_OFF_TIME'
            ORDER BY c.id
        ) TO STDOUT WITH CSV HEADER
    " > "$LOCAL_TEMP/contacts.csv"
    local contact_count=$(tail -n +2 "$LOCAL_TEMP/contacts.csv" | wc -l)
    log_info "    → $contact_count contacts (required by new conversations)"

    if [[ $conv_count -eq 0 && $msg_count -eq 0 ]]; then
        log_warn "No new data to sync!"
        exit 0
    fi

    log_success "Data exported: $conv_count conv, $msg_count msg, $contact_count contacts"
}

merge_database() {
    log_info "Phase 3/4: Merging database on VPS..."

    # Upload CSV files to VPS host
    ssh "$VPS_HOST" "mkdir -p $VPS_TEMP_DIR"
    scp "$LOCAL_TEMP"/*.csv "$VPS_HOST:$VPS_TEMP_DIR/"

    # Copy files into container
    ssh "$VPS_HOST" "
        docker cp $VPS_TEMP_DIR/contacts.csv $VPS_DB_CONTAINER:/tmp/
        docker cp $VPS_TEMP_DIR/conversations.csv $VPS_DB_CONTAINER:/tmp/
        docker cp $VPS_TEMP_DIR/messages.csv $VPS_DB_CONTAINER:/tmp/
    "

    # Create SQL import script with contact ID mapping
    cat > "$LOCAL_TEMP/import.sql" <<'EOF'
BEGIN;

-- Step 1: Load contacts into temp table
CREATE TEMP TABLE temp_contacts (LIKE contacts INCLUDING ALL);
\COPY temp_contacts FROM '/tmp/contacts.csv' CSV HEADER

-- Step 2: Create contact ID mapping (local ID -> VPS ID for duplicates)
CREATE TEMP TABLE contact_id_map AS
SELECT
    tc.id AS local_id,
    COALESCE(c.id, tc.id) AS vps_id
FROM temp_contacts tc
LEFT JOIN contacts c ON c.org_id = tc.org_id AND c.zalo_global_id = tc.zalo_global_id;

-- Step 3: Insert only new contacts (skip duplicates)
INSERT INTO contacts
SELECT * FROM temp_contacts
WHERE id NOT IN (SELECT local_id FROM contact_id_map WHERE local_id != vps_id)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Load conversations with mapped contact IDs
CREATE TEMP TABLE temp_conversations (LIKE conversations INCLUDING ALL);
\COPY temp_conversations FROM '/tmp/conversations.csv' CSV HEADER

UPDATE temp_conversations tc
SET contact_id = (SELECT vps_id FROM contact_id_map WHERE local_id = tc.contact_id);

INSERT INTO conversations SELECT * FROM temp_conversations ON CONFLICT (id) DO NOTHING;

-- Step 5: Import messages (only for existing conversations)
CREATE TEMP TABLE temp_messages (LIKE messages INCLUDING ALL);
\COPY temp_messages FROM '/tmp/messages.csv' CSV HEADER

-- Filter out messages with missing conversation_id
DELETE FROM temp_messages
WHERE conversation_id NOT IN (SELECT id FROM conversations);

INSERT INTO messages SELECT * FROM temp_messages ON CONFLICT (id) DO NOTHING;

COMMIT;
EOF

    # Upload and execute SQL script
    scp "$LOCAL_TEMP/import.sql" "$VPS_HOST:$VPS_TEMP_DIR/"
    ssh "$VPS_HOST" "docker cp $VPS_TEMP_DIR/import.sql $VPS_DB_CONTAINER:/tmp/"

    log_info "  Importing with contact ID mapping..."
    ssh "$VPS_HOST" "docker exec -i $VPS_DB_CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f /tmp/import.sql"

    # Cleanup
    ssh "$VPS_HOST" "
        docker exec $VPS_DB_CONTAINER rm -f /tmp/*.csv /tmp/import.sql
        rm -rf $VPS_TEMP_DIR
    "

    log_success "Database merged"
}

verify_sync() {
    log_info "Phase 4/4: Verifying sync..."

    log_info "  Record counts:"
    ssh "$VPS_HOST" "docker exec $VPS_DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c \"
        SELECT
            'Conversations: ' || COUNT(*) FROM conversations
        UNION ALL SELECT
            'Messages: ' || COUNT(*) FROM messages
        UNION ALL SELECT
            'Contacts: ' || COUNT(*) FROM contacts;
    \""

    log_info "  Latest message timestamp:"
    ssh "$VPS_HOST" "docker exec $VPS_DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c \"
        SELECT 'VPS: ' || MAX(created_at) FROM messages;
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
    echo "  ZaloCRM Data Sync: Local → VPS v2"
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
    echo "  1. Test UI: Open conversation, check new messages appear"
    echo "  2. Monitor logs: ssh $VPS_HOST 'docker logs -f --tail 50 zalo-crm-app'"
    echo ""
}

trap 'log_error "Script failed at line $LINENO"; cleanup_local; exit 1' ERR

main "$@"
