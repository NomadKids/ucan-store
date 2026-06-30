import {
  applyPublicStorageOrigin,
  createCorsHttp,
  loadUploadApiTestContext,
  refreshExternalServiceProofs,
  startUploadApiServer,
} from '../../../local-storacha-api/upload-service.mjs';
import { startHealthServer } from './health.mjs';
import { importCarToKubo } from './ipfs-gateway.mjs';
import { installServiceIdentity, loadOrCreateServiceIdentity } from './service-identity.mjs';
import { publicOrigin, writeDidDocument, writeServiceManifest } from './service-manifest.mjs';

async function importUploadBytesToIpfs({ bytes, url }) {
  const pathname = url?.split('?')[0] ?? '';
  const filename = pathname.split('/').filter(Boolean).pop() || 'upload.car';
  if (!filename.endsWith('.car') && !filename.endsWith('.blob')) {
    return;
  }

  try {
    const result = await importCarToKubo(bytes, filename.endsWith('.car') ? filename : `${filename}.car`);
    console.log(`Imported upload bytes into Kubo: ${filename}`);
    console.log(result.trim());
  } catch (error) {
    console.warn(`Kubo import failed for ${filename}:`, error?.message ?? error);
  }
}

const { createContext } = await loadUploadApiTestContext();

console.log('Creating Akash UCAN Store upload service...');

const uploadServiceContext = await createContext({
  requirePaymentPlan: false,
  http: createCorsHttp({
    onPutBytes: importUploadBytesToIpfs,
  }),
});
const serviceIdentity = await loadOrCreateServiceIdentity();
await installServiceIdentity(uploadServiceContext, serviceIdentity);

const serviceDid = uploadServiceContext.id.did();
const serviceDidKey = uploadServiceContext.id.toDIDKey();
const origin = publicOrigin();
const uiCid = process.env.UCAN_STORE_UI_CID ?? null;

applyPublicStorageOrigin(uploadServiceContext, `${origin}/api`);
await refreshExternalServiceProofs(uploadServiceContext);
await writeServiceManifest({ serviceDid, uiCid });
await writeDidDocument({ serviceDid, didKey: serviceDidKey });

console.log('UCAN Store service DID:', serviceDid);
console.log(
  `UCAN Store service identity: ${serviceIdentity.created ? 'created' : 'loaded'} ${serviceIdentity.keyPath}`
);
console.log('UCAN Store public origin:', origin);

const port = Number.parseInt(process.env.STORACHA_LOCAL_PORT ?? '8787', 10);

await startUploadApiServer(uploadServiceContext, {
  port,
  autoProvision: true,
  onPutBytes: importUploadBytesToIpfs,
  onListResults: async ({ can, results }) => {
    if (can !== 'upload/list') return;
    const count = Array.isArray(results) ? results.length : 0;
    console.log(`upload/list returned ${count} entries`);
  },
});

console.log(`Akash UCAN Store upload service listening on 127.0.0.1:${port}`);

startHealthServer({
  port: Number.parseInt(process.env.UCAN_STORE_HEALTH_PORT ?? '8790', 10),
});
