import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requireFromWeb = createRequire(new URL('../../../web/package.json', import.meta.url));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_DATA_DIR = '/data/ucan-store';
const KEY_FILE_NAME = 'service-identity.json';

function parsePackageSpecifier(specifier) {
  if (specifier.startsWith('@')) {
    const [scope, name, ...rest] = specifier.split('/');
    return {
      pkgName: `${scope}/${name}`,
      subpath: rest.length ? `./${rest.join('/')}` : '.',
    };
  }
  const [name, ...rest] = specifier.split('/');
  return {
    pkgName: name,
    subpath: rest.length ? `./${rest.join('/')}` : '.',
  };
}

function resolveExportTarget(pkgRoot, subpath) {
  const pkgPath = path.join(pkgRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const exportsField = pkg.exports;

  if (!exportsField) {
    return pkg.main ? path.join(pkgRoot, pkg.main) : null;
  }

  let target = null;
  if (typeof exportsField === 'string') {
    target = subpath === '.' ? exportsField : null;
  } else if (exportsField[subpath]) {
    target = exportsField[subpath];
  } else if (subpath === '.' && exportsField['.']) {
    target = exportsField['.'];
  }

  if (!target) {
    return null;
  }
  if (typeof target === 'string') {
    return path.join(pkgRoot, target);
  }

  const entry = target.import ?? target.default ?? target.require ?? null;
  return entry ? path.join(pkgRoot, entry) : null;
}

function resolveFromWebNodeModules(specifier) {
  const { pkgName, subpath } = parsePackageSpecifier(specifier);
  const pkgRoot = path.join(repoRoot, 'web', 'node_modules', pkgName);
  return resolveExportTarget(pkgRoot, subpath);
}

async function importFromWeb(specifier) {
  let resolved = null;

  if (typeof import.meta.resolve === 'function') {
    try {
      const resolvedUrl = import.meta.resolve(
        specifier,
        pathToFileURL(path.join(repoRoot, 'web', 'package.json')).href
      );
      resolved = resolvedUrl.startsWith('file://') ? fileURLToPath(resolvedUrl) : resolvedUrl;
    } catch {
      resolved = null;
    }
  }

  if (!resolved) {
    try {
      resolved = requireFromWeb.resolve(specifier);
    } catch {
      resolved = resolveFromWebNodeModules(specifier);
    }
  }

  if (!resolved) {
    throw new Error(`Failed to resolve ${specifier} from web/node_modules`);
  }

  return import(pathToFileURL(resolved).href);
}

export function serviceIdentityPath() {
  const explicit = process.env.UCAN_STORE_SERVICE_KEY_FILE?.trim();
  if (explicit) return explicit;

  const dataDir = process.env.UCAN_STORE_DATA_DIR?.trim() || DEFAULT_DATA_DIR;
  return path.join(dataDir, KEY_FILE_NAME);
}

export async function loadOrCreateServiceIdentity({ keyPath = serviceIdentityPath() } = {}) {
  const Ed25519 = await importFromWeb('@ucanto/principal/ed25519');
  const serviceDid = process.env.UCAN_STORE_SERVICE_DID?.trim();

  let signer;
  let created = false;

  try {
    signer = await loadSigner(Ed25519, keyPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    signer = await Ed25519.generate();
    await saveSigner(Ed25519, keyPath, signer);
    created = true;
  }

  const id = serviceDid ? signer.withDID(serviceDid) : signer;
  return {
    created,
    keyPath,
    signer,
    id,
    did: id.did(),
    didKey: id.toDIDKey(),
  };
}

export async function installServiceIdentity(context, identity) {
  context.id = identity.id;
  context.signer = identity.id;
  context.service = identity.id;

  await updateAggregatorInvocationConfig(context.aggregatorInvocationConfig, identity.id);
  updateInvocationConfig(context.dealTrackerService?.invocationConfig, identity.id);

  return context;
}

async function loadSigner(Ed25519, keyPath) {
  const raw = await fsp.readFile(keyPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (parsed.version !== 1 || parsed.type !== 'ucan-store/ed25519-service-identity') {
    throw new Error(`Unsupported service identity file format at ${keyPath}`);
  }
  if (typeof parsed.encoded !== 'string') {
    throw new Error(`Service identity file is missing encoded signer at ${keyPath}`);
  }

  const signer = Ed25519.parse(parsed.encoded);
  const did = signer.did();
  if (parsed.did && parsed.did !== did) {
    throw new Error(`Service identity DID mismatch at ${keyPath}: expected ${parsed.did}, got ${did}`);
  }

  return signer;
}

async function saveSigner(Ed25519, keyPath, signer) {
  await fsp.mkdir(path.dirname(keyPath), { recursive: true, mode: 0o700 });

  const identity = {
    version: 1,
    type: 'ucan-store/ed25519-service-identity',
    did: signer.did(),
    encoded: Ed25519.format(signer),
    createdAt: new Date().toISOString(),
  };
  const tmpPath = `${keyPath}.${process.pid}.${Date.now()}.tmp`;

  await fsp.writeFile(tmpPath, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 });
  await fsp.rename(tmpPath, keyPath);
  await fsp.chmod(keyPath, 0o600).catch(() => {});
}

function updateInvocationConfig(config, signer) {
  if (!config) return;
  config.issuer = signer;
  config.with = signer.did();
}

async function updateAggregatorInvocationConfig(config, signer) {
  if (!config) return;

  updateInvocationConfig(config, signer);

  if (!config.audience?.did) {
    return;
  }

  const AggregatorCaps = await importFromWeb('@storacha/capabilities/filecoin/aggregator');
  config.proofs = [
    await AggregatorCaps.pieceOffer.delegate({
      issuer: config.audience,
      audience: signer,
      with: config.audience.did(),
      expiration: Infinity,
    }),
  ];
}
