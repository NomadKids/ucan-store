// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeGlobals = globalThis as typeof globalThis & {
  __UPLOAD_SERVICE_URL__?: string;
  __UPLOAD_SERVICE_DID__?: string;
  __REVOCATION_URL__?: string;
  __REVOCATION_DID__?: string;
  __RECEIPTS_URL__?: string;
  __SERVICE_MANIFEST_URL__?: string;
};

function clearRuntimeGlobals() {
  delete runtimeGlobals.__UPLOAD_SERVICE_URL__;
  delete runtimeGlobals.__UPLOAD_SERVICE_DID__;
  delete runtimeGlobals.__REVOCATION_URL__;
  delete runtimeGlobals.__REVOCATION_DID__;
  delete runtimeGlobals.__RECEIPTS_URL__;
  delete runtimeGlobals.__SERVICE_MANIFEST_URL__;
}

describe('service config runtime discovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    localStorage.clear();
    clearRuntimeGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('uses explicit runtime overrides without fetching a manifest', async () => {
    runtimeGlobals.__UPLOAD_SERVICE_URL__ = 'https://runtime.example.com';
    runtimeGlobals.__UPLOAD_SERVICE_DID__ = 'did:web:runtime.example.com';
    runtimeGlobals.__REVOCATION_URL__ = 'https://runtime.example.com/revocations';

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { initializeServiceConfig, getServiceConfig } = await import('./service-config');
    const config = await initializeServiceConfig();

    expect(config.source).toBe('runtime-overrides');
    expect(config.uploadServiceUrl).toBe('https://runtime.example.com');
    expect(config.uploadServiceDid).toBe('did:web:runtime.example.com');
    expect(config.revocationUrl).toBe('https://runtime.example.com/revocations');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getServiceConfig().uploadServiceDid).toBe('did:web:runtime.example.com');
  });

  it('loads the same-origin manifest and caches the resolved binding', async () => {
    const origin = window.location.origin;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${origin}/.well-known/ucan-store.json`) {
          return new Response(
            JSON.stringify({
              status: 'ok',
              manifest: {
                serviceDid: 'did:web:upload.example.com',
                serviceOrigin: 'https://upload.example.com',
                pwaOrigin: origin,
                revocationUrl: 'https://upload.example.com/revocations',
                receiptsUrl: 'https://upload.example.com/receipt/',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('not found', { status: 404 });
      })
    );

    const { initializeServiceConfig } = await import('./service-config');
    const config = await initializeServiceConfig();

    expect(config.source).toBe('manifest');
    expect(config.uploadServiceUrl).toBe('https://upload.example.com');
    expect(config.uploadServiceDid).toBe('did:web:upload.example.com');
    expect(config.revocationDid).toBe('did:web:upload.example.com');
    expect(runtimeGlobals.__UPLOAD_SERVICE_URL__).toBe('https://upload.example.com');

    const cached = localStorage.getItem(`ucan-store.service-config:${origin}`);
    expect(cached).toBeTruthy();
    expect(cached).toContain('https://upload.example.com');
  });

  it('falls back to a cached binding when manifest fetches fail', async () => {
    const origin = window.location.origin;
    localStorage.setItem(
      `ucan-store.service-config:${origin}`,
      JSON.stringify({
        config: {
          uploadServiceUrl: 'https://cached-upload.example.com',
          uploadServiceDid: 'did:web:cached-upload.example.com',
          revocationUrl: 'https://cached-upload.example.com',
          revocationDid: 'did:web:cached-upload.example.com',
          receiptsUrl: 'https://cached-upload.example.com/receipt/',
        },
        manifestUrl: `${origin}/.well-known/ucan-store.json`,
        cachedAt: '2026-06-18T00:00:00.000Z',
      })
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 }))
    );

    const { initializeServiceConfig } = await import('./service-config');
    const config = await initializeServiceConfig();

    expect(config.source).toBe('cache');
    expect(config.uploadServiceUrl).toBe('https://cached-upload.example.com');
    expect(config.uploadServiceDid).toBe('did:web:cached-upload.example.com');
  });

  it('falls back to env-configured service manifests when same-origin discovery is absent', async () => {
    runtimeGlobals.__SERVICE_MANIFEST_URL__ = 'https://upload.example.com/.well-known/ucan-store.json';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === 'https://upload.example.com/.well-known/ucan-store.json') {
          return new Response(
            JSON.stringify({
              status: 'ok',
              manifest: {
                serviceDid: 'did:web:upload.example.com',
                serviceOrigin: 'https://upload.example.com',
                revocationUrl: 'https://upload.example.com',
                receiptsUrl: 'https://upload.example.com/receipt/',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('not found', { status: 404 });
      })
    );

    const { initializeServiceConfig } = await import('./service-config');
    const config = await initializeServiceConfig();

    expect(config.source).toBe('manifest');
    expect(config.manifestUrl).toBe('https://upload.example.com/.well-known/ucan-store.json');
    expect(config.uploadServiceUrl).toBe('https://upload.example.com');
  });
});
