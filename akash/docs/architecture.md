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

For the first Akash version, prefer a service `did:key` because Akash provider hostnames are discovered after lease creation. A stable `did:web` can be added later when a custom domain is attached.

## Persistence

Akash persistent storage should back:

- `/data/ipfs`
- `/data/ucan-store`

The current starter imports the UI into IPFS and starts the upload API. A follow-up should persist the upload service identity and upload/revocation indexes rather than depending on in-memory test context.
