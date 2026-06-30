# Provider Gateway CORS

Browser-only Akash deployments depend on provider gateway CORS support after the wallet transactions succeed.

Required browser calls include:

- `PUT /deployment/{dseq}/manifest`
- `GET /lease/{dseq}/{gseq}/{oseq}/status`
- `GET /lease/{dseq}/{gseq}/{oseq}/manifest`

These calls remain protected by provider authorization. CORS only allows the browser to send already-authorized requests.

## Current limitation

Live provider sampling showed that many active providers either do not respond to browser-style `OPTIONS` preflight requests or return no CORS headers. That means a pure browser app can create the lease and then fail at manifest upload.

## Client behavior

The Akash deploy client should:

- Resolve provider `hostUri` before `createLease`.
- Prefer providers known to support browser manifest upload.
- Warn before spending lease gas if no compatible provider is available.
- Keep the CLI/proxy path documented as an escape hatch, not as the primary flow.

## Provider-side desired behavior

Providers should answer preflights with headers similar to:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, PUT, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 600
Vary: Origin
```
