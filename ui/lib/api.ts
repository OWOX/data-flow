import { owox } from '@owox/plugin-sdk';

// The host is the capability broker: every OWOX call goes through owox.request,
// which injects the project token + api-key-id. Keeps the old `api(path, opts)`
// signature so all callers (sync/push, importers, storage reads) are untouched.
// Broker errors carry `code` (e.g. GRANT_DENIED) and `status`, matching what
// callers branch on.
export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body as string) : undefined;
  // The old BFF exposed /api/storages; the real OWOX path is /api/data-storages.
  const p = path === '/api/storages' ? '/api/data-storages' : path;
  return owox.request(method, p, body) as Promise<T>;
}
