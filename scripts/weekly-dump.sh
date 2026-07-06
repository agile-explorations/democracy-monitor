#!/usr/bin/env bash
#
# Weekly cron: trigger a database dump on the web service and poll until done.
#
# Triggers POST /api/cron/dump (returns 202 immediately, dump runs detached on
# the web service), then polls GET /api/cron/dump/status every POLL_INTERVAL
# seconds up to MAX_WAIT seconds.
#
# Requires SITE_URL and CRON_SECRET env vars.
#
set -euo pipefail

SITE_URL="${SITE_URL:-https://democracymonitor.us}"
POLL_INTERVAL="${POLL_INTERVAL:-30}"
MAX_WAIT="${MAX_WAIT:-2700}" # 45 minutes

if [ -z "${CRON_SECRET:-}" ]; then
  echo "ERROR: CRON_SECRET is required" >&2
  exit 1
fi

trigger() {
  curl -sS -w "\n%{http_code}" \
    --max-time 30 \
    -X POST "${SITE_URL}/api/cron/dump" \
    -H "Authorization: Bearer ${CRON_SECRET}"
}

poll() {
  curl -sS --max-time 30 \
    "${SITE_URL}/api/cron/dump/status" \
    -H "Authorization: Bearer ${CRON_SECRET}"
}

echo "Triggering database dump on ${SITE_URL}..."
TRIGGER_RESPONSE=$(trigger)
TRIGGER_CODE=$(echo "$TRIGGER_RESPONSE" | tail -1)
TRIGGER_BODY=$(echo "$TRIGGER_RESPONSE" | sed '$d')

case "$TRIGGER_CODE" in
  202)
    echo "Dump started: ${TRIGGER_BODY}"
    ;;
  409)
    echo "Dump already in progress: ${TRIGGER_BODY}"
    ;;
  *)
    echo "ERROR: Failed to trigger dump (HTTP ${TRIGGER_CODE}): ${TRIGGER_BODY}" >&2
    exit 1
    ;;
esac

echo "Polling ${SITE_URL}/api/cron/dump/status every ${POLL_INTERVAL}s (max ${MAX_WAIT}s)..."

START=$(date +%s)
while true; do
  STATUS_BODY=$(poll)

  if printf '%s' "$STATUS_BODY" | grep -q '"status":"complete"'; then
    echo "Dump complete: ${STATUS_BODY}"
    exit 0
  fi

  if printf '%s' "$STATUS_BODY" | grep -q '"status":"failed"'; then
    echo "ERROR: Dump failed: ${STATUS_BODY}" >&2
    exit 1
  fi

  if printf '%s' "$STATUS_BODY" | grep -q '"status":"running"'; then
    ELAPSED=$(( $(date +%s) - START ))
    if [ "$ELAPSED" -gt "$MAX_WAIT" ]; then
      echo "ERROR: Timed out after ${MAX_WAIT}s; last status: ${STATUS_BODY}" >&2
      exit 1
    fi
    echo "Still running (${ELAPSED}s elapsed); sleeping ${POLL_INTERVAL}s..."
    sleep "$POLL_INTERVAL"
    continue
  fi

  echo "ERROR: Unexpected status response: ${STATUS_BODY}" >&2
  exit 1
done
