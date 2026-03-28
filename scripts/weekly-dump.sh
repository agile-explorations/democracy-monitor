#!/usr/bin/env bash
#
# Weekly cron: dump the database and upload to GitHub Release assets.
# Excludes the embedding column from documents table to keep dump under 2GB.
# Embeddings are regenerable via `pnpm embeddings:backfill`.
#
# Requires DATABASE_URL and GITHUB_TOKEN env vars.
#
set -euo pipefail

DUMP_FILE="/tmp/data-dump.pgdump"
REPO="agile-explorations/democracy-monitor"
TAG="data-latest"
API="https://api.github.com/repos/${REPO}"
UPLOAD_API="https://uploads.github.com/repos/${REPO}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_TOKEN is required"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is required"
  exit 1
fi

AUTH="Authorization: token ${GITHUB_TOKEN}"

# Record cron_run start
RUN_ID=$(psql "${DATABASE_URL}" -tAc "INSERT INTO cron_runs (job_name, status, started_at) VALUES ('dump', 'running', NOW()) RETURNING id")
trap 'psql "${DATABASE_URL}" -c "UPDATE cron_runs SET status='\''failed'\'', finished_at=NOW(), duration_ms=EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000 WHERE id=${RUN_ID}" 2>/dev/null; rm -f "${DUMP_FILE}"' ERR

# Cross-job check: warn if last snapshot failed
SNAPSHOT_STATUS=$(psql "${DATABASE_URL}" -tAc "SELECT status FROM cron_runs WHERE job_name='snapshot' ORDER BY started_at DESC LIMIT 1" 2>/dev/null || echo "unknown")
if [ "${SNAPSHOT_STATUS}" = "failed" ]; then
  echo "WARNING: Last snapshot run failed. Data may be incomplete."
fi

# 1. Dump database — exclude documents table data (schema still included)
echo "Dumping database (excluding documents table data)..."
pg_dump -Fc --no-owner --no-privileges --exclude-table-data=documents "${DATABASE_URL}" > "${DUMP_FILE}"

# 2. Dump documents table without embedding column via COPY → compressed CSV
echo "Exporting documents table (excluding embedding column)..."
DOCS_CSV="/tmp/documents-no-embedding.csv.gz"
psql "${DATABASE_URL}" -c "\copy (SELECT id, source_type, category, title, content, url, published_at, fetched_at, metadata, source_origin, case_id, speaker, content_type, embedded_at FROM documents) TO STDOUT WITH CSV HEADER" | gzip > "${DOCS_CSV}"
DOCS_SIZE=$(du -h "${DOCS_CSV}" | cut -f1)
echo "Documents CSV: ${DOCS_SIZE}"

# 3. Combine into a tar archive
echo "Creating combined archive..."
ARCHIVE="/tmp/data-dump.tar.gz"
tar -czf "${ARCHIVE}" -C /tmp "$(basename "${DUMP_FILE}")" "$(basename "${DOCS_CSV}")"
rm -f "${DUMP_FILE}" "${DOCS_CSV}"

SIZE=$(du -h "${ARCHIVE}" | cut -f1)
echo "Archive complete: ${SIZE}"

# Validate size
MIN_SIZE_KB=10240  # 10MB minimum
ACTUAL_SIZE_KB=$(du -k "${ARCHIVE}" | cut -f1)
if [ "${ACTUAL_SIZE_KB}" -lt "${MIN_SIZE_KB}" ]; then
  echo "ERROR: Archive too small (${ACTUAL_SIZE_KB}KB < ${MIN_SIZE_KB}KB)"
  rm -f "${ARCHIVE}"
  exit 1
fi

# 4. Delete existing release if present
echo "Checking for existing release..."
RELEASE_RESPONSE=$(curl -s -H "${AUTH}" "${API}/releases/tags/${TAG}" 2>/dev/null) || true
RELEASE_ID=$(echo "${RELEASE_RESPONSE}" | node -p 'try { JSON.parse(require("fs").readFileSync(0,"utf8")).id } catch { "" }' 2>/dev/null) || true

if [ -n "${RELEASE_ID}" ] && [ "${RELEASE_ID}" != "undefined" ] && [ "${RELEASE_ID}" != "" ]; then
  echo "Deleting release ${RELEASE_ID}..."
  curl -X DELETE -H "${AUTH}" "${API}/releases/${RELEASE_ID}" > /dev/null 2>&1 || echo "Warning: release delete failed"
  sleep 2
fi

# Always try to delete the tag (may exist independently of the release)
curl -X DELETE -H "${AUTH}" "${API}/git/refs/tags/${TAG}" > /dev/null 2>&1 || true
sleep 2

# 5. Create new release
echo "Creating release..."
CREATE_RESPONSE=$(curl -s -X POST \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d "{\"tag_name\":\"${TAG}\",\"name\":\"Database snapshot\",\"body\":\"Weekly database dump ($(date -u +%Y-%m-%d)). Excludes embedding vectors — run pnpm embeddings:backfill after restore.\"}" \
  "${API}/releases" 2>&1)

NEW_RELEASE_ID=$(echo "${CREATE_RESPONSE}" | node -p 'try { JSON.parse(require("fs").readFileSync(0,"utf8")).id } catch { "" }' 2>/dev/null) || true

if [ -z "${NEW_RELEASE_ID}" ] || [ "${NEW_RELEASE_ID}" = "undefined" ] || [ "${NEW_RELEASE_ID}" = "" ]; then
  echo "ERROR: Failed to create release. Response:"
  echo "${CREATE_RESPONSE}"
  rm -f "${ARCHIVE}"
  exit 1
fi
echo "Created release ${NEW_RELEASE_ID}"

# 6. Upload archive
echo "Uploading archive (this may take several minutes)..."
curl -f -X POST \
  -H "${AUTH}" \
  -H "Content-Type: application/gzip" \
  --retry 3 --retry-delay 10 \
  -T "${ARCHIVE}" \
  "${UPLOAD_API}/releases/${NEW_RELEASE_ID}/assets?name=data-dump.tar.gz"
echo ""
echo "Upload complete."

# Record success
psql "${DATABASE_URL}" -c "UPDATE cron_runs SET status='success', finished_at=NOW(), duration_ms=EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000, summary='{\"archiveSizeKb\":${ACTUAL_SIZE_KB}}' WHERE id=${RUN_ID}"

# 7. Cleanup
rm -f "${ARCHIVE}"
echo "Done. https://github.com/${REPO}/releases/tag/${TAG}"
