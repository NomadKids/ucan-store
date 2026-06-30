# Akash Deploy Client

This directory is reserved for the Akash-native browser deploy client.

The implementation should be adapted from the current `akash-deploy-pwa` approach:

- Use `@akashnetwork/chain-sdk/web`.
- Use Keplr/Leap browser signer.
- Generate SDL from `akash/sdl/ucan-store.template.yml`.
- Validate SDL and generate manifest in the browser.
- Create certificate, deployment, lease, and manifest upload through Akash.
- Resolve provider `hostUri` before lease creation.
- Avoid Aleph and relay-button code paths entirely.

## First code targets

- `src/config/networks.ts`: Akash network config.
- `src/akash/deployService.ts`: deployment, bid, lease, provider manifest helpers.
- `src/akash/ucanStoreSdl.ts`: SDL template rendering.
- `src/wallet/keplr.ts`: wallet connection.
- `src/App.tsx`: deploy UI.

Provider CORS is the gating risk. See `../docs/provider-cors.md`.
