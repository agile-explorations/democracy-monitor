#!/usr/bin/env bash
#
# Weekly cron: trigger a database dump on the web service and wait for completion.
#
# The web service runs pg_dump to its persistent disk and serves the file
# at GET /api/data/dump. This script triggers the dump and waits for the
# response (pg_dump runs as a non-blocking child process on the web service).
#
# Requires SITE_URL and CRON_SECRET env vars.
#
set -euo pipefail

SITE_URL="${SITE_URL:-https://democracymonitor.us}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "ERROR: CRON_SECRET is required"
  exit 1
fi

echo "Triggering database dump on ${SITE_URL}..."
echo "This will wait for pg_dump to complete (typically 2-5 minutes)."

RESPONSE=$(curl -sS -w "\n%{http_code}" \
  --max-time 600 \
  -X POST "${SITE_URL}/api/cron/dump" \
  -H "Authorization: Bearer ${CRON_SECRET}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP ${HTTP_CODE}: ${BODY}"

if [ "$HTTP_CODE" = "200" ]; then
  echo "Dump completed successfully."
else
  echo "ERROR: Dump failed with HTTP ${HTTP_CODE}"
  exit 1
fi
