# ucan-store on Aleph

This directory contains the `ucan-store`-owned contract for building and
deploying the upload-service VM with the shared `NiKrause/relay-button`
tooling.

The base VM profile exposes only:

- `22/tcp` for SSH
- `80/tcp` for the temporary setup endpoint used during deployment
- `443/tcp` for the public HTTPS upload API, DID document, revocation,
  receipts, admin delegation issuance, and service manifest

Public Helia/libp2p gateway exposure is intentionally a later milestone. The
local service can still enable its internal Helia helper with
`UCAN_STORE_ENABLE_HELIA=1` for local development.

## Required Secrets

- `ALEPH_PRIVATE_KEY`: EVM private key used to publish the rootfs and deploy
  the VM. By default, the VM workflow also derives the UCAN admin Ed25519 key
  and root delegation proof from this key using relay-button's domain-separated
  `derive-from-aleph-private-key` bootstrap mode.
- `VM_SSH_PUBLIC_KEY`: SSH public key installed into deployed VMs when the
  workflow input does not override it.

## Optional Secrets

- `UCAN_STORE_BOOTSTRAP_JSON`: canonical bootstrap package for the VM. When set,
  this explicit package overrides automatic derivation. It includes the admin
  DID, service DID/origin binding, space DID, allowed capabilities, and root
  delegation proof.
- `UCAN_STORE_ADMIN_API_TOKEN`: optional bearer token installed on the VM to
  enable `POST /admin/delegations` and `GET /admin/delegations/policy`. Set this
  before deploying a VM when operators need the service to mint long-lived
  user delegation proofs for manual UI import.

## Recommended Variables

- `UCAN_STORE_BOOTSTRAP_MODE`: bootstrap package mode. Defaults to
  `derive-from-aleph-private-key`; set an empty value only when providing
  `UCAN_STORE_BOOTSTRAP_JSON`.
- `UCAN_STORE_SERVICE_DID`: public service DID, for example
  `did:web:ucan-api.example.com`.
- `UCAN_STORE_SERVICE_ORIGIN`: public HTTPS origin of the upload-service VM.
- `UCAN_STORE_PWA_ORIGIN`: public HTTPS origin of the paired PWA, for example
  `https://ucan.nicokrause.com`.
- `UCAN_STORE_API_DOMAIN`: optional Aleph instance custom domain for the upload
  service VM, for example `ucan-api.nicokrause.com`. When set, the VM workflow
  publishes an Aleph `domains` aggregate that points this domain to the deployed
  instance.
- `UCAN_STORE_ALLOWED_CAPABILITIES`: comma-separated capabilities included in
  the generated bootstrap package.
- `UCAN_STORE_ADMIN_DID`: DID of the admin that owns the root delegation. This
  is normally emitted by automatic derivation and is only needed as a manual
  override or documentation hint.
- `ALEPH_VM_CRN_HASH`: optional CRN hash when deployments should target a
  specific Aleph CRN.

The upload-service VM must not receive the admin private key. It receives only
the bootstrap package and validates that request proofs chain back to the root
delegation.

## API Domain and Delegation Endpoints

The production deployment uses two separate domains:

- PWA/static domain: `ucan.nicokrause.com`, served by Aleph IPFS hosting
- API/service domain: `ucan-api.nicokrause.com`, served by the upload-service VM

For the API/service domain, configure DNS as an Aleph instance custom domain:

- `CNAME ucan-api.nicokrause.com -> ucan-api.nicokrause.com.instance.public.aleph.sh`
- `TXT _control.ucan-api.nicokrause.com -> <Aleph deploy owner address>`
- Cloudflare proxy mode must be DNS-only.

The API/service domain is expected to expose:

- `/.well-known/did.json`
- `/.well-known/ucan-store.json`
- `/service-manifest.json`
- `/receipt/`
- the UCAN upload API surface
- `GET /admin/delegations/policy`
- `POST /admin/delegations`

`GET /admin/delegations/policy` and `POST /admin/delegations` require
`Authorization: Bearer $UCAN_STORE_ADMIN_API_TOKEN` when issuance is enabled.
They are used to mint long-lived, UI-importable child delegations from the
service DID to a user DID.

Implementation note: the shared `relay-button` deploy action publishes the
Aleph instance-domain aggregate with `type: "instance"` and a numeric
`updated_at` timestamp. If the public API domain presents the CRN frontend
certificate or returns `404: Invalid message reference`, verify that the latest
aggregate points to the current instance hash and that Aleph's
`*.instance.public.aleph.sh` frontend has caught up before debugging the guest
service itself.
