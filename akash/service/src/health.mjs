import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const DEFAULT_HEALTH_PORT = 8790;
const DEFAULT_UPLOAD_SERVICE_URL = 'http://127.0.0.1:8787';
const DEFAULT_KUBO_API_URL = 'http://127.0.0.1:5001';
const DEFAULT_RUNTIME_DIR = '/app/runtime';

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

export function startHealthServer({ port = DEFAULT_HEALTH_PORT } = {}) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    if (req.method !== 'GET' || !['/health', '/healthz'].includes(req.url ?? '/')) {
      res.writeHead(404, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    const health = await readHealth();
    res.writeHead(health.ok ? 200 : 503, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    });
    res.end(`${JSON.stringify(health, null, 2)}\n`);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Akash UCAN Store health server listening on 127.0.0.1:${port}`);
  });

  return server;
}
