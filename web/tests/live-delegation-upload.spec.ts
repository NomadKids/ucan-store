import { test, expect, BrowserContext, Page } from '@playwright/test';
import { enableVirtualAuthenticator, disableVirtualAuthenticator } from './helpers/webauthn';

const shouldRun = process.env.PLAYWRIGHT_LIVE_UCAN_STORE === '1';
const adminToken = process.env.UCAN_STORE_ADMIN_API_TOKEN ?? '';
const apiOrigin = process.env.UCAN_STORE_LIVE_API_ORIGIN ?? 'https://ucan-api.nicokrause.com';

test.describe('Live ucan-store delegation and upload flow', () => {
  test.skip(!shouldRun, 'Set PLAYWRIGHT_LIVE_UCAN_STORE=1 to run live deployment tests.');
  test.skip(!adminToken, 'Set UCAN_STORE_ADMIN_API_TOKEN to mint a live service-issued delegation.');

  let context: BrowserContext;
  let page: Page;
  let cdpSession: { client: unknown; authenticatorId: string };

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    page = await context.newPage();
    cdpSession = await enableVirtualAuthenticator(context);

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    if (cdpSession) {
      await disableVirtualAuthenticator(cdpSession.client, cdpSession.authenticatorId).catch(() => {});
    }
    await context?.close().catch(() => {});
  });

  async function createDidInUi(): Promise<string> {
    await page.getByRole('button', { name: /delegations/i }).click();

    const createButton = page.getByTestId('create-did-button');
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await expect(createButton).toBeEnabled({ timeout: 5000 });
    await createButton.click();

    const didElement = page.getByTestId('did-display');
    await expect(didElement).toBeVisible({ timeout: 15000 });
    const did = (await didElement.textContent())?.trim();
    expect(did).toMatch(/^did:key:z6Mk/);
    return did as string;
  }

  async function mintDelegation(targetDid: string): Promise<string> {
    const response = await page.request.post(`${apiOrigin}/admin/delegations`, {
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      data: {
        targetDid,
        capabilities: ['space/blob/add', 'upload/add', 'upload/list'],
        expirationSeconds: 24 * 60 * 60,
      },
    });

    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe('ok');
    expect(payload.delegation.audienceDid).toBe(targetDid);
    expect(payload.delegation.proofFormat).toBe('ucan-car-multibase-base64');
    expect(payload.delegation.proof).toMatch(/^m[A-Za-z0-9+/=]+$/);
    return payload.delegation.proof as string;
  }

  async function importDelegation(proof: string): Promise<void> {
    await page.getByRole('button', { name: /delegations/i }).click();

    await page.getByRole('button', { name: /import delegation/i }).click();
    await page.getByPlaceholder(/e.g., Alice's Upload Token/i).fill('Live service-issued delegation');
    await page.getByPlaceholder(/Paste your base64 UCAN token here/i).fill(proof);
    await page.locator('button:has-text("Import UCAN Token")').last().click();

    await expect(page.getByText(/Delegation imported/i)).toBeVisible({ timeout: 15000 });
  }

  async function uploadSmallFile(): Promise<void> {
    await page.getByRole('button', { name: /upload files/i }).click();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'live-ucan-store-smoke.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(`ucan-store live smoke ${new Date().toISOString()}\n`, 'utf8'),
    });

    await page.getByRole('button', { name: /upload to storacha/i }).click();

    await expect(page.getByText(/Successfully uploaded live-ucan-store-smoke\.txt/i)).toBeVisible({
      timeout: 120000,
    });
    await expect(page.getByText('live-ucan-store-smoke.txt')).toBeVisible({ timeout: 10000 });
  }

  test('mints a service-issued delegation, imports it, and uploads via the live API', async () => {
    test.setTimeout(180000);

    const targetDid = await createDidInUi();
    const proof = await mintDelegation(targetDid);
    await importDelegation(proof);
    await uploadSmallFile();
  });
});
