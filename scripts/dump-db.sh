#!/usr/bin/env bash
#
# Manual dump for local development. Excludes embedding vectors.
# Output: data-dump.tar.gz (same format as weekly-dump.sh)
#
set -euo pipefail

DUMP_FILE="data-dump.pgdump"
DOCS_CSV="documents-no-embedding.csv.gz"
EMBEDDINGS="embeddings.bin.gz"
ARCHIVE="data-dump.tar.gz"
DB_URL="${DATABASE_URL:-postgresql://localhost:5432/democracy_monitor}"

echo "Dumping database (excluding documents table data)..."
pg_dump -Fc --no-owner --no-privileges --exclude-table-data=documents "${DB_URL}" > "${DUMP_FILE}"

echo "Exporting documents table (excluding embedding column)..."
psql "${DB_URL}" -c "\copy (SELECT id, source_type, category, title, content, url, published_at, fetched_at, metadata, source_origin, case_id, speaker, content_type, embedded_at, retrieval_relevant, counting_scope, parent_id FROM documents) TO STDOUT WITH CSV HEADER" | gzip > "${DOCS_CSV}"

echo "Exporting embeddings..."
psql "${DB_URL}" -c "\copy (SELECT id, embedding FROM documents WHERE embedding IS NOT NULL) TO STDOUT WITH BINARY" | gzip > "${EMBEDDINGS}"

echo "Creating main archive..."
tar -czf "${ARCHIVE}" "${DUMP_FILE}" "${DOCS_CSV}"
rm -f "${DUMP_FILE}" "${DOCS_CSV}"

ARCHIVE_SIZE=$(du -h "${ARCHIVE}" | cut -f1)
EMB_SIZE=$(du -h "${EMBEDDINGS}" | cut -f1)
echo "Done."
echo "  Main archive: ${ARCHIVE_SIZE} (${ARCHIVE})"
echo "  Embeddings:   ${EMB_SIZE} (${EMBEDDINGS})"
echo ""
echo "To upload to GitHub Release (creates or replaces 'data-latest'):"
echo "  gh release delete data-latest --yes --cleanup-tag 2>/dev/null"
echo "  gh release create data-latest --title 'Database snapshot' --notes 'Two assets: main data + embeddings.' ${ARCHIVE} ${EMBEDDINGS}"
