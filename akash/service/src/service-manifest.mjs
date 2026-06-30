import fs from 'node:fs/promises';
import path from 'node:path';

export function publicOrigin() {
  const raw = process.env.UCAN_STORE_PUBLIC_ORIGIN?.trim();
  if (raw) return raw.replace(/\/+$/, '');
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
