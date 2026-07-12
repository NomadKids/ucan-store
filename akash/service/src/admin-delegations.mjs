import { importFromWeb } from './service-identity.mjs';

export const DEFAULT_ALLOWED_CAPABILITIES = Object.freeze([
  'space/blob/add',
  'space/blob/list',
  'space/blob/remove',
  'space/index/add',
  'upload/add',
  'upload/list',
  'upload/remove',
]);

const DEFAULT_EXPIRATION_SECONDS = 24 * 60 * 60;
const MAX_EXPIRATION_SECONDS = 30 * 24 * 60 * 60;

function configuredCapabilities() {
  const configured = process.env.UCAN_STORE_ALLOWED_CAPABILITIES?.split(',')
    .map((capability) => capability.trim())
    .filter(Boolean);
  return configured?.length ? configured : [...DEFAULT_ALLOWED_CAPABILITIES];
}

export function delegationPolicy({ serviceDid, spaceDid = serviceDid } = {}) {
  return {
    enabled: Boolean(process.env.UCAN_STORE_ADMIN_API_TOKEN?.trim()),
    issuerDid: serviceDid,
    spaceDid,
    allowedCapabilities: configuredCapabilities(),
    defaultExpirationSeconds: DEFAULT_EXPIRATION_SECONDS,
    maxExpirationSeconds: MAX_EXPIRATION_SECONDS,
    proofFormat: 'ucan-car-multibase-base64',
  };
}

export async function issueDelegation({ signer, targetDid, capabilities, expirationSeconds, spaceDid } = {}) {
  if (!signer?.did) throw new Error('service signer unavailable');
  if (typeof targetDid !== 'string' || !targetDid.startsWith('did:key:')) {
    throw new Error('targetDid must be a did:key DID');
  }

  const policy = delegationPolicy({ serviceDid: signer.did(), spaceDid: spaceDid || signer.did() });
  const requested = Array.isArray(capabilities) && capabilities.length
    ? capabilities.map((capability) => `${capability}`.trim()).filter(Boolean)
    : policy.allowedCapabilities;
  const disallowed = requested.filter((capability) => !policy.allowedCapabilities.includes(capability));
  if (disallowed.length) throw new Error(`capabilities not allowed: ${disallowed.join(', ')}`);

  const lifetime = expirationSeconds == null ? policy.defaultExpirationSeconds : Number(expirationSeconds);
  if (!Number.isSafeInteger(lifetime) || lifetime < 60 || lifetime > policy.maxExpirationSeconds) {
    throw new Error(`expirationSeconds must be an integer between 60 and ${policy.maxExpirationSeconds}`);
  }

  const [{ delegate }, { Verifier }] = await Promise.all([
    importFromWeb('@ucanto/core'),
    importFromWeb('@ucanto/principal'),
  ]);
  const audience = Verifier.parse(targetDid);
  const expiration = Math.floor(Date.now() / 1000) + lifetime;
  const delegation = await delegate({
    issuer: signer,
    audience,
    capabilities: requested.map((can) => ({ can, with: policy.spaceDid })),
    expiration,
  });
  const archive = await delegation.archive();
  if (!archive?.ok) throw archive?.error ?? new Error('failed to archive delegation');

  return {
    cid: delegation.cid.toString(),
    issuerDid: signer.did(),
    audienceDid: targetDid,
    spaceDid: policy.spaceDid,
    capabilities: requested,
    expiration,
    proofFormat: policy.proofFormat,
    proof: `m${Buffer.from(archive.ok).toString('base64')}`,
  };
}
