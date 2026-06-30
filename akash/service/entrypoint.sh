#!/usr/bin/env bash
set -euo pipefail

export IPFS_PATH="${IPFS_PATH:-/data/ipfs}"
export UCAN_STORE_DATA_DIR="${UCAN_STORE_DATA_DIR:-/data/ucan-store}"
export STORACHA_LOCAL_PORT="${STORACHA_LOCAL_PORT:-8787}"
export UCAN_STORE_PUBLIC_PORT="${UCAN_STORE_PUBLIC_PORT:-8080}"
export UCAN_STORE_HEALTH_PORT="${UCAN_STORE_HEALTH_PORT:-8790}"

mkdir -p "$IPFS_PATH" "$UCAN_STORE_DATA_DIR" /app/runtime/.well-known

if [ ! -f "$IPFS_PATH/config" ]; then
  ipfs init --profile=server
  ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001
  ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8081
  ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
  ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
fi

ipfs daemon --migrate=true > /tmp/kubo.log 2>&1 &
IPFS_PID="$!"

for _ in $(seq 1 60); do
  if ipfs id >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! ipfs id >/dev/null 2>&1; then
  echo "Kubo did not become ready" >&2
  tail -n 200 /tmp/kubo.log >&2 || true
  exit 1
fi

export UCAN_STORE_UI_CID
UCAN_STORE_UI_CID="$(ipfs add -Qr /app/web/dist)"
ipfs pin add "$UCAN_STORE_UI_CID" >/dev/null
echo "UCAN Store UI CID: $UCAN_STORE_UI_CID"

node /app/akash/service/src/server.mjs > /tmp/ucan-store-service.log 2>&1 &
SERVICE_PID="$!"

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${UCAN_STORE_HEALTH_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

caddy run --config /app/akash/service/Caddyfile --adapter caddyfile &
CADDY_PID="$!"

trap 'kill "$CADDY_PID" "$SERVICE_PID" "$IPFS_PID" 2>/dev/null || true' TERM INT
wait -n "$CADDY_PID" "$SERVICE_PID" "$IPFS_PID"
