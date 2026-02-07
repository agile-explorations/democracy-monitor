#!/usr/bin/env bash
set -euo pipefail

SCENARIOS="mixed stable crisis degrading"

usage() {
  cat <<'EOF'
Usage: ./dev-demo.sh <scenario>

Starts the dev server in demo mode with fixture data (no external API calls).

Available scenarios:

  mixed       Default. Mix of statuses across categories.
              civilService=Drift, igs=Capture, courts=Drift, rulemaking=Drift,
              fiscal/hatch/indices=Warning, military/infoAvailability=Stable.
              2 government sites down.

  stable      All categories Stable or Warning. Liberal democracy baseline.
              No government sites down.

  crisis      Most categories at Capture. Personalist-rule scenario.
              5 government sites down.

  degrading   Most categories at Drift. Gradual institutional erosion.
              1 government site down.

Examples:
  ./dev-demo.sh mixed
  ./dev-demo.sh crisis
EOF
}

if [ $# -eq 0 ]; then
  usage
  exit 0
fi

scenario="$1"

# Validate scenario name
valid=false
for s in $SCENARIOS; do
  if [ "$s" = "$scenario" ]; then
    valid=true
    break
  fi
done

if [ "$valid" = false ]; then
  echo "Error: unknown scenario '$scenario'"
  echo "Valid scenarios: $SCENARIOS"
  exit 1
fi

echo "Starting dev server in demo mode (scenario: $scenario)..."

export DEMO_MODE=true
export DEMO_SCENARIO="$scenario"
export NEXT_PUBLIC_DEMO_MODE=true
export NEXT_PUBLIC_DEMO_SCENARIO="$scenario"

exec pnpm dev
