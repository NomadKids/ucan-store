# Akash Deployment Flow

The deploy client should be browser-native and use the Akash SDK directly.

## Client steps

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

## Required SDK-only rule

The client deployment path must use:

- `@akashnetwork/chain-sdk/web`
- browser wallet signer
- Akash REST/RPC endpoints
- Akash provider gateway APIs

It must not use:

- Aleph deployment APIs
- relay-button
- relay-specific account derivation
- non-Akash deployment brokers
