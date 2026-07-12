import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const DEFAULT_HEALTH_PORT = 8790;
const DEFAULT_UPLOAD_SERVICE_URL = 'http://127.0.0.1:8787';
const DEFAULT_KUBO_API_URL = 'http://127.0.0.1:5001';
const DEFAULT_RUNTIME_DIR = '/app/runtime';
const MAX_CONFIGURE_BODY_BYTES = 16 * 1024;

async function checkUploadService() {
  const base = process.env.UCAN_STORE_UPLOAD_SERVICE_URL ?? DEFAULT_UPLOAD_SERVICE_URL;
  const response = await fetch(new URL('/.well-known/did.json', base), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`upload service returned ${response.status}`);
  }
  const did = await response.json();
  return { ok: true, did: did?.id ?? null };
}

async function checkKubo() {
  const base = process.env.KUBO_API_URL ?? DEFAULT_KUBO_API_URL;
  const response = await fetch(new URL('/api/v0/id', base), { method: 'POST' });
  if (!response.ok) {
    throw new Error(`kubo api returned ${response.status}`);
  }
  const id = await response.json();
  return { ok: true, id: id?.ID ?? null };
}

async function checkManifest() {
  const runtimeDir = process.env.UCAN_STORE_RUNTIME_DIR ?? DEFAULT_RUNTIME_DIR;
  const manifestPath = path.join(runtimeDir, 'service-manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  const manifest = parsed?.manifest ?? parsed;
  if (!manifest?.serviceDid || !manifest?.serviceOrigin) {
    throw new Error('manifest missing serviceDid or serviceOrigin');
  }
  return {
    ok: true,
    serviceDid: manifest.serviceDid,
    serviceOrigin: manifest.serviceOrigin,
    uiCid: manifest.uiCid ?? null,
  };
}

async function runCheck(name, fn) {
  try {
    return [name, await fn()];
  } catch (error) {
    return [
      name,
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

export async function readHealth() {
  const entries = await Promise.all([
    runCheck('uploadService', checkUploadService),
    runCheck('ipfs', checkKubo),
    runCheck('manifest', checkManifest),
  ]);
  const checks = Object.fromEntries(entries);
  const ok = Object.values(checks).every((check) => check?.ok === true);
  return {
    ok,
    status: ok ? 'ok' : 'degraded',
    checks,
  };
}

function configureToken() {
  return process.env.UCAN_STORE_CONFIGURE_TOKEN?.trim() ?? '';
}

function adminToken() {
  return process.env.UCAN_STORE_ADMIN_API_TOKEN?.trim() ?? '';
}

function requestBearerToken(req) {
  const header = req.headers.authorization ?? '';
  const value = Array.isArray(header) ? header[0] : header;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength ?? chunk.length ?? 0;
    if (size > MAX_CONFIGURE_BODY_BYTES) {
      throw new Error('request body too large');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function json(res, status, payload) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

export function startHealthServer({
  port = DEFAULT_HEALTH_PORT,
  onConfigurePublicOrigin,
  onReadDelegationPolicy,
  onIssueDelegation,
} = {}) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/configure') {
      const token = configureToken();
      if (!token || requestBearerToken(req) !== token) {
        json(res, token ? 401 : 404, { ok: false, error: token ? 'unauthorized' : 'configure disabled' });
        return;
      }
      if (!onConfigurePublicOrigin) {
        json(res, 503, { ok: false, error: 'configure handler unavailable' });
        return;
      }
      try {
        const body = await readJsonBody(req);
        const result = await onConfigurePublicOrigin({ publicOrigin: body?.publicOrigin });
        json(res, 200, { ok: true, ...result });
      } catch (error) {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.url === '/admin/delegations/policy' || req.url === '/admin/delegations') {
      const token = adminToken();
      if (!token || requestBearerToken(req) !== token) {
        json(res, token ? 401 : 404, { status: 'error', error: token ? 'unauthorized' : 'delegation issuance disabled' });
        return;
      }
      try {
        if (req.method === 'GET' && req.url.endsWith('/policy')) {
          if (!onReadDelegationPolicy) throw new Error('delegation policy unavailable');
          json(res, 200, { status: 'ok', policy: await onReadDelegationPolicy() });
          return;
        }
        if (req.method === 'POST' && req.url === '/admin/delegations') {
          if (!onIssueDelegation) throw new Error('delegation issuer unavailable');
          const body = await readJsonBody(req);
          json(res, 200, { status: 'ok', delegation: await onIssueDelegation(body) });
          return;
        }
        json(res, 405, { status: 'error', error: 'method not allowed' });
      } catch (error) {
        json(res, 400, { status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method !== 'GET' || !['/health', '/healthz'].includes(req.url ?? '/')) {
      json(res, 404, { ok: false, error: 'not found' });
      return;
    }

    const health = await readHealth();
    json(res, health.ok ? 200 : 503, health);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Akash UCAN Store health server listening on 127.0.0.1:${port}`);
  });

  return server;
}
