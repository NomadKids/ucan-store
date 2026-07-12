# UCAN Store on Akash

This directory contains the Akash-native deployment path for UCAN Store.

The goal is to run the UCAN-authorized upload service and an IPFS gateway inside one Akash workload, then serve the upload UI from the same IPFS node.

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

## Publish image

Pushes to the `akash` branch run the `Akash Service Image` workflow. After the
Docker smoke tests pass, the workflow publishes the tested image to:

```text
ghcr.io/nomadkids/ucan-store-akash:latest
ghcr.io/nomadkids/ucan-store-akash:sha-<commit>
```

GitHub's default `GITHUB_TOKEN` can publish when the package grants this
repository write access. If GHCR returns `write_package` permission errors, add
repository or organization secrets:

```text
GHCR_USERNAME=<GitHub user or org-capable bot>
GHCR_TOKEN=<classic PAT with write:packages, read:packages>
```

After adding or changing these secrets, re-run the failed workflow or push a
change that matches the workflow path filters.

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

## Smoke test locally

To build the image, start a disposable container, verify the public routes, and clean up:

```bash
UCAN_STORE_SMOKE_BUILD=1 bash akash/service/scripts/docker-smoke.sh
```

If your local shell cannot reach Docker's published host port, run the same checks from inside the container:

```bash
UCAN_STORE_SMOKE_MODE=container bash akash/service/scripts/docker-smoke.sh
```

The smoke test checks `/health`, `/service-manifest.json`, browser-style CORS preflight for `/api/`, `/ipfs/<uiCid>/`, `/`, and a root-relative UI asset.

To verify the Akash service identity survives container restarts with the same data volume:

```bash
bash akash/service/scripts/docker-identity-smoke.sh
```

## Smoke test a live Akash deployment

After deploying the SDL and obtaining the provider URL for the exposed service, run:

```bash
bash akash/service/scripts/live-smoke.sh https://<akash-service-host>
```

or:

```bash
UCAN_STORE_LIVE_BASE_URL=https://<akash-service-host> \
  bash akash/service/scripts/live-smoke.sh
```

Optional assertions:

```bash
UCAN_STORE_SMOKE_EXPECTED_SERVICE_DID=did:key:z... \
UCAN_STORE_SMOKE_EXPECTED_PWA_ORIGIN=https://<akash-service-host> \
UCAN_STORE_SMOKE_EXPECTED_SERVICE_ORIGIN=https://<akash-service-host>/api \
  bash akash/service/scripts/live-smoke.sh https://<akash-service-host>
```

The live smoke test does not create an Akash deployment. It verifies a deployment that already exists.
It retries while the service warms up. Tune retries with `UCAN_STORE_LIVE_ATTEMPTS` and `UCAN_STORE_LIVE_RETRY_DELAY_SECONDS`.

## Service identity

The workload creates or loads a persistent Ed25519 service identity at:

```text
/data/ucan-store/service-identity.json
```

That file is stored on the Akash persistent data volume. By default the service advertises the signer DID as a stable `did:key`. To reuse the same key with a configured DID alias, set:

```text
UCAN_STORE_SERVICE_DID=did:web:example.com
```

The raw key file path can also be overridden with `UCAN_STORE_SERVICE_KEY_FILE`.

## Issue a delegation to a browser DID

Set a separate high-entropy `UCAN_STORE_ADMIN_API_TOKEN` in the SDL. When it is
configured, the service exposes protected delegation issuance at both
`/admin/delegations` and `/api/admin/delegations` (plus `/policy`). The service
signer issues authority for the deployment's service/space DID; no external
hosted upload account is involved.

```bash
curl -X POST https://<akash-service-host>/api/admin/delegations \
  -H "Authorization: Bearer $UCAN_STORE_ADMIN_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "targetDid": "did:key:z6Mk...",
    "capabilities": ["space/blob/add", "upload/add", "upload/list"],
    "expirationSeconds": 86400
  }'
```

Copy `delegation.proof` from the response into the PWA's delegation import
form. Treat this bearer token as a deployment secret: it can mint upload
authority and must never be embedded in the UCAN Store PWA.

## Debug SSH

The service image includes optional key-only SSH for debugging Akash workloads. SSH is disabled unless
`UCAN_STORE_SSH_AUTHORIZED_KEYS` is set. When enabled, the entrypoint writes the value to
`/root/.ssh/authorized_keys`, disables password and keyboard-interactive authentication, and starts `sshd`.

The browser deploy PWA can generate an SSH-enabled SDL when `VITE_UCAN_STORE_SSH_PUBLIC_KEY` is set in its
environment. The generated SDL then exposes port `22`; use the provider lease access details to find the external
host and port for `ssh -p <external-port> root@<host>`.

Treat this as a temporary debug path. Do not put private keys into SDL/env, and close or redeploy without SSH when the
debug session is finished.

## TLS and provider ingress certificates

The Akash workload listens on HTTP inside the container. For provider-generated ingress hostnames such as
`*.ingress.<provider-domain>`, TLS is terminated by the provider ingress, so the certificate for that hostname must be
issued and served by the provider. The container cannot fix a self-signed certificate for a provider-controlled ingress
hostname.

For a browser-trusted certificate under a domain we control, attach a custom DNS name to the deployment/provider route,
point DNS at the provider as required by that provider, and set `UCAN_STORE_PUBLIC_ORIGIN=https://<your-domain>` so the
service manifest advertises the final HTTPS origin. A later SDL template can add the exact custom-host routing once the
target provider's supported hostname syntax is confirmed.

## Akash deploy flow

See `docs/deployment-flow.md`.

The command-line deploy path is not affected by browser CORS and should be the first reliable path.

The important constraint for browser-only deployment is that manifest upload currently depends on provider gateway CORS support. The deploy client must resolve provider `hostUri` and warn/stop before lease creation if the chosen provider cannot be used from the browser.

Track the upstream provider gateway issue here:

- https://github.com/akash-network/support/issues/642
