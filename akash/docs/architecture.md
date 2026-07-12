# Akash Architecture

## Target

UCAN Store should run as a self-contained Akash workload:

```text
Akash workload
  Caddy public listener :8080
    /                         -> local IPFS gateway, pinned UI CID
    /ipfs/*                   -> local IPFS gateway
    /api/*                    -> UCAN upload service
    /.well-known/ucan-store.json -> runtime manifest
    /service-manifest.json    -> runtime manifest
    /health                   -> upload service, IPFS, and manifest health

  Kubo/IPFS
    API     127.0.0.1:5001
    Gateway 127.0.0.1:8081
    Repo    /data/ipfs

  UCAN upload service
    HTTP    127.0.0.1:8787
    State   /data/ucan-store

  Health server
    HTTP    127.0.0.1:8790
```

The upload UI continues to be a static Vite app from `web/`. At container startup, the built UI is added to the local IPFS node and served back through the gateway.

## Service discovery

The UI already supports service discovery through:

- `/.well-known/ucan-store.json`
- `/service-manifest.json`
- `VITE_UPLOAD_SERVICE_URL`
- `VITE_UPLOAD_SERVICE_DID`

The Akash service writes a runtime manifest that points the UI at the same workload:

```json
{
  "kind": "ucan-store/service-manifest",
  "version": 1,
  "serviceDid": "did:key:z...",
  "serviceOrigin": "https://example.invalid/api",
  "revocationUrl": "https://example.invalid/api",
  "receiptsUrl": "https://example.invalid/api/receipt/"
}
```

## DID strategy

For the first Akash version, prefer a service `did:key` because Akash provider hostnames are discovered after lease creation. The service creates or loads the Ed25519 signer from `/data/ucan-store/service-identity.json`, so the advertised DID remains stable across container restarts when the Akash data volume is retained.

A stable `did:web` can be configured later when a custom domain is attached:

```text
UCAN_STORE_SERVICE_DID=did:web:example.com
```

The same stored key is reused for the DID alias.

## Persistence

The workload stores mutable data under:

- `/data/ipfs`
- `/data/ucan-store`

The current starter imports the UI into IPFS and starts the upload API. The service identity survives container restarts while the same volume remains attached, but replacement-deployment recovery is not yet guaranteed by the current SDL. Back up or inject identity material before relying on stable delegations across deployment replacement. Upload/revocation indexes still use the in-memory test context and should move to durable storage in a later phase.

## Delegation issuance

The initial self-contained authority model uses the persistent service signer as
the deployment space authority. A separate bearer token protects the operator
endpoints:

```text
GET  /api/admin/delegations/policy
POST /api/admin/delegations
```

The service validates the target `did:key`, capability allowlist, and bounded
expiration, then returns an importable UCAN CAR proof. A later hardening phase
will place an offline admin DID above the online service signer and inject an
`admin -> service` root proof at deployment time.
