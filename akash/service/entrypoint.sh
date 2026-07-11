#!/usr/bin/env bash
set -euo pipefail

export IPFS_PATH="${IPFS_PATH:-/data/ipfs}"
export UCAN_STORE_DATA_DIR="${UCAN_STORE_DATA_DIR:-/data/ucan-store}"
export STORACHA_LOCAL_PORT="${STORACHA_LOCAL_PORT:-8787}"
export UCAN_STORE_PUBLIC_PORT="${UCAN_STORE_PUBLIC_PORT:-8080}"
export UCAN_STORE_HEALTH_PORT="${UCAN_STORE_HEALTH_PORT:-8790}"
export KUBO_API_URL="${KUBO_API_URL:-http://127.0.0.1:5001}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-/data}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/data}"

mkdir -p "$IPFS_PATH" "$UCAN_STORE_DATA_DIR" /app/runtime/.well-known /data/caddy

CUSTOM_CADDY_CONF=/app/runtime/caddy-custom-domain.conf
if [ -n "${UCAN_STORE_TLS_DOMAIN:-}" ]; then
  UCAN_STORE_TLS_DOMAIN="${UCAN_STORE_TLS_DOMAIN#http://}"
  UCAN_STORE_TLS_DOMAIN="${UCAN_STORE_TLS_DOMAIN#https://}"
  UCAN_STORE_TLS_DOMAIN="${UCAN_STORE_TLS_DOMAIN%%/*}"
  if [ -n "$UCAN_STORE_TLS_DOMAIN" ]; then
    cat > "$CUSTOM_CADDY_CONF" <<EOF
${UCAN_STORE_TLS_DOMAIN} {
  import ucan_store_routes
}
EOF
    echo "Caddy automatic HTTPS enabled for ${UCAN_STORE_TLS_DOMAIN}."
  else
    printf '# no custom TLS domain configured\n' > "$CUSTOM_CADDY_CONF"
  fi
else
  printf '# no custom TLS domain configured\n' > "$CUSTOM_CADDY_CONF"
fi

SSH_PID=""
if [ -n "${UCAN_STORE_SSH_AUTHORIZED_KEYS:-}" ]; then
  mkdir -p /root/.ssh /run/sshd
  printf '%b\n' "$UCAN_STORE_SSH_AUTHORIZED_KEYS" > /root/.ssh/authorized_keys
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/authorized_keys
  ssh-keygen -A >/dev/null
  /usr/sbin/sshd -D -e > /tmp/ucan-store-sshd.log 2>&1 &
  SSH_PID="$!"
  echo "Debug SSH enabled with key-only root login."
fi

if [ ! -f "$IPFS_PATH/config" ]; then
  ipfs init --profile=server
  ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001
  ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8081
  ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
  ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
fi

ipfs daemon --migrate=true > /tmp/kubo.log 2>&1 &
IPFS_PID="$!"

for _ in $(seq 1 "${UCAN_STORE_IPFS_READY_ATTEMPTS:-120}"); do
  if curl -fsS -X POST "${KUBO_API_URL}/api/v0/id" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS -X POST "${KUBO_API_URL}/api/v0/id" >/dev/null 2>&1; then
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

if ! curl -fsS "http://127.0.0.1:${UCAN_STORE_HEALTH_PORT}/health" >/dev/null 2>&1; then
  echo "UCAN Store service did not become healthy" >&2
  tail -n 200 /tmp/ucan-store-service.log >&2 || true
  exit 1
fi

caddy run --config /app/akash/service/Caddyfile --adapter caddyfile &
CADDY_PID="$!"

cleanup() {
  if [ -n "$SSH_PID" ]; then
    kill "$CADDY_PID" "$SERVICE_PID" "$IPFS_PID" "$SSH_PID" 2>/dev/null || true
  else
    kill "$CADDY_PID" "$SERVICE_PID" "$IPFS_PID" 2>/dev/null || true
  fi
}

trap cleanup TERM INT
if [ -n "$SSH_PID" ]; then
  wait -n "$CADDY_PID" "$SERVICE_PID" "$IPFS_PID" "$SSH_PID"
else
  wait -n "$CADDY_PID" "$SERVICE_PID" "$IPFS_PID"
fi
