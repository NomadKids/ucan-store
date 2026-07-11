import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_RUNTIME_DIR = '/app/runtime';
let runtimePublicOrigin = null;

export function normalizePublicOrigin(value) {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function runtimeConfigPath(runtimeDir = DEFAULT_RUNTIME_DIR) {
  return path.join(runtimeDir, 'config.json');
}

export async function loadRuntimeConfig({ runtimeDir = DEFAULT_RUNTIME_DIR } = {}) {
  try {
    const raw = await fs.readFile(runtimeConfigPath(runtimeDir), 'utf8');
    const parsed = JSON.parse(raw);
    const origin = normalizePublicOrigin(parsed?.publicOrigin);
    runtimePublicOrigin = origin || null;
    return { publicOrigin: runtimePublicOrigin };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Ignoring invalid runtime config: ${error?.message ?? error}`);
    }
    runtimePublicOrigin = null;
    return { publicOrigin: null };
  }
}

export async function configurePublicOrigin({ publicOrigin, runtimeDir = DEFAULT_RUNTIME_DIR } = {}) {
  const origin = normalizePublicOrigin(publicOrigin);
  if (!origin) {
    throw new Error('publicOrigin must be an http(s) origin');
  }

  runtimePublicOrigin = origin;
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.writeFile(runtimeConfigPath(runtimeDir), `${JSON.stringify({ publicOrigin: origin }, null, 2)}\n`);
  return { publicOrigin: origin };
}

export function publicOrigin() {
  if (runtimePublicOrigin) return runtimePublicOrigin;
  const raw = process.env.UCAN_STORE_PUBLIC_ORIGIN?.trim();
  const configured = normalizePublicOrigin(raw);
  if (configured) return configured;
  const port = process.env.UCAN_STORE_PUBLIC_PORT ?? '8080';
  return `http://localhost:${port}`;
}

export function createServiceManifest({ serviceDid, uiCid }) {
  const origin = publicOrigin();
  const serviceOrigin = `${origin}/api`;
  return {
    kind: 'ucan-store/service-manifest',
    version: 1,
    serviceDid,
    serviceOrigin,
    pwaOrigin: origin,
    revocationUrl: serviceOrigin,
    receiptsUrl: `${serviceOrigin}/receipt/`,
    ipfsGatewayUrl: `${origin}/ipfs/`,
    uiCid,
    allowedCapabilities: [
      'space/blob/add',
      'space/blob/list',
      'space/blob/remove',
      'store/add',
      'store/list',
      'store/remove',
      'upload/add',
      'upload/list',
      'upload/remove',
    ],
  };
}

export async function writeServiceManifest({ serviceDid, uiCid, runtimeDir = '/app/runtime' }) {
  const manifest = createServiceManifest({ serviceDid, uiCid });
  const envelope = {
    status: 'ok',
    manifest,
  };
  const json = `${JSON.stringify(envelope, null, 2)}\n`;

  await fs.mkdir(path.join(runtimeDir, '.well-known'), { recursive: true });
  await fs.writeFile(path.join(runtimeDir, 'service-manifest.json'), json);
  await fs.writeFile(path.join(runtimeDir, '.well-known', 'ucan-store.json'), json);

  return manifest;
}

export async function writeDidDocument({ serviceDid, didKey = serviceDid, runtimeDir = '/app/runtime' }) {
  const publicKeyMultibase = didKey?.startsWith('did:key:')
    ? didKey.slice('did:key:'.length)
    : null;

  if (!serviceDid || !publicKeyMultibase) {
    return null;
  }

  const didDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: serviceDid,
    verificationMethod: [
      {
        id: `${serviceDid}#${publicKeyMultibase}`,
        type: 'Multikey',
        controller: serviceDid,
        publicKeyMultibase,
      },
    ],
    authentication: [`${serviceDid}#${publicKeyMultibase}`],
    assertionMethod: [`${serviceDid}#${publicKeyMultibase}`],
  };
  await fs.mkdir(path.join(runtimeDir, '.well-known'), { recursive: true });
  await fs.writeFile(
    path.join(runtimeDir, '.well-known', 'did.json'),
    `${JSON.stringify(didDocument, null, 2)}\n`
  );
  return didDocument;
}
