#!/bin/bash
# Production runbook chain TEMPLATE (#564) — copy per runbook, do not run as-is.
#
# Encodes the spend-protocol conventions (CLAUDE.md "Production data operations"):
#   1. EXPECTED_CALLS comes from the runbook precheck; AI steps pass
#      --max-calls $((EXPECTED_CALLS * 3)) so a wrong estimate exits (code 3)
#      instead of running all night.
#   2. retry() absorbs transient network faults but NEVER retries a budget
#      stop (exit 3) — that means the estimate was wrong; a human reviews.
#   3. A spend sentinel recounts AI calls from THIS RUN's log every 15 min and
#      emits "SPEND ALERT" lines (surface these in your monitor grep) at >1.5x
#      expected; at >3x it writes a kill-marker that fails the next step.
#   4. Detach with: nohup caffeinate -i <script> & disown  (survives task
#      reaping and idle sleep — NOT lid-close; leave the laptop open).
#   5. Every step writes progress to $LOG; completion writes $DONE with
#      exit:<status>. Monitors watch markers, never the process alone.
set -u
SCRATCH="CHANGE-ME"              # session scratchpad dir
LOG="$SCRATCH/chain.log"
DONE="$SCRATCH/chain.done"
KILL_MARKER="$SCRATCH/chain.spend-kill"
EXPECTED_CALLS=${EXPECTED_CALLS:?set from the runbook precheck}

cd /Users/michaelkelly/Projects/democracy-monitor
set -a; source .env.prod.local; set +a
rm -f "$DONE" "$KILL_MARKER"

fail() { echo "exit:$1" > "$DONE"; exit 1; }

retry() {
  local label="$1"; shift
  local n=1 rc
  while true; do
    [ -f "$KILL_MARKER" ] && { echo "SPEND KILL honored before $label"; return 3; }
    "$@" && return 0
    rc=$?
    if [ "$rc" -eq 3 ]; then
      echo "--- $label hit the AI call budget (exit 3); NOT retrying ---"
      return 3
    fi
    if [ "$n" -ge 3 ]; then return "$rc"; fi
    echo "--- $(date) $label attempt $n failed (rc=$rc); retrying in 60s ---"
    n=$((n + 1)); sleep 60
  done
}

start_spend_sentinel() {
  local start_line
  start_line=$(wc -l < "$LOG" 2>/dev/null || echo 0)
  (
    while true; do
      sleep 900
      local p1 p2 total
      p1=$(tail -n +"$start_line" "$LOG" 2>/dev/null | tr '\r' '\n' | grep -o 'Pass 1: [0-9]*/' | grep -o '[0-9]*' | awk '{s+=$1} END {print s+0}')
      p2=$(tail -n +"$start_line" "$LOG" 2>/dev/null | tr '\r' '\n' | grep -o 'Pass 2: [0-9]* assessed' | grep -o '[0-9]*' | awk '{s+=$1} END {print s+0}')
      total=$((p1 + p2))
      if [ "$total" -gt $((EXPECTED_CALLS * 3)) ]; then
        echo "SPEND KILL: $total AI calls > 3x expected ($EXPECTED_CALLS) — writing kill marker" >> "$LOG"
        touch "$KILL_MARKER"
      elif [ "$total" -gt $((EXPECTED_CALLS * 3 / 2)) ]; then
        echo "SPEND ALERT: $total AI calls vs $EXPECTED_CALLS expected" >> "$LOG"
      fi
    done
  ) &
  SENTINEL_PID=$!
}

{
  start_spend_sentinel

  echo "=== $(date) STEP 1: <describe> ==="
  retry "step1" pnpm review:backfill --baseline CHANGE_ME --pass 1 --max-calls $((EXPECTED_CALLS * 3)) || fail "step1"

  # ... more steps; every AI step gets --max-calls; every step gets retry() ...

  kill "$SENTINEL_PID" 2>/dev/null
  echo "=== $(date) chain complete ==="
  echo "exit:0" > "$DONE"
} >> "$LOG" 2>&1
