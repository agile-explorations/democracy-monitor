#!/bin/bash
# Pull latest production database dump and restore into the current DATABASE_URL.
#
# Usage:
#   DATABASE_URL=<dev-db-url> ./scripts/db-pull-prod.sh
#   DATABASE_URL=<dev-db-url> PROD_URL=<prod-site> ./scripts/db-pull-prod.sh
#
# PROD_URL defaults to https://democracymonitor.us

set -euo pipefail

PROD_URL="${PROD_URL:-https://democracymonitor.us}"
DUMP_FILE="/tmp/dm-prod-$(date +%Y%m%d%H%M%S).pgdump"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is required (target database for restore)"
  exit 1
fi

echo "==> Downloading production dump from $PROD_URL/api/data/dump..."
curl -fSL --max-time 600 "$PROD_URL/api/data/dump" -o "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "==> Downloaded $DUMP_SIZE to $DUMP_FILE"

echo "==> Restoring into $DATABASE_URL..."
pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" "$DUMP_FILE" 2>&1 || true
# pg_restore returns non-zero for warnings (e.g., "relation does not exist" on --clean);
# this is expected when the dev DB has a different schema. The || true ensures we continue —
# so the restore MUST be verified below, not trusted (#780: a partial restore that "looked
# successful" would silently invalidate every measurement made against this database).

echo "==> Verifying restore..."
DOC_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM documents" 2>/dev/null || echo "0")
MIN_DOCS="${MIN_EXPECTED_DOCS:-100000}"
if [ "$DOC_COUNT" -lt "$MIN_DOCS" ]; then
  echo "ERROR: restore verification failed — documents count $DOC_COUNT < $MIN_DOCS."
  echo "       The pg_restore above likely failed partway; do NOT use this database."
  exit 1
fi
echo "==> Verified: $DOC_COUNT documents present."

echo "==> Running pending migrations..."
pnpm db:migrate

echo "==> Cleaning up temp file..."
rm -f "$DUMP_FILE"

echo "==> Done. Dev database restored from production."
