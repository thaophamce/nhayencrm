#!/bin/bash
# ============================================================================
# ZaloCRM Performance Monitoring Script
# ============================================================================
# Monitors: Database queries, Redis memory, Container resources, API response times
# Usage: ./monitor-performance.sh [interval_seconds]
# ============================================================================

set -euo pipefail

VPS_HOST="${VPS_HOST:-root@103.209.34.224}"
INTERVAL="${1:-60}"  # Default: check every 60 seconds
DB_USER="crmuser"
DB_NAME="zalocrm"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_header() { echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"; }
log_footer() { echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"; }
log_section() { echo -e "${BLUE}▶ $1${NC}"; }
log_metric() { echo -e "  ${GREEN}✓${NC} $1: ${YELLOW}$2${NC}"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC} $1: ${RED}$2${NC}"; }

print_timestamp() {
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  📊 ZaloCRM Performance Monitor - $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# ============================================================================
# 1. PostgreSQL Performance Metrics
# ============================================================================
check_database_performance() {
    log_section "PostgreSQL Performance"

    # Active connections
    local active_conn=$(ssh $VPS_HOST "docker exec zalo-crm-db psql -U $DB_USER -d $DB_NAME -t -c \
        \"SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active'\"" | xargs)
    log_metric "Active connections" "$active_conn / 100"

    # Database size
    local db_size=$(ssh $VPS_HOST "docker exec zalo-crm-db psql -U $DB_USER -d $DB_NAME -t -c \
        \"SELECT pg_size_pretty(pg_database_size('$DB_NAME'))\"" | xargs)
    log_metric "Database size" "$db_size"

    # Cache hit ratio (should be > 95%)
    local cache_hit=$(ssh $VPS_HOST "docker exec zalo-crm-db psql -U $DB_USER -d $DB_NAME -t -c \
        \"SELECT ROUND(100.0 * sum(blks_hit) / (sum(blks_hit) + sum(blks_read)), 2) AS cache_hit_ratio
         FROM pg_stat_database WHERE datname = '$DB_NAME'\"" | xargs)
    if (( $(echo "$cache_hit > 95" | bc -l) )); then
        log_metric "Cache hit ratio" "${cache_hit}% ✓"
    else
        log_warn "Cache hit ratio" "${cache_hit}% (target: >95%)"
    fi

    # Long-running queries (> 30 seconds)
    local long_queries=$(ssh $VPS_HOST "docker exec zalo-crm-db psql -U $DB_USER -d $DB_NAME -t -c \
        \"SELECT COUNT(*) FROM pg_stat_activity
         WHERE state = 'active' AND now() - query_start > interval '30 seconds'\"" | xargs)
    if [[ "$long_queries" -gt 0 ]]; then
        log_warn "Long-running queries (>30s)" "$long_queries queries"
    else
        log_metric "Long-running queries" "None"
    fi

    # Table sizes (top 5)
    echo -e "\n  ${BLUE}Top 5 largest tables:${NC}"
    ssh $VPS_HOST "docker exec zalo-crm-db psql -U $DB_USER -d $DB_NAME -t -c \
        \"SELECT schemaname || '.' || tablename AS table,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
         FROM pg_tables WHERE schemaname = 'public'
         ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 5\"" | \
    while IFS='|' read -r table size; do
        echo -e "    • $(echo $table | xargs): ${YELLOW}$(echo $size | xargs)${NC}"
    done

    echo ""
}

# ============================================================================
# 2. Redis Performance Metrics
# ============================================================================
check_redis_performance() {
    log_section "Redis Performance"

    # Memory usage
    local redis_info=$(ssh $VPS_HOST "docker exec zalo-crm-redis redis-cli --no-auth-warning \
        -a 4b122f45209bb9da5f9dc90b01631fbbf18630eac32e19d31fe291d2d4f4ec9d INFO memory")

    local used_memory=$(echo "$redis_info" | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r')
    local max_memory=$(echo "$redis_info" | grep "maxmemory_human:" | cut -d: -f2 | tr -d '\r')
    log_metric "Memory usage" "$used_memory / $max_memory"

    # Connected clients
    local clients=$(ssh $VPS_HOST "docker exec zalo-crm-redis redis-cli --no-auth-warning \
        -a 4b122f45209bb9da5f9dc90b01631fbbf18630eac32e19d31fe291d2d4f4ec9d INFO clients" | \
        grep "connected_clients:" | cut -d: -f2 | tr -d '\r')
    log_metric "Connected clients" "$clients"

    # Keys count
    local keys_count=$(ssh $VPS_HOST "docker exec zalo-crm-redis redis-cli --no-auth-warning \
        -a 4b122f45209bb9da5f9dc90b01631fbbf18630eac32e19d31fe291d2d4f4ec9d DBSIZE" | tr -d '\r')
    log_metric "Total keys" "$keys_count"

    # Keyspace hits/misses ratio
    local hits=$(ssh $VPS_HOST "docker exec zalo-crm-redis redis-cli --no-auth-warning \
        -a 4b122f45209bb9da5f9dc90b01631fbbf18630eac32e19d31fe291d2d4f4ec9d INFO stats" | \
        grep "keyspace_hits:" | cut -d: -f2 | tr -d '\r')
    local misses=$(ssh $VPS_HOST "docker exec zalo-crm-redis redis-cli --no-auth-warning \
        -a 4b122f45209bb9da5f9dc90b01631fbbf18630eac32e19d31fe291d2d4f4ec9d INFO stats" | \
        grep "keyspace_misses:" | cut -d: -f2 | tr -d '\r')

    if [[ "$hits" -gt 0 ]] || [[ "$misses" -gt 0 ]]; then
        local hit_rate=$(echo "scale=2; $hits * 100 / ($hits + $misses)" | bc)
        log_metric "Cache hit rate" "${hit_rate}%"
    else
        log_metric "Cache hit rate" "N/A (no requests yet)"
    fi

    echo ""
}

# ============================================================================
# 3. Container Resource Usage
# ============================================================================
check_container_resources() {
    log_section "Container Resources"

    ssh $VPS_HOST "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' \
        zalo-crm-app zalo-crm-db zalo-crm-redis zalo-crm-minio" | \
    while IFS=$'\t' read -r name cpu mem; do
        if [[ "$name" != "NAME" ]]; then
            echo -e "  ${GREEN}•${NC} ${name}: CPU ${YELLOW}${cpu}${NC}, RAM ${YELLOW}${mem}${NC}"
        fi
    done

    echo ""
}

# ============================================================================
# 4. API Response Time
# ============================================================================
check_api_performance() {
    log_section "API Performance"

    # Health endpoint
    local health_time=$(ssh $VPS_HOST "curl -s -o /dev/null -w '%{time_total}' http://127.0.0.1:3080/health")
    log_metric "Health endpoint" "${health_time}s"

    # Check if response time > 1s
    if (( $(echo "$health_time > 1.0" | bc -l) )); then
        log_warn "API slow" "Response time > 1s, investigate app logs"
    fi

    echo ""
}

# ============================================================================
# 5. Disk Usage
# ============================================================================
check_disk_usage() {
    log_section "Disk Usage"

    # PostgreSQL volume
    local pg_volume=$(ssh $VPS_HOST "docker volume inspect zalocrm_pg_data --format '{{.Mountpoint}}' 2>/dev/null || echo '/var/lib/docker/volumes/zalocrm_pg_data'")
    local pg_size=$(ssh $VPS_HOST "du -sh $pg_volume/_data 2>/dev/null | cut -f1 || echo 'N/A'")
    log_metric "PostgreSQL data" "$pg_size"

    # MinIO volume
    local minio_volume=$(ssh $VPS_HOST "docker volume inspect zalocrm_minio_data --format '{{.Mountpoint}}' 2>/dev/null || echo '/var/lib/docker/volumes/zalocrm_minio_data'")
    local minio_size=$(ssh $VPS_HOST "du -sh $minio_volume/_data 2>/dev/null | cut -f1 || echo 'N/A'")
    log_metric "MinIO data" "$minio_size"

    # Redis volume
    local redis_volume=$(ssh $VPS_HOST "docker volume inspect zalocrm_redis_data --format '{{.Mountpoint}}' 2>/dev/null || echo '/var/lib/docker/volumes/zalocrm_redis_data'")
    local redis_size=$(ssh $VPS_HOST "du -sh $redis_volume/_data 2>/dev/null | cut -f1 || echo 'N/A'")
    log_metric "Redis data" "$redis_size"

    # System disk usage
    local disk_usage=$(ssh $VPS_HOST "df -h / | tail -1 | awk '{print \$5}'")
    log_metric "Root filesystem" "$disk_usage used"

    echo ""
}

# ============================================================================
# 6. Application Errors (Last 5 minutes)
# ============================================================================
check_application_errors() {
    log_section "Application Errors (Last 5 min)"

    local error_count=$(ssh $VPS_HOST "docker logs zalo-crm-app --since 5m 2>&1 | grep -i 'error' | wc -l")

    if [[ "$error_count" -gt 0 ]]; then
        log_warn "Error count" "$error_count errors detected"
        echo -e "\n  ${YELLOW}Recent errors:${NC}"
        ssh $VPS_HOST "docker logs zalo-crm-app --since 5m 2>&1 | grep -i 'error' | tail -5" | \
        while IFS= read -r line; do
            echo -e "    ${RED}→${NC} $(echo $line | cut -c1-100)"
        done
    else
        log_metric "Error count" "0 errors ✓"
    fi

    echo ""
}

# ============================================================================
# Main Loop
# ============================================================================
main() {
    echo ""
    log_header
    echo -e "${CYAN}  ZaloCRM Performance Monitor${NC}"
    echo -e "${CYAN}  VPS: $VPS_HOST${NC}"
    echo -e "${CYAN}  Interval: ${INTERVAL}s (Ctrl+C to stop)${NC}"
    log_footer
    echo ""

    while true; do
        print_timestamp

        check_database_performance
        check_redis_performance
        check_container_resources
        check_api_performance
        check_disk_usage
        check_application_errors

        echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
        echo -e "${CYAN}  Next check in ${INTERVAL}s... (Press Ctrl+C to stop)${NC}"
        echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
        echo ""

        sleep "$INTERVAL"
    done
}

# Run
main "$@"
