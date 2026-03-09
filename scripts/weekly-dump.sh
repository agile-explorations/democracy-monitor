#!/usr/bin/env bash
#
# Weekly cron: dump the database and upload to GitHub Release assets.
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

# 1. Dump database
echo "Dumping database..."
pg_dump -Fc --no-owner --no-privileges "${DATABASE_URL}" > "${DUMP_FILE}"
SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
echo "Dump complete: ${SIZE}"

# 2. Delete existing release if present
echo "Checking for existing release..."
RELEASE_ID=$(curl -sf -H "${AUTH}" "${API}/releases/tags/${TAG}" \
  | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).id' 2>/dev/null) || true

if [ -n "${RELEASE_ID}" ] && [ "${RELEASE_ID}" != "undefined" ]; then
  echo "Deleting release ${RELEASE_ID}..."
  curl -sf -X DELETE -H "${AUTH}" "${API}/releases/${RELEASE_ID}" > /dev/null
  curl -sf -X DELETE -H "${AUTH}" "${API}/git/refs/tags/${TAG}" > /dev/null 2>&1 || true
fi

# 3. Create new release
echo "Creating release..."
NEW_RELEASE_ID=$(curl -sf -X POST \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d "{\"tag_name\":\"${TAG}\",\"name\":\"Database snapshot\",\"body\":\"Weekly database dump ($(date -u +%Y-%m-%d))\"}" \
  "${API}/releases" \
  | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')
echo "Created release ${NEW_RELEASE_ID}"

# 4. Upload asset
echo "Uploading dump (this may take several minutes)..."
curl -sf -X POST \
  -H "${AUTH}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@${DUMP_FILE}" \
  "${UPLOAD_API}/releases/${NEW_RELEASE_ID}/assets?name=data-dump.pgdump" > /dev/null
echo "Upload complete."

# 5. Cleanup
rm -f "${DUMP_FILE}"
echo "Done. https://github.com/${REPO}/releases/tag/${TAG}"
