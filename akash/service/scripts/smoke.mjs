#!/usr/bin/env node

const baseUrl = normalizeBaseUrl(
  process.env.UCAN_STORE_SMOKE_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8080',
);
const origin = process.env.UCAN_STORE_SMOKE_ORIGIN || 'http://localhost:5173';
const expectedServiceDid = process.env.UCAN_STORE_SMOKE_EXPECTED_SERVICE_DID?.trim();
const expectedServiceOrigin = process.env.UCAN_STORE_SMOKE_EXPECTED_SERVICE_ORIGIN?.trim();
const expectedPwaOrigin = process.env.UCAN_STORE_SMOKE_EXPECTED_PWA_ORIGIN?.trim();

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

process.on('uncaughtException', handleFailure);
process.on('unhandledRejection', handleFailure);

const checks = [];

await check('health endpoint', async () => {
  const health = await getJson('/health');
  assert(health.ok === true, 'expected health.ok to be true');
  assert(health.checks?.uploadService?.ok === true, 'expected upload service check to pass');
  assert(health.checks?.ipfs?.ok === true, 'expected IPFS check to pass');
  assert(health.checks?.manifest?.ok === true, 'expected manifest check to pass');
});

let manifest;
await check('service manifest endpoint', async () => {
  const envelope = await getJson('/service-manifest.json');
  manifest = envelope.manifest ?? envelope;
  assert(manifest.kind === 'ucan-store/service-manifest', 'unexpected service manifest kind');
  assert(typeof manifest.serviceDid === 'string' && manifest.serviceDid.startsWith('did:'), 'missing service DID');
  assert(typeof manifest.serviceOrigin === 'string' && manifest.serviceOrigin.length > 0, 'missing service origin');
  assert(typeof manifest.ipfsGatewayUrl === 'string' && manifest.ipfsGatewayUrl.length > 0, 'missing IPFS gateway URL');
  assert(isCidLike(manifest.uiCid), `invalid UI CID: ${manifest.uiCid}`);

  if (expectedServiceDid) {
    assert(manifest.serviceDid === expectedServiceDid, `expected service DID ${expectedServiceDid}, got ${manifest.serviceDid}`);
  }
  if (expectedServiceOrigin) {
    assert(
      stripTrailingSlash(manifest.serviceOrigin) === stripTrailingSlash(expectedServiceOrigin),
      `expected service origin ${expectedServiceOrigin}, got ${manifest.serviceOrigin}`,
    );
  }
  if (expectedPwaOrigin) {
    assert(
      stripTrailingSlash(manifest.pwaOrigin) === stripTrailingSlash(expectedPwaOrigin),
      `expected PWA origin ${expectedPwaOrigin}, got ${manifest.pwaOrigin}`,
    );
  }
});

await check('upload API CORS preflight', async () => {
  const response = await request('/api/', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
  });

  assert(response.ok, `expected 2xx CORS preflight, got ${response.status}`);

  const allowOrigin = response.headers.get('access-control-allow-origin') || '';
  const allowMethods = response.headers.get('access-control-allow-methods') || '';
  const allowHeaders = response.headers.get('access-control-allow-headers') || '';

  assert(
    splitHeader(allowOrigin).includes('*') || splitHeader(allowOrigin).includes(origin),
    `unexpected access-control-allow-origin: ${allowOrigin}`,
  );
  assert(splitHeader(allowMethods).includes('post'), `POST missing from access-control-allow-methods: ${allowMethods}`);
  assert(
    splitHeader(allowHeaders).includes('content-type'),
    `content-type missing from access-control-allow-headers: ${allowHeaders}`,
  );
});

await check('IPFS gateway serves pinned UI CID', async () => {
  const html = await getText(`/ipfs/${manifest.uiCid}/`);
  assert(isHtml(html), 'expected HTML from pinned UI CID');
});

await check('root route serves UI and assets', async () => {
  const html = await getText('/');
  assert(isHtml(html), 'expected HTML from root route');

  const assetPath = html.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
  assert(assetPath, 'expected at least one root-relative asset in UI HTML');

  const asset = await request(assetPath);
  assert(asset.ok, `expected asset ${assetPath} to load, got ${asset.status}`);
});

console.log(`Smoke checks passed for ${baseUrl}`);
for (const name of checks) {
  console.log(`- ${name}`);
}

async function check(name, fn) {
  try {
    await fn();
    checks.push(name);
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

async function getJson(path) {
  const response = await request(path);
  assert(response.ok, `GET ${path} returned ${response.status}`);
  return response.json();
}

async function getText(path) {
  const response = await request(path);
  assert(response.ok, `GET ${path} returned ${response.status}`);
  return response.text();
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.UCAN_STORE_SMOKE_TIMEOUT_MS || 5000));

  try {
    return await fetch(new URL(path, baseUrl), {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new AssertionError(message);
  }
}

function handleFailure(error) {
  console.error(error);
  process.exit(error instanceof AssertionError ? 2 : 1);
}

function normalizeBaseUrl(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function stripTrailingSlash(value) {
  return typeof value === 'string' ? value.replace(/\/+$/, '') : value;
}

function splitHeader(value) {
  return value
    .toLowerCase()
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function isCidLike(value) {
  return typeof value === 'string' && /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(value);
}

function isHtml(value) {
  return /<!doctype html|<html|<div id=["']root["']/i.test(value);
}
