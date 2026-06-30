#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

IMAGE="${UCAN_STORE_AKASH_IMAGE:-ucan-store-akash:local}"
CONTAINER="${UCAN_STORE_IDENTITY_SMOKE_CONTAINER:-ucan-store-akash-identity-smoke}"
RUN_ID="${UCAN_STORE_IDENTITY_SMOKE_ID:-$$}"
DATA_VOLUME="${UCAN_STORE_IDENTITY_DATA_VOLUME:-ucan-store-akash-identity-data-${RUN_ID}}"
IPFS_VOLUME="${UCAN_STORE_IDENTITY_IPFS_VOLUME:-ucan-store-akash-identity-ipfs-${RUN_ID}}"
BASE_URL="${UCAN_STORE_SMOKE_BASE_URL:-http://127.0.0.1:8080}"

if [ "${UCAN_STORE_SMOKE_BUILD:-0}" = "1" ]; then
  docker build -f "$REPO_ROOT/akash/service/Dockerfile" -t "$IMAGE" "$REPO_ROOT"
fi

cleanup() {
  local status="$?"
  trap - EXIT

  if [ "$status" -ne 0 ]; then
    echo "Akash identity persistence smoke test failed; container logs follow." >&2
    docker logs "$CONTAINER" >&2 || true
  fi

  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

  if [ -z "${UCAN_STORE_IDENTITY_KEEP_VOLUMES:-}" ]; then
    docker volume rm "$DATA_VOLUME" "$IPFS_VOLUME" >/dev/null 2>&1 || true
  fi

  exit "$status"
}
trap cleanup EXIT

docker volume create "$DATA_VOLUME" >/dev/null
docker volume create "$IPFS_VOLUME" >/dev/null

run_once() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

  docker run -d \
    --name "$CONTAINER" \
    -e "UCAN_STORE_PUBLIC_ORIGIN=${BASE_URL}" \
    -v "${DATA_VOLUME}:/data/ucan-store" \
    -v "${IPFS_VOLUME}:/data/ipfs" \
    "$IMAGE" >/dev/null

  for _ in $(seq 1 90); do
    if docker exec \
      -e UCAN_STORE_SMOKE_BASE_URL=http://127.0.0.1:8080 \
      -e UCAN_STORE_SMOKE_TIMEOUT_MS=1000 \
      "$CONTAINER" \
      node /app/akash/service/scripts/smoke.mjs >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  docker exec \
    "$CONTAINER" \
    node -e "const r = await fetch('http://127.0.0.1:8080/service-manifest.json'); if (!r.ok) throw new Error(String(r.status)); const j = await r.json(); console.log((j.manifest ?? j).serviceDid)"

  docker rm -f "$CONTAINER" >/dev/null 2>&1
}

first_did="$(run_once)"
second_did="$(run_once)"

if [ "$first_did" != "$second_did" ]; then
  echo "Service DID changed across restarts: ${first_did} != ${second_did}" >&2
  exit 1
fi

case "$first_did" in
  did:*) ;;
  *)
    echo "Service DID is not a DID: ${first_did}" >&2
    exit 1
    ;;
esac

echo "Service identity persisted across restarts: ${first_did}"
