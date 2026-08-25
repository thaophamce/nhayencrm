#!/bin/bash
set -euo pipefail
BACKUP_DIR="/opt/zalocrm/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/zalocrm-$TIMESTAMP.dump"
mkdir -p "$BACKUP_DIR"
docker exec zalo-crm-db pg_dump -U crmuser -Fc zalocrm > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
find "$BACKUP_DIR" -name "*.dump" -mtime +7 -delete
echo "[$(date)] Backup completed: $BACKUP_FILE"
