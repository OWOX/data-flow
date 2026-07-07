// Local mock of @owox/plugin-sdk. Two uses:
//  • `npm test`     — vitest aliases this file; tests override methods with vi.spyOn.
//  • `npm run dev`  — vite aliases this file (serve mode) so the UI runs in the browser with NO host.
//
// settings + storage are real (localStorage-backed) so you can iterate with LOCAL creds; backend and
// the brokered capabilities need the real host, so here they're stubbed and logged to the console.

// ── Local creds/settings for browser dev ────────────────────────────────────
// Edit these, or from the browser console:
//   localStorage.setItem('owox.dev.settings', JSON.stringify({ 'github-repo': 'me/repo' }))
const DEV_DEFAULTS: Record<string, unknown> = {
  greeting: 'Hi from local dev',
};

function devSettings(): Record<string, unknown> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('owox.dev.settings') : null;
    return { ...DEV_DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEV_DEFAULTS };
  }
}

export const settings = {
  get: async (key: string): Promise<unknown> => devSettings()[key],
  all: async (): Promise<Record<string, unknown>> => devSettings(),
};

// Real key/value storage backed by localStorage so state survives reloads during dev.
export const storage = {
  get: async (key: string): Promise<unknown> => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('owox.dev.kv.' + key) : null;
    return v == null ? undefined : JSON.parse(v);
  },
  set: async (key: string, value: unknown): Promise<void> => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('owox.dev.kv.' + key, JSON.stringify(value));
  },
  delete: async (key: string): Promise<void> => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('owox.dev.kv.' + key);
  },
  keys: async (prefix?: string): Promise<string[]> => {
    if (typeof localStorage === 'undefined') return [];
    const P = 'owox.dev.kv.';
    return Object.keys(localStorage)
      .filter(k => k.startsWith(P))
      .map(k => k.slice(P.length))
      .filter(k => !prefix || k.startsWith(prefix));
  },
};

export const backend = {
  call: async (fn: string, args?: unknown): Promise<unknown> => {
    console.info('[owox dev mock] backend.call', fn, args);
    return { message: `(local mock) backend "${fn}" isn't run in the browser — install into the host for the real thing` };
  },
};

export const ui = { toast: async (msg: string): Promise<void> => { console.info('[owox dev mock] toast:', msg); } };

// Brokered capabilities need the host. Stub every method to log + resolve, so the UI never crashes.
const stub = (name: string) =>
  new Proxy(
    {},
    {
      get: (_t, method) => async (...args: unknown[]) => {
        console.info(`[owox dev mock] ${name}.${String(method)}`, ...args);
        return undefined;
      },
    },
  ) as any;

export const owox = {
  request: async (method: string, path: string, _body?: unknown) => {
    console.info('[owox dev mock] owox.request', method, path);
    // Return [] for list reads so the canvas renders without a host; Push is a no-op in mock mode.
    if (method === 'GET' && (path === '/api/data-storages' || path === '/api/data-marts')) return [];
    return undefined;
  },
  dataMart: (id: string) => ({ query: async () => { console.info('[owox dev mock] dataMart.query', id); return undefined; } }),
} as any;
// `ai` returns the real capability's shape ({ text, model, raw }) so UI that reads reply.text works
// in mock mode too. Use `npm run dev:broker` for a real model reply.
export const ai = {
  chat: async (args: unknown) => {
    console.info('[owox dev mock] ai.chat', args);
    return { text: '(local mock) hello — run `npm run dev:broker` for a real AI reply.', model: 'mock', raw: {} };
  },
  embeddings: async (args: unknown) => {
    console.info('[owox dev mock] ai.embeddings', args);
    return { embeddings: [], model: 'mock', raw: {} };
  },
} as any;
export const git = stub('git');
export const sheets = stub('sheets');
export const credentials = stub('credentials');
