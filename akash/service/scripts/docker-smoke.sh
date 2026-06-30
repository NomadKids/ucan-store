#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

IMAGE="${UCAN_STORE_AKASH_IMAGE:-ucan-store-akash:local}"
CONTAINER="${UCAN_STORE_SMOKE_CONTAINER:-ucan-store-akash-smoke}"
PORT="${UCAN_STORE_SMOKE_PORT:-8080}"
BASE_URL="${UCAN_STORE_SMOKE_BASE_URL:-http://127.0.0.1:${PORT}}"
MODE="${UCAN_STORE_SMOKE_MODE:-host}"

if [ "${UCAN_STORE_SMOKE_BUILD:-0}" = "1" ]; then
  docker build -f "$REPO_ROOT/akash/service/Dockerfile" -t "$IMAGE" "$REPO_ROOT"
fi

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

docker_args=(
  -d
  --name "$CONTAINER"
  -e "UCAN_STORE_PUBLIC_ORIGIN=${BASE_URL}"
)

if [ "$MODE" != "container" ]; then
  docker_args+=(-p "${PORT}:8080")
fi

docker run "${docker_args[@]}" "$IMAGE" >/dev/null

cleanup() {
  local status="$?"
  trap - EXIT

  if [ "$status" -ne 0 ]; then
    echo "Akash service smoke test failed; container logs follow." >&2
    docker logs "$CONTAINER" >&2 || true
    print_container_file /tmp/kubo.log
    print_container_file /tmp/ucan-store-service.log
  fi

  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

print_container_file() {
  local path="$1"
  local output_file

  output_file="$(mktemp)"
  if docker cp "${CONTAINER}:${path}" "$output_file" >/dev/null 2>&1; then
    echo "--- ${path} ---" >&2
    sed -n '1,220p' "$output_file" >&2
  fi
  rm -f "$output_file"
}

run_host_smoke() {
  UCAN_STORE_SMOKE_BASE_URL="$BASE_URL" UCAN_STORE_SMOKE_TIMEOUT_MS=1000 node "$SCRIPT_DIR/smoke.mjs"
}

run_container_smoke() {
  docker exec \
    -e UCAN_STORE_SMOKE_BASE_URL=http://127.0.0.1:8080 \
    -e UCAN_STORE_SMOKE_TIMEOUT_MS=1000 \
    "$CONTAINER" \
    node /app/akash/service/scripts/smoke.mjs
}

run_with_retry() {
  local command_name="$1"
  local last_status=1
  local output_file

  output_file="$(mktemp)"

  for _ in $(seq 1 60); do
    if "$command_name" >"$output_file" 2>&1; then
      cat "$output_file"
      rm -f "$output_file"
      return 0
    else
      last_status="$?"
    fi
    if [ "$last_status" -eq 2 ]; then
      break
    fi
    sleep 1
  done

  cat "$output_file" >&2
  rm -f "$output_file"
  return "$last_status"
}

set +e

case "$MODE" in
  host)
    run_with_retry run_host_smoke
    ;;
  container)
    run_with_retry run_container_smoke
    ;;
  auto)
    if ! run_with_retry run_host_smoke; then
      echo "Host smoke check failed; retrying from inside the container." >&2
      run_with_retry run_container_smoke
    fi
    ;;
  *)
    echo "Unknown UCAN_STORE_SMOKE_MODE: $MODE" >&2
    exit 2
    ;;
esac

status="$?"
set -e
exit "$status"
