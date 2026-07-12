# UCAN Store documentation

The current product and operator documentation starts here:

- [Project overview and browser delegation flow](../README.md)
- [Akash workload and image](../akash/README.md)
- [Akash architecture](../akash/docs/architecture.md)
- [Akash deployment flow](../akash/docs/deployment-flow.md)
- [Provider gateway CORS notes](../akash/docs/provider-cors.md)
- [Security status](../SECURITY.md)
- [Active Akash roadmap](https://github.com/NomadKids/ucan-store/issues/8)

## Historical design records

The remaining documents in this directory describe earlier Upload Wall, hosted-service, WebAuthn, keystore, and revocation experiments. They are retained because they explain design decisions and compatibility code, but they are not the current deployment guide.

In particular, documents that describe a hosted third-party upload service, direct account credentials, or a global hosted revocation registry should not be followed for a new UCAN Store deployment. The current model is:

```text
self-hosted service DID -> child UCAN delegation -> browser DID
```

The service is deployed with its own Kubo node and runtime manifest. Browser users receive an importable delegation from the protected service admin endpoint.
