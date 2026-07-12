# UCAN Store

UCAN Store is a self-hosted, capability-authorized file upload service. A browser creates a DID, receives a narrowly scoped UCAN delegation, and uses that proof to upload, list, remove, and retrieve content without sending its private key to the service.

The current deployment target is [Akash Network](https://akash.network/). One workload contains:

- the React upload PWA;
- a UCAN-compatible upload API;
- a persistent Ed25519 service identity;
- Kubo/IPFS storage and an HTTP gateway;
- Caddy for public routing, CORS, and optional custom-domain TLS.

> Status: experimental. The service still uses an in-memory upload/revocation index and has not received a security audit. Do not treat it as production-grade storage or authorization infrastructure yet. See [SECURITY.md](./SECURITY.md).

## How it works

```text
Akash operator deploys UCAN Store
  -> workload creates/loads a service DID
  -> operator keeps a separate delegation admin token

Browser creates a passkey-backed DID
  -> operator issues a limited UCAN delegation to that DID
  -> browser imports the delegation proof
  -> browser signs upload/list/remove invocations
  -> service verifies the DID, capability, resource, proof chain, and expiry
  -> uploaded CAR/blob data is imported into local Kubo
```

The runtime service manifest is available at:

```text
/.well-known/ucan-store.json
/service-manifest.json
```

It publishes the service DID, upload API origin, revocation/receipt endpoints, IPFS gateway, UI CID, and supported capabilities. This lets the same static PWA discover the service selected at deployment time.

## Repository layout

```text
akash/                 Akash workload, SDL, routing, smoke tests, and docs
web/                   Browser PWA and UCAN delegation client
local-storacha-api/    Legacy directory name for the embedded upload-api adapter
aleph/                 Earlier Aleph deployment path retained for reference
docs/                  Historical architecture and security documents
```

The `local-storacha-api` name and `@storacha/*` dependencies remain temporarily because the self-hosted adapter is built on that open-source upload-service/UCAN implementation. They do not mean that uploads are sent to a hosted Storacha service.

## Deploy on Akash

The recommended operator experience is the companion [Akash Deploy PWA](https://github.com/NiKrause/akash-deploy-pwa). It connects to Keplr or Leap, creates the Akash deployment and lease, uploads the manifest, discovers provider access details, and renders the UCAN Store SDL.

The template configures two distinct high-entropy secrets:

- `UCAN_STORE_CONFIGURE_TOKEN`: permits changing the runtime public origin through `POST /configure`.
- `UCAN_STORE_ADMIN_API_TOKEN`: permits issuing UCAN delegations through the protected admin API.

Never reuse or publish either token. The delegation admin token is more powerful because it can mint upload authority.

For the container, SDL, custom-domain, SSH, and smoke-test details, see [akash/README.md](./akash/README.md).

## Give a browser upload authority

1. Open the deployed UCAN Store PWA.
2. Create the browser DID in the Delegations tab.
3. Copy the `did:key:z...` value.
4. In Akash Deploy PWA, replace `REPLACE-WITH-BROWSER-DID` in the editable curl helper.
5. Run the command and copy `delegation.proof` from the JSON response.
6. Import that proof in UCAN Store.

Equivalent API request:

```bash
curl -X POST 'https://YOUR-UCAN-STORE-HOST/api/admin/delegations' \
  -H 'Authorization: Bearer YOUR-DELEGATION-ADMIN-TOKEN' \
  -H 'Content-Type: application/json' \
  --data '{
    "targetDid": "did:key:z6Mk...",
    "capabilities": ["space/blob/add", "upload/add", "upload/list"],
    "expirationSeconds": 86400
  }'
```

The response contains a `ucan-car-multibase-base64` proof beginning with `m`. The browser verifies that the proof audience exactly matches its current DID before storing it.

## Public routes

| Route | Purpose |
| --- | --- |
| `/` | PWA served from the pinned UI CID |
| `/api/*` | UCAN upload API |
| `/api/admin/delegations/policy` | Protected issuance policy |
| `/api/admin/delegations` | Protected child-delegation issuance |
| `/ipfs/<cid>` | Local Kubo HTTP gateway |
| `/health` | Upload service, Kubo, and manifest health |
| `/configure` | Protected runtime-origin configuration |
| `/.well-known/did.json` | Service DID document |
| `/.well-known/ucan-store.json` | Runtime discovery manifest |

## Local development

Build and smoke-test the complete workload:

```bash
UCAN_STORE_SMOKE_BUILD=1 bash akash/service/scripts/docker-smoke.sh
```

Run the web application separately:

```bash
cd web
npm ci
npm run dev
```

Useful checks:

```bash
cd web
npm run build
npm test -- --run

cd ..
bash akash/service/scripts/docker-identity-smoke.sh
bash akash/service/scripts/live-smoke.sh https://YOUR-DEPLOYMENT
```

## Current limitations and roadmap

- Upload metadata and revocations still use an in-memory test context.
- Akash volume persistence and identity recovery need a documented, tested production design.
- The online service signer is the initial space authority; a later hardening milestone adds an offline admin root delegation.
- The old direct-credential UI has been retired in favor of service-issued browser delegations.
- Some internal source names and compatibility dependencies still reference the predecessor implementation.
- Custom-domain TLS depends on the provider exposing the required ports correctly.

The active Akash roadmap is tracked in [issue #8](https://github.com/NomadKids/ucan-store/issues/8). The older [PLANNING.md](./PLANNING.md) and several files under `docs/` are historical design records, not the current deployment guide.

## Acknowledgements

UCAN Store builds on the protocol and open-source engineering developed by the [Storacha](https://storacha.network/) and web3.storage communities, especially [ucanto](https://github.com/storacha/ucanto), the upload client/capability packages, and the upload-service architecture. Storacha's hosted upload-service lifecycle changed, so this project now runs that lineage as a self-hosted service rather than depending on the hosted network. We retain this acknowledgement and the relevant package history while presenting the current product as UCAN Store.

Additional standards:

- [UCAN](https://ucan.xyz/)
- [DID Key Method](https://w3c-ccg.github.io/did-method-key/)
- [WebAuthn](https://www.w3.org/TR/webauthn-3/)
- [IPFS](https://ipfs.tech/)
- [Akash Network](https://akash.network/)

## License

See [LICENSE](./LICENSE).
