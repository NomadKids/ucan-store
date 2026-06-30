FROM node:22-bookworm

ARG KUBO_VERSION=0.32.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl caddy tini \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://dist.ipfs.tech/kubo/v${KUBO_VERSION}/kubo_v${KUBO_VERSION}_linux-amd64.tar.gz" -o /tmp/kubo.tar.gz \
  && tar -xzf /tmp/kubo.tar.gz -C /tmp \
  && /tmp/kubo/install.sh \
  && rm -rf /tmp/kubo /tmp/kubo.tar.gz

WORKDIR /app

COPY web/package*.json ./web/
RUN cd web && npm ci

COPY web ./web
RUN cd web && npm run build

COPY local-storacha-api ./local-storacha-api
COPY akash/service ./akash/service

RUN chmod +x /app/akash/service/entrypoint.sh

ENV NODE_ENV=production
ENV IPFS_PATH=/data/ipfs
ENV UCAN_STORE_DATA_DIR=/data/ucan-store
ENV STORACHA_LOCAL_PORT=8787
ENV UCAN_STORE_PUBLIC_PORT=8080

VOLUME ["/data/ipfs", "/data/ucan-store"]
EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--", "/app/akash/service/entrypoint.sh"]
