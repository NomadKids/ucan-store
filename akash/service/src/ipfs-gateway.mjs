const DEFAULT_KUBO_API = 'http://127.0.0.1:5001';

export async function importCarToKubo(bytes, filename = 'upload.car') {
  const api = process.env.KUBO_API_URL ?? DEFAULT_KUBO_API;
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'application/vnd.ipld.car' }), filename);

  const url = new URL('/api/v0/dag/import', api);
  url.searchParams.set('pin-roots', 'true');

  const response = await fetch(url, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Kubo dag import failed (${response.status}): ${text}`);
  }

  return response.text();
}
