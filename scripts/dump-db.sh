#!/usr/bin/env bash
#
# Manual dump for local development. Excludes embedding vectors.
# Output: data-dump.tar.gz (same format as weekly-dump.sh)
#
set -euo pipefail

DUMP_FILE="data-dump.pgdump"
DOCS_CSV="documents-no-embedding.csv.gz"
ARCHIVE="data-dump.tar.gz"
DB_URL="${DATABASE_URL:-postgresql://localhost:5432/democracy_monitor}"

echo "Dumping database (excluding documents table data)..."
pg_dump -Fc --no-owner --no-privileges --exclude-table-data=documents "${DB_URL}" > "${DUMP_FILE}"

echo "Exporting documents table (excluding embedding column)..."
psql "${DB_URL}" -c "\copy (SELECT id, source_type, category, title, content, url, published_at, fetched_at, metadata, source_origin, case_id, speaker, content_type, embedded_at FROM documents) TO STDOUT WITH CSV HEADER" | gzip > "${DOCS_CSV}"

echo "Creating archive..."
tar -czf "${ARCHIVE}" "${DUMP_FILE}" "${DOCS_CSV}"
rm -f "${DUMP_FILE}" "${DOCS_CSV}"

SIZE=$(du -h "${ARCHIVE}" | cut -f1)
echo "Done. Archive size: ${SIZE}"
echo ""
echo "To upload to GitHub Release (creates or replaces 'data-latest'):"
echo "  gh release delete data-latest --yes --cleanup-tag 2>/dev/null"
echo "  gh release create data-latest --title 'Database snapshot' --notes 'Database dump (embeddings excluded).' ${ARCHIVE}"
echo ""
echo "To restore locally:"
echo "  tar -xzf ${ARCHIVE}"
echo "  pg_restore --clean --if-exists --no-owner --no-privileges -d democracy_monitor ${DUMP_FILE}"
echo "  gunzip -c ${DOCS_CSV} | psql democracy_monitor -c \"\\copy documents(id, source_type, category, title, content, url, published_at, fetched_at, metadata, source_origin, case_id, speaker, content_type, embedded_at) FROM STDIN WITH CSV HEADER\""
echo "  pnpm db:migrate"
echo "  pnpm embeddings:backfill  # regenerate embeddings"
