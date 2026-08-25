#!/bin/bash
set -euo pipefail

# ============================================
#  ZaloCRM Full Database Sync: Local → VPS
# ============================================
# Syncs ALL tables with upsert logic (no data loss)
# Downtime: ~5-10 minutes (read-only mode)

VPS_HOST="root@103.209.34.224"
VPS_DB_CONTAINER="zalo-crm-db"
VPS_APP_CONTAINER="zalo-crm-app"
DB_USER="crmuser"
DB_NAME="zalocrm"
LOCAL_TEMP="/tmp/zalocrm-full-sync-$$"
VPS_TEMP="/tmp/zalocrm-vps-sync"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Tables to sync (order matters for FK dependencies)
CORE_TABLES=(
    "organizations"
    "users"
    "zalo_accounts"
    "tags"
    "contacts"
    "conversations"
    "messages"
    "orders"
    "order_status_histories"
    "delivery_orders"
    "delivery_status_events"
    "pancake_order_links"
)

echo "========================================"
echo "  ZaloCRM Full Database Sync"
echo "  Local → VPS (All Tables)"
echo "========================================"
echo "VPS: $VPS_HOST"
echo "Downtime: ~5-10 minutes (read-only mode)"
echo ""

# Confirmation
read -p "⚠️  This will sync ALL data. VPS will be in maintenance mode. Continue? (yes/no): " confirm
if [[ "$confirm" != "yes" ]]; then
    log_error "Sync cancelled by user"
fi

# ============================================
# Phase 1: Prerequisites
# ============================================
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check local Docker
    docker exec zalo-crm-db psql -U $DB_USER -d $DB_NAME -c "SELECT 1" >/dev/null 2>&1 || \
        log_error "Local database not accessible"

    # Check VPS SSH
    ssh -o ConnectTimeout=5 $VPS_HOST "echo ok" >/dev/null 2>&1 || \
        log_error "Cannot connect to VPS"

    # Check VPS database
    ssh $VPS_HOST "docker exec $VPS_DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c 'SELECT 1'" >/dev/null 2>&1 || \
        log_error "VPS database not accessible"

    # Create temp directory
    mkdir -p "$LOCAL_TEMP"

    log_success "Prerequisites OK"
}

# ============================================
# Phase 2: Enable Maintenance Mode
# ============================================
enable_maintenance() {
    log_info "Phase 1/6: Enabling maintenance mode..."

    # Stop application container (DB stays up)
    ssh $VPS_HOST "docker stop $VPS_APP_CONTAINER" || log_error "Failed to stop app"

    log_success "Application stopped (read-only mode)"
}

# ============================================
# Phase 3: Backup VPS
# ============================================
backup_vps() {
    log_info "Phase 2/6: Backing up VPS database..."

    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_file="pre-full-sync-$timestamp.dump"

    ssh $VPS_HOST "
        mkdir -p /opt/zalocrm/backups
        docker exec $VPS_DB_CONTAINER pg_dump -U $DB_USER -Fc $DB_NAME > /opt/zalocrm/backups/$backup_file
    " || log_error "Backup failed"

    log_success "VPS backed up: $backup_file"
}

# ============================================
# Phase 4: Export All Tables from Local
# ============================================
export_all_tables() {
    log_info "Phase 3/6: Exporting all tables from local..."

    for table in "${CORE_TABLES[@]}"; do
        log_info "  Exporting $table..."

        docker exec zalo-crm-db psql -U $DB_USER -d $DB_NAME -c "\COPY $table TO STDOUT CSV HEADER" \
            > "$LOCAL_TEMP/${table}.csv" || log_error "Failed to export $table"

        local count=$(wc -l < "$LOCAL_TEMP/${table}.csv")
        count=$((count - 1))  # Subtract header
        log_info "    → $count rows"
    done

    log_success "All tables exported"
}

# ============================================
# Phase 5: Import to VPS with Upsert
# ============================================
import_to_vps() {
    log_info "Phase 4/6: Importing to VPS (upsert mode)..."

    # Upload all CSVs
    ssh $VPS_HOST "mkdir -p $VPS_TEMP"
    scp "$LOCAL_TEMP"/*.csv "$VPS_HOST:$VPS_TEMP/" || log_error "Failed to upload CSVs"

    # Copy into container
    for table in "${CORE_TABLES[@]}"; do
        ssh $VPS_HOST "docker cp $VPS_TEMP/${table}.csv $VPS_DB_CONTAINER:/tmp/" || \
            log_error "Failed to copy $table to container"
    done

    # Create SQL import script with upsert logic
    cat > "$LOCAL_TEMP/import.sql" <<'EOF'
BEGIN;

-- Import organizations
CREATE TEMP TABLE temp_organizations (LIKE organizations INCLUDING ALL);
\COPY temp_organizations FROM '/tmp/organizations.csv' CSV HEADER
INSERT INTO organizations SELECT * FROM temp_organizations
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = EXCLUDED.updated_at;

-- Import users
CREATE TEMP TABLE temp_users (LIKE users INCLUDING ALL);
\COPY temp_users FROM '/tmp/users.csv' CSV HEADER
INSERT INTO users SELECT * FROM temp_users
ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    updated_at = EXCLUDED.updated_at;

-- Import zalo_accounts
CREATE TEMP TABLE temp_zalo_accounts (LIKE zalo_accounts INCLUDING ALL);
\COPY temp_zalo_accounts FROM '/tmp/zalo_accounts.csv' CSV HEADER
INSERT INTO zalo_accounts SELECT * FROM temp_zalo_accounts
ON CONFLICT (id) DO UPDATE SET
    phone = EXCLUDED.phone,
    status = EXCLUDED.status,
    last_connected_at = EXCLUDED.last_connected_at;

-- Import tags
CREATE TEMP TABLE temp_tags (LIKE tags INCLUDING ALL);
\COPY temp_tags FROM '/tmp/tags.csv' CSV HEADER
INSERT INTO tags SELECT * FROM temp_tags
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    color = EXCLUDED.color,
    updated_at = EXCLUDED.updated_at;

-- Import contacts (with deduplication by zalo_global_id)
CREATE TEMP TABLE temp_contacts (LIKE contacts INCLUDING ALL);
\COPY temp_contacts FROM '/tmp/contacts.csv' CSV HEADER

-- Create mapping for duplicate contacts
CREATE TEMP TABLE contact_id_map AS
SELECT
    tc.id AS local_id,
    COALESCE(c.id, tc.id) AS vps_id
FROM temp_contacts tc
LEFT JOIN contacts c ON c.org_id = tc.org_id AND c.zalo_global_id = tc.zalo_global_id;

-- Insert only new contacts
INSERT INTO contacts
SELECT * FROM temp_contacts
WHERE id NOT IN (SELECT local_id FROM contact_id_map WHERE local_id != vps_id)
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    phone = EXCLUDED.phone,
    updated_at = EXCLUDED.updated_at;

-- Import conversations (map contact_id for duplicates)
CREATE TEMP TABLE temp_conversations (LIKE conversations INCLUDING ALL);
\COPY temp_conversations FROM '/tmp/conversations.csv' CSV HEADER

UPDATE temp_conversations tc
SET contact_id = (SELECT vps_id FROM contact_id_map WHERE local_id = tc.contact_id);

INSERT INTO conversations SELECT * FROM temp_conversations
ON CONFLICT (id) DO UPDATE SET
    last_message_at = EXCLUDED.last_message_at,
    unread_count = EXCLUDED.unread_count,
    is_replied = EXCLUDED.is_replied;

-- Import messages
CREATE TEMP TABLE temp_messages (LIKE messages INCLUDING ALL);
\COPY temp_messages FROM '/tmp/messages.csv' CSV HEADER

-- Filter orphan messages
DELETE FROM temp_messages
WHERE conversation_id NOT IN (SELECT id FROM conversations);

INSERT INTO messages SELECT * FROM temp_messages
ON CONFLICT (id) DO NOTHING;

-- Import orders (handle both id and order_code conflicts)
CREATE TEMP TABLE temp_orders (LIKE orders INCLUDING ALL);
\COPY temp_orders FROM '/tmp/orders.csv' CSV HEADER

-- Insert new orders only (skip if id OR order_code already exists)
INSERT INTO orders
SELECT * FROM temp_orders t
WHERE NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = t.id OR (o.org_id = t.org_id AND o.order_code = t.order_code)
);

-- Update existing orders by id
UPDATE orders o
SET status = t.status, updated_at = t.updated_at
FROM temp_orders t
WHERE o.id = t.id;

-- Import order_status_histories
CREATE TEMP TABLE temp_order_status_histories (LIKE order_status_histories INCLUDING ALL);
\COPY temp_order_status_histories FROM '/tmp/order_status_histories.csv' CSV HEADER

DELETE FROM temp_order_status_histories
WHERE order_id NOT IN (SELECT id FROM orders);

INSERT INTO order_status_histories SELECT * FROM temp_order_status_histories
ON CONFLICT (id) DO NOTHING;

-- Import delivery_orders
CREATE TEMP TABLE temp_delivery_orders (LIKE delivery_orders INCLUDING ALL);
\COPY temp_delivery_orders FROM '/tmp/delivery_orders.csv' CSV HEADER

-- No orphan filtering needed - delivery_orders uses order_code, not FK

INSERT INTO delivery_orders SELECT * FROM temp_delivery_orders
ON CONFLICT (id) DO UPDATE SET
    tracking_code = EXCLUDED.tracking_code,
    delivery_status = EXCLUDED.delivery_status,
    payment_status = EXCLUDED.payment_status;

-- Import delivery_status_events
CREATE TEMP TABLE temp_delivery_status_events (LIKE delivery_status_events INCLUDING ALL);
\COPY temp_delivery_status_events FROM '/tmp/delivery_status_events.csv' CSV HEADER

DELETE FROM temp_delivery_status_events
WHERE delivery_order_id NOT IN (SELECT id FROM delivery_orders);

INSERT INTO delivery_status_events SELECT * FROM temp_delivery_status_events
ON CONFLICT (id) DO NOTHING;

-- Import pancake_order_links
CREATE TEMP TABLE temp_pancake_order_links (LIKE pancake_order_links INCLUDING ALL);
\COPY temp_pancake_order_links FROM '/tmp/pancake_order_links.csv' CSV HEADER

DELETE FROM temp_pancake_order_links
WHERE conversation_id NOT IN (SELECT id FROM conversations);

INSERT INTO pancake_order_links SELECT * FROM temp_pancake_order_links
ON CONFLICT (id) DO UPDATE SET
    pancake_order_id = EXCLUDED.pancake_order_id,
    sync_status = EXCLUDED.sync_status,
    updated_at = EXCLUDED.updated_at;

COMMIT;
EOF

    # Upload and execute SQL script
    scp "$LOCAL_TEMP/import.sql" "$VPS_HOST:$VPS_TEMP/"
    ssh $VPS_HOST "docker cp $VPS_TEMP/import.sql $VPS_DB_CONTAINER:/tmp/"

    log_info "  Executing upsert import..."
    ssh $VPS_HOST "docker exec -i $VPS_DB_CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -f /tmp/import.sql" || \
        log_error "Import failed"

    log_success "Import completed"
}

# ============================================
# Phase 6: Verify Data Integrity
# ============================================
verify_sync() {
    log_info "Phase 5/6: Verifying data integrity..."

    # Get counts from both sides
    log_info "  Comparing record counts..."

    for table in "${CORE_TABLES[@]}"; do
        local local_count=$(docker exec zalo-crm-db psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM $table")
        local vps_count=$(ssh $VPS_HOST "docker exec $VPS_DB_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c 'SELECT COUNT(*) FROM $table'")

        local_count=$(echo $local_count | xargs)
        vps_count=$(echo $vps_count | xargs)

        if [[ "$local_count" -gt "$vps_count" ]]; then
            log_warn "  $table: Local=$local_count, VPS=$vps_count (⚠️  VPS has less)"
        else
            log_info "  $table: VPS=$vps_count ✓"
        fi
    done

    log_success "Verification complete"
}

# ============================================
# Phase 7: Restart Application
# ============================================
restart_app() {
    log_info "Phase 6/6: Restarting application..."

    ssh $VPS_HOST "docker start $VPS_APP_CONTAINER" || log_error "Failed to start app"

    # Wait for health check
    sleep 5

    local health=$(ssh $VPS_HOST "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/health")
    if [[ "$health" != "200" ]]; then
        log_error "Health check failed (HTTP $health)"
    fi

    log_success "Application started"
}

# ============================================
# Cleanup
# ============================================
cleanup() {
    log_info "Cleaning up..."

    # Local cleanup
    rm -rf "$LOCAL_TEMP"

    # VPS cleanup
    ssh $VPS_HOST "
        docker exec $VPS_DB_CONTAINER rm -f /tmp/*.csv /tmp/import.sql
        rm -rf $VPS_TEMP
    "

    log_success "Cleanup done"
}

# ============================================
# Main Execution
# ============================================
main() {
    local start_time=$(date +%s)

    check_prerequisites
    enable_maintenance
    backup_vps
    export_all_tables
    import_to_vps
    verify_sync
    restart_app
    cleanup

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    echo ""
    log_success "🎉 Full sync completed successfully!"
    echo ""
    echo "Duration: ${duration}s"
    echo ""
    echo "Next steps:"
    echo "  1. Test UI: https://nhayencrm.com"
    echo "  2. Verify orders, deliveries, payments"
    echo "  3. Monitor logs: ssh $VPS_HOST 'docker logs -f --tail 50 $VPS_APP_CONTAINER'"
}

main
