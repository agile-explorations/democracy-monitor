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

# 3. Create new release
echo "Creating release..."
CREATE_RESPONSE=$(curl -s -X POST \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d "{\"tag_name\":\"${TAG}\",\"name\":\"Database snapshot\",\"body\":\"Weekly database dump ($(date -u +%Y-%m-%d))\"}" \
  "${API}/releases" 2>&1)

NEW_RELEASE_ID=$(echo "${CREATE_RESPONSE}" | node -p 'try { JSON.parse(require("fs").readFileSync(0,"utf8")).id } catch { "" }' 2>/dev/null) || true

if [ -z "${NEW_RELEASE_ID}" ] || [ "${NEW_RELEASE_ID}" = "undefined" ] || [ "${NEW_RELEASE_ID}" = "" ]; then
  echo "ERROR: Failed to create release. Response:"
  echo "${CREATE_RESPONSE}"
  rm -f "${DUMP_FILE}"
  exit 1
fi
echo "Created release ${NEW_RELEASE_ID}"

# 4. Upload asset (use -T to stream from disk instead of buffering in memory)
echo "Uploading dump (this may take several minutes)..."
curl -f -X POST \
  -H "${AUTH}" \
  -H "Content-Type: application/octet-stream" \
  --retry 3 --retry-delay 10 \
  -T "${DUMP_FILE}" \
  "${UPLOAD_API}/releases/${NEW_RELEASE_ID}/assets?name=data-dump.pgdump"
echo "Upload complete."

# 5. Cleanup
rm -f "${DUMP_FILE}"
echo "Done. https://github.com/${REPO}/releases/tag/${TAG}"
