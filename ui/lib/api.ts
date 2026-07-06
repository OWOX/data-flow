export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json", ...(opts.headers || {}) }, ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status; // callers can branch on this (e.g. 429 → AI limit)
    throw err;
  }
  return res.status === 204 ? (undefined as T) : await res.json();
}
