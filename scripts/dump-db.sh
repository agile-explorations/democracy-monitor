#!/usr/bin/env bash
set -euo pipefail

DUMP_FILE="data-dump.pgdump"
DB_URL="${DATABASE_URL:-postgresql://localhost:5432/democracy_monitor}"

echo "Dumping database to ${DUMP_FILE}..."
pg_dump -Fc --no-owner --no-privileges "${DB_URL}" > "${DUMP_FILE}"

SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "Done. Dump size: ${SIZE}"
echo ""
echo "To upload to GitHub Release (creates or replaces 'data-latest'):"
echo "  gh release delete data-latest --yes --cleanup-tag 2>/dev/null"
echo "  gh release create data-latest --title 'Database snapshot' --notes 'Full database dump for deployment and contributor setup.' ${DUMP_FILE}"
