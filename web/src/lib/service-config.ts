type RuntimeOverrides = {
  __UPLOAD_SERVICE_URL__?: string;
  __UPLOAD_SERVICE_DID__?: string;
  __REVOCATION_URL__?: string;
  __REVOCATION_DID__?: string;
  __RECEIPTS_URL__?: string;
  __SERVICE_MANIFEST_URL__?: string;
};

type ServiceManifest = {
  kind?: string;
  version?: number;
  serviceDid?: string;
  serviceOrigin?: string;
  pwaOrigin?: string;
  revocationUrl?: string;
  receiptsUrl?: string;
  allowedCapabilities?: string[];
  delegationIssuance?: {
    enabled?: boolean;
    endpoint?: string;
    policyEndpoint?: string;
    proofFormat?: string;
  };
};

type ServiceManifestEnvelope = {
  status?: string;
  manifest?: ServiceManifest;
};

export type ServiceConfigSource =
  | 'runtime-overrides'
  | 'manifest'
  | 'cache'
  | 'env'
  | 'unconfigured';

export type ServiceConfig = {
  uploadServiceUrl?: string;
  uploadServiceDid?: string;
  revocationUrl?: string;
  revocationDid?: string;
  receiptsUrl?: string;
  source?: ServiceConfigSource;
  manifestUrl?: string;
};

type CachedServiceConfig = {
  config: ServiceConfig;
  manifestUrl?: string;
  cachedAt: string;
};

const CACHE_KEY_PREFIX = 'ucan-store.service-config:';

let loggedConfig = false;
let currentConfig: ServiceConfig | null = null;
let initializationPromise: Promise<ServiceConfig> | null = null;

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function runtimeGlobals(): RuntimeOverrides {
  if (typeof globalThis === 'undefined') {
    return {};
  }

  const overrides = globalThis as RuntimeOverrides;
  return {
    __UPLOAD_SERVICE_URL__: overrides.__UPLOAD_SERVICE_URL__,
    __UPLOAD_SERVICE_DID__: overrides.__UPLOAD_SERVICE_DID__,
    __REVOCATION_URL__: overrides.__REVOCATION_URL__,
    __REVOCATION_DID__: overrides.__REVOCATION_DID__,
    __RECEIPTS_URL__: overrides.__RECEIPTS_URL__,
    __SERVICE_MANIFEST_URL__: overrides.__SERVICE_MANIFEST_URL__,
  };
}

function applyRuntimeOverrides(config: ServiceConfig): void {
  if (typeof globalThis === 'undefined') {
    return;
  }

  const overrides = globalThis as RuntimeOverrides;
  if (config.uploadServiceUrl) {
    overrides.__UPLOAD_SERVICE_URL__ = config.uploadServiceUrl;
  }
  if (config.uploadServiceDid) {
    overrides.__UPLOAD_SERVICE_DID__ = config.uploadServiceDid;
  }
  if (config.revocationUrl) {
    overrides.__REVOCATION_URL__ = config.revocationUrl;
  }
  if (config.revocationDid) {
    overrides.__REVOCATION_DID__ = config.revocationDid;
  }
  if (config.receiptsUrl) {
    overrides.__RECEIPTS_URL__ = config.receiptsUrl;
  }
}

function getLocationOrigin(): string | undefined {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return undefined;
  }
  return window.location.origin;
}

function cacheKey(origin: string): string {
  return `${CACHE_KEY_PREFIX}${origin}`;
}

function hasDirectBinding(config: ServiceConfig): boolean {
  return Boolean(config.uploadServiceUrl && config.uploadServiceDid);
}

function configFromEnv(): ServiceConfig {
  return {
    uploadServiceUrl: normalizeString(import.meta.env.VITE_UPLOAD_SERVICE_URL),
    uploadServiceDid: normalizeString(import.meta.env.VITE_UPLOAD_SERVICE_DID),
    revocationUrl: normalizeString(import.meta.env.VITE_REVOCATION_URL),
    revocationDid: normalizeString(import.meta.env.VITE_REVOCATION_DID),
    receiptsUrl: normalizeString(import.meta.env.VITE_RECEIPTS_URL),
  };
}

function configFromRuntime(): ServiceConfig {
  const runtime = runtimeGlobals();
  return {
    uploadServiceUrl: normalizeString(runtime.__UPLOAD_SERVICE_URL__),
    uploadServiceDid: normalizeString(runtime.__UPLOAD_SERVICE_DID__),
    revocationUrl: normalizeString(runtime.__REVOCATION_URL__),
    revocationDid: normalizeString(runtime.__REVOCATION_DID__),
    receiptsUrl: normalizeString(runtime.__RECEIPTS_URL__),
  };
}

function mergeConfig(
  primary: Partial<ServiceConfig>,
  fallback: Partial<ServiceConfig>,
  source: ServiceConfigSource,
  manifestUrl?: string
): ServiceConfig {
  return {
    uploadServiceUrl: primary.uploadServiceUrl ?? fallback.uploadServiceUrl,
    uploadServiceDid: primary.uploadServiceDid ?? fallback.uploadServiceDid,
    revocationUrl: primary.revocationUrl ?? fallback.revocationUrl,
    revocationDid: primary.revocationDid ?? fallback.revocationDid,
    receiptsUrl: primary.receiptsUrl ?? fallback.receiptsUrl,
    source,
    manifestUrl,
  };
}

function configFromManifest(
  manifest: ServiceManifest,
  fallback: ServiceConfig,
  source: ServiceConfigSource,
  manifestUrl?: string
): ServiceConfig {
  return mergeConfig(
    {
      uploadServiceUrl: normalizeString(manifest.serviceOrigin),
      uploadServiceDid: normalizeString(manifest.serviceDid),
      revocationUrl: normalizeString(manifest.revocationUrl),
      revocationDid:
        normalizeString(manifest.serviceDid) ?? fallback.revocationDid,
      receiptsUrl: normalizeString(manifest.receiptsUrl),
    },
    fallback,
    source,
    manifestUrl
  );
}

function validateManifest(manifest: ServiceManifest): ServiceManifest {
  const serviceOrigin = normalizeString(manifest.serviceOrigin);
  const serviceDid = normalizeString(manifest.serviceDid);
  if (!serviceOrigin || !serviceDid) {
    throw new Error('Manifest must include serviceOrigin and serviceDid.');
  }
  return manifest;
}

function resolveManifestCandidates(fallback: ServiceConfig): string[] {
  const runtime = runtimeGlobals();
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (value?: string) => {
    if (!value) {
      return;
    }
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    candidates.push(value);
  };

  add(normalizeString(runtime.__SERVICE_MANIFEST_URL__));
  add(normalizeString(import.meta.env.VITE_SERVICE_MANIFEST_URL));

  const origin = getLocationOrigin();
  if (origin && !origin.startsWith('null')) {
    add(new URL('/.well-known/ucan-store.json', origin).toString());
    add(new URL('/service-manifest.json', origin).toString());
  }

  if (fallback.uploadServiceUrl) {
    const base = new URL(fallback.uploadServiceUrl);
    add(new URL('/.well-known/ucan-store.json', base.origin).toString());
    add(new URL('/service-manifest.json', base.origin).toString());
  }

  return candidates;
}

async function fetchManifest(url: string): Promise<ServiceManifest> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Manifest request failed: ${response.status}`);
  }

  const payload = (await response.json()) as ServiceManifestEnvelope | ServiceManifest;
  const manifest =
    payload && typeof payload === 'object' && 'manifest' in payload
      ? payload.manifest
      : payload;
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Manifest response did not include a manifest object.');
  }
  return validateManifest(manifest as ServiceManifest);
}

function readCachedConfig(): ServiceConfig | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  const origin = getLocationOrigin();
  if (!origin) {
    return null;
  }

  try {
    const raw = localStorage.getItem(cacheKey(origin));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CachedServiceConfig;
    if (!parsed?.config) {
      return null;
    }
    return mergeConfig(parsed.config, {}, 'cache', parsed.manifestUrl);
  } catch (error) {
    console.warn('Failed to read cached service config:', error);
    return null;
  }
}

function writeCachedConfig(config: ServiceConfig): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const origin = getLocationOrigin();
  if (!origin) {
    return;
  }

  const payload: CachedServiceConfig = {
    config,
    manifestUrl: config.manifestUrl,
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(cacheKey(origin), JSON.stringify(payload));
}

function finalizeConfig(config: ServiceConfig): ServiceConfig {
  currentConfig = config;
  applyRuntimeOverrides(config);
  return config;
}

async function resolveInitialServiceConfig(): Promise<ServiceConfig> {
  const envConfig = configFromEnv();
  const runtimeConfig = configFromRuntime();
  if (hasDirectBinding(runtimeConfig)) {
    return finalizeConfig(mergeConfig(runtimeConfig, envConfig, 'runtime-overrides'));
  }

  const candidates = resolveManifestCandidates(envConfig);
  for (const manifestUrl of candidates) {
    try {
      const manifest = await fetchManifest(manifestUrl);
      const resolved = configFromManifest(manifest, envConfig, 'manifest', manifestUrl);
      writeCachedConfig(resolved);
      return finalizeConfig(resolved);
    } catch (error) {
      console.warn(`Failed to load service manifest from ${manifestUrl}:`, error);
    }
  }

  const cached = readCachedConfig();
  if (cached && hasDirectBinding(cached)) {
    return finalizeConfig(cached);
  }

  if (hasDirectBinding(envConfig)) {
    return finalizeConfig(mergeConfig(envConfig, {}, 'env'));
  }

  return finalizeConfig(mergeConfig(runtimeConfig, envConfig, 'unconfigured'));
}

export async function initializeServiceConfig(): Promise<ServiceConfig> {
  if (currentConfig) {
    return currentConfig;
  }
  if (!initializationPromise) {
    initializationPromise = resolveInitialServiceConfig()
      .catch((error) => {
        console.warn('Service discovery bootstrap failed, falling back to env/runtime values:', error);
        return finalizeConfig(mergeConfig(configFromRuntime(), configFromEnv(), 'env'));
      })
      .finally(() => {
        initializationPromise = null;
      });
  }
  return initializationPromise;
}

export function getServiceConfig(): ServiceConfig {
  const config =
    currentConfig ?? mergeConfig(configFromRuntime(), configFromEnv(), 'env');
  if (!loggedConfig) {
    loggedConfig = true;
    console.log('📋 Service Configuration:', {
      uploadServiceUrl: config.uploadServiceUrl,
      uploadServiceDid: config.uploadServiceDid,
      revocationUrl: config.revocationUrl,
      revocationDid: config.revocationDid,
      receiptsUrl: config.receiptsUrl,
      source: config.source,
      manifestUrl: config.manifestUrl,
    });
  }
  return config;
}

export function resetServiceConfigForTests(): void {
  currentConfig = null;
  initializationPromise = null;
  loggedConfig = false;
}
