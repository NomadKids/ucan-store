import { test, expect } from '@playwright/test';

const shouldRun = process.env.PLAYWRIGHT_LIVE_UCAN_STORE === '1';
const pwaOrigin = process.env.PLAYWRIGHT_BASE_URL ?? 'https://ucan.nicokrause.com';
const apiOrigin = process.env.UCAN_STORE_LIVE_API_ORIGIN ?? 'https://ucan-api.nicokrause.com';
const serviceDid = process.env.UCAN_STORE_LIVE_SERVICE_DID ?? 'did:web:ucan-api.nicokrause.com';

test.describe('Live ucan-store deployment smoke', () => {
  test.skip(!shouldRun, 'Set PLAYWRIGHT_LIVE_UCAN_STORE=1 to run live deployment smoke tests.');

  test('serves the PWA and resolves the live service manifest in the browser', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveTitle(/UCAN Upload Wall|ucan-store/i);
    await expect(page.getByText(/UCAN Upload Wall|ucan-store/i).first()).toBeVisible();

    const runtimeConfig = await page.evaluate(() => ({
      uploadServiceUrl: globalThis.__UPLOAD_SERVICE_URL__,
      uploadServiceDid: globalThis.__UPLOAD_SERVICE_DID__,
      revocationUrl: globalThis.__REVOCATION_URL__,
      receiptsUrl: globalThis.__RECEIPTS_URL__,
      cached: localStorage.getItem(`ucan-store.service-config:${window.location.origin}`),
    }));

    expect(runtimeConfig.uploadServiceUrl).toBe(apiOrigin);
    expect(runtimeConfig.uploadServiceDid).toBe(serviceDid);
    expect(runtimeConfig.revocationUrl).toBe(apiOrigin);
    expect(runtimeConfig.receiptsUrl).toBe(`${apiOrigin}/receipt/`);
    expect(runtimeConfig.cached).toContain(apiOrigin);
  });

  test('exposes API discovery and guarded endpoints over the custom API domain', async ({ request }) => {
    const didResponse = await request.get(`${apiOrigin}/.well-known/did.json`);
    expect(didResponse.status()).toBe(200);
    const didDocument = await didResponse.json();
    expect(didDocument.id).toBe(serviceDid);

    const manifestResponse = await request.get(`${apiOrigin}/.well-known/ucan-store.json`);
    expect(manifestResponse.status()).toBe(200);
    const manifestEnvelope = await manifestResponse.json();
    expect(manifestEnvelope.status).toBe('ok');
    expect(manifestEnvelope.manifest.serviceOrigin).toBe(apiOrigin);
    expect(manifestEnvelope.manifest.serviceDid).toBe(serviceDid);
    expect(manifestEnvelope.manifest.pwaOrigin).toBe(pwaOrigin.replace(/\/$/, ''));
    expect(manifestEnvelope.manifest.revocationUrl).toBe(apiOrigin);
    expect(manifestEnvelope.manifest.receiptsUrl).toBe(`${apiOrigin}/receipt/`);

    const receiptResponse = await request.get(`${apiOrigin}/receipt/`);
    expect(receiptResponse.status()).toBe(204);

    const policyResponse = await request.get(`${apiOrigin}/admin/delegations/policy`);
    expect(policyResponse.status()).toBe(401);

    const uploadInvocationResponse = await request.get(apiOrigin);
    expect(uploadInvocationResponse.status()).toBe(415);
    expect(uploadInvocationResponse.headers()['accept']).toBe('application/vnd.ipld.car');
  });
});
