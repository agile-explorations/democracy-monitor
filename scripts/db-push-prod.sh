#!/bin/bash
# Full database push from dev to production.
# Use for destructive schema changes or when selective promotion isn't sufficient.
#
# REQUIRES: Production site in maintenance mode (NEXT_PUBLIC_MAINTENANCE_MODE=true).
#
# Usage:
#   DATABASE_URL=<dev-db-url> PROD_DATABASE_URL=<prod-db-url> ./scripts/db-push-prod.sh
#
# Workflow:
#   1. Set NEXT_PUBLIC_MAINTENANCE_MODE=true on Render prod web service
#   2. Run this script
#   3. Merge develop -> main and deploy
#   4. Remove NEXT_PUBLIC_MAINTENANCE_MODE from Render prod web service

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is required (source dev database)"
  exit 1
fi

if [ -z "${PROD_DATABASE_URL:-}" ]; then
  echo "ERROR: PROD_DATABASE_URL is required (target production database)"
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d%H%M%S)
DEV_DUMP="/tmp/dm-dev-$TIMESTAMP.pgdump"
PROD_BACKUP="/tmp/dm-prod-backup-$TIMESTAMP.pgdump"

echo "==> Step 1: Backup production database..."
pg_dump -Fc --no-owner --no-privileges "$PROD_DATABASE_URL" -f "$PROD_BACKUP"
BACKUP_SIZE=$(du -h "$PROD_BACKUP" | cut -f1)
echo "    Backup saved: $PROD_BACKUP ($BACKUP_SIZE)"

echo "==> Step 2: Dump dev database..."
pg_dump -Fc --no-owner --no-privileges "$DATABASE_URL" -f "$DEV_DUMP"
DEV_SIZE=$(du -h "$DEV_DUMP" | cut -f1)
echo "    Dev dump: $DEV_DUMP ($DEV_SIZE)"

echo ""
echo "==> WARNING: About to overwrite production database."
echo "    Backup: $PROD_BACKUP"
echo "    Source: $DEV_DUMP"
echo ""
read -p "Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "==> Step 3: Restore dev dump into production..."
pg_restore --clean --if-exists --no-owner --no-privileges -d "$PROD_DATABASE_URL" "$DEV_DUMP" 2>&1 || true

echo "==> Step 4: Verify production..."
ROW_COUNT=$(psql "$PROD_DATABASE_URL" -t -c "SELECT COUNT(*) FROM documents" 2>/dev/null | tr -d ' ')
echo "    Production documents: $ROW_COUNT"

echo ""
echo "==> Done. Production database replaced with dev data."
echo "    Backup: $PROD_BACKUP (keep until verified)"
echo ""
echo "Next steps:"
echo "  1. Merge develop -> main"
echo "  2. Wait for Render deploy (migrations will be a no-op)"
echo "  3. Remove NEXT_PUBLIC_MAINTENANCE_MODE from Render"
echo "  4. Verify the site, then delete backup: rm $PROD_BACKUP"
