# Akash Deployment Flow

There are two deployment modes:

- Command-line deployment, which should be the first reliable path because it is not affected by browser CORS.
- Browser-only deployment, which should continue to use `akash-deploy-pwa` as the reference Akash SDK implementation.

Browser-only provider gateway support is tracked upstream in:

- https://github.com/akash-network/support/issues/642

## Browser client steps

1. Connect Keplr or Leap.
2. Select Akash network.
3. Render the UCAN Store SDL from `akash/sdl/ucan-store.template.yml`.
4. Validate the SDL with `@akashnetwork/chain-sdk/web`.
5. Create an Akash client certificate if missing.
6. Create deployment.
7. Poll bids.
8. Resolve each bidder provider `hostUri`.
9. Check browser compatibility before lease creation.
10. Pick a compatible bid.
11. Create lease.
12. Upload manifest.
13. Poll lease status.
14. Open the public upload UI URI from lease status.

## Why provider checks must happen before lease creation

The browser can create the on-chain deployment and lease, but manifest upload goes to the provider gateway. Many provider gateways currently do not answer CORS preflight requests for manifest upload or lease status.

The deploy client should not blindly pick the cheapest bid and create a lease. It should first resolve the provider host and warn if browser upload is likely to fail.

This check is only needed for browser deployment. A CLI deploy flow can upload the manifest directly because CORS is not enforced outside browsers.

## CLI deployment path

The command-line path should use the generated SDL and either:

- the official Akash CLI, or
- a Node CLI using Akash SDK/CosmJS signing from a local key.

This path should be the first working deployment route for UCAN Store on Akash. It can create the deployment, create the lease, send the manifest, and query lease status without browser CORS restrictions.

After the provider exposes the service URL, verify the live workload with:

```bash
bash akash/service/scripts/live-smoke.sh https://<akash-service-host>
```

The live smoke reuses the same HTTP contract as local Docker smoke tests and verifies `/health`, `/service-manifest.json`, `/api` CORS preflight, `/ipfs/<uiCid>/`, `/`, and UI asset routing. It retries while the service warms up, but it does not create a deployment by itself.

## Required SDK-only rule

The browser client deployment path must use:

- `@akashnetwork/chain-sdk/web`
- browser wallet signer
- Akash REST/RPC endpoints
- Akash provider gateway APIs

It must not use:

- Aleph deployment APIs
- relay-button
- relay-specific account derivation
- non-Akash deployment brokers
