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
  the VM.
- `VM_SSH_PUBLIC_KEY`: SSH public key installed into deployed VMs when the
  workflow input does not override it.
- `UCAN_STORE_BOOTSTRAP_JSON`: canonical bootstrap package for the VM. This
  includes the admin DID, service DID/origin binding, space DID, allowed
  capabilities, and root delegation proof.

## Recommended Variables

- `UCAN_STORE_ADMIN_DID`: DID of the admin that owns the root delegation.
- `ALEPH_VM_CRN_HASH`: optional CRN hash when deployments should target a
  specific Aleph CRN.

The upload-service VM must not receive the admin private key. It receives only
the bootstrap package and validates that request proofs chain back to that root
delegation.
