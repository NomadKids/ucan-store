#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${1:-${UCAN_STORE_LIVE_BASE_URL:-${UCAN_STORE_SMOKE_BASE_URL:-}}}"
ATTEMPTS="${UCAN_STORE_LIVE_ATTEMPTS:-30}"
RETRY_DELAY_SECONDS="${UCAN_STORE_LIVE_RETRY_DELAY_SECONDS:-5}"

if [ -z "$BASE_URL" ]; then
  echo "Usage: UCAN_STORE_LIVE_BASE_URL=https://<akash-service-host> bash akash/service/scripts/live-smoke.sh" >&2
  echo "   or: bash akash/service/scripts/live-smoke.sh https://<akash-service-host>" >&2
  exit 2
fi

case "$BASE_URL" in
  http://127.0.0.1*|http://localhost*|http://0.0.0.0*)
    if [ "${UCAN_STORE_LIVE_ALLOW_LOCAL:-0}" != "1" ]; then
      echo "Refusing to run live smoke against local URL: ${BASE_URL}" >&2
      echo "Set UCAN_STORE_LIVE_ALLOW_LOCAL=1 for local validation." >&2
      exit 2
    fi
    ;;
esac

output_file="$(mktemp)"
cleanup() {
  rm -f "$output_file"
}
trap cleanup EXIT

for attempt in $(seq 1 "$ATTEMPTS"); do
  if UCAN_STORE_SMOKE_BASE_URL="$BASE_URL" \
    UCAN_STORE_SMOKE_TIMEOUT_MS="${UCAN_STORE_SMOKE_TIMEOUT_MS:-15000}" \
    node "$SCRIPT_DIR/smoke.mjs" >"$output_file" 2>&1; then
    cat "$output_file"
    exit 0
  fi

  if [ "$attempt" -lt "$ATTEMPTS" ]; then
    sleep "$RETRY_DELAY_SECONDS"
  fi
done

cat "$output_file" >&2
exit 1
