# UCAN Store on Akash

This directory contains the Akash-native deployment path for UCAN Store.

The goal is to run the upload service and an IPFS gateway inside one Akash workload, then serve the upload UI from the IPFS node hosted by that workload.

Out of scope for this branch:

- Aleph deployments.
- relay-button tooling.
- relay-specific UI or bootstrap flows.
- server-side deployment control planes outside Akash.

The browser deploy client should use `@akashnetwork/chain-sdk/web` with a browser wallet signer.

## Layout

```text
akash/
  client/        Akash-native browser deploy client plan and future code
  docs/          architecture and deployment notes
  sdl/           Akash SDL templates
  service/       service image, proxy config, and runtime wrapper
```

## Current milestone

This branch starts with a service container skeleton and an SDL template. The service image builds the existing `web/` app, starts Kubo/IPFS, pins the UI into the local IPFS node, starts the UCAN upload API, and proxies:

- `/` to the UI CID via local IPFS gateway
- `/ipfs/*` to the local IPFS gateway
- `/api/*` to the upload service
- `/.well-known/ucan-store.json` and `/service-manifest.json` to runtime service metadata

## Build

From the repository root:

```bash
docker build -f akash/service/Dockerfile -t ucan-store-akash:local .
```

## Run locally

```bash
docker run --rm -p 8080:8080 \
  -e UCAN_STORE_PUBLIC_ORIGIN=http://localhost:8080 \
  -v ucan-store-ipfs:/data/ipfs \
  -v ucan-store-data:/data/ucan-store \
  ucan-store-akash:local
```

Then open:

```text
http://localhost:8080/
http://localhost:8080/health
http://localhost:8080/service-manifest.json
http://localhost:8080/ipfs/<cid>
```

## Akash deploy flow

See `docs/deployment-flow.md`.

The command-line deploy path is not affected by browser CORS and should be the first reliable path.

The important constraint for browser-only deployment is that manifest upload currently depends on provider gateway CORS support. The deploy client must resolve provider `hostUri` and warn/stop before lease creation if the chosen provider cannot be used from the browser.

Track the upstream provider gateway issue here:

- https://github.com/akash-network/support/issues/642
