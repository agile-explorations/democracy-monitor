#!/usr/bin/env bash
#
# Weekly cron: trigger a database dump on the web service.
#
# The web service runs pg_dump to its persistent disk and serves the file
# at GET /api/data/dump. This script just triggers the dump via POST.
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
HTTP_CODE=$(curl -fsS -o /tmp/dump-response.json -w "%{http_code}" \
  -X POST "${SITE_URL}/api/cron/dump" \
  -H "Authorization: Bearer ${CRON_SECRET}")

if [ "$HTTP_CODE" = "202" ]; then
  echo "Dump triggered successfully."
  cat /tmp/dump-response.json
  echo ""
else
  echo "ERROR: Dump trigger failed with HTTP ${HTTP_CODE}"
  cat /tmp/dump-response.json 2>/dev/null || true
  echo ""
  exit 1
fi

rm -f /tmp/dump-response.json
