# Model Canvas → v2 Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn this `model-canvas` repo into a standalone frontend-only OWOX v2 plugin (installable into `owox-data-marts-experimental`), porting the canvas from `owox-model-canvas` and removing all third-party authorization (OWOX API-key sign-in + Supabase OAuth).

**Architecture:** A plain plugin folder (`plugin.json` + `ui/` React source, no `backend.ts`) mirroring `packages/plugin-starter`. The Fastify BFF and Supabase account tier are deleted; every privileged call becomes a brokered SDK call. The single seam is `ui/lib/api.ts`, rewritten to route through `owox.request(method, path, body)`, so the bulk of the canvas (`sync/push.ts`, importers, state, components) ports unchanged.

**Tech Stack:** React 18, Vite, `@xyflow/react` (React Flow), `@dagrejs/dagre`, Tailwind 3, TypeScript, Vitest + Testing Library, `@owox/plugin-sdk` (host-provided, mocked locally).

## Global Constraints

- **Source of truth for the port:** `/Users/flakss/Projects/owox-model-canvas/packages/web/src` (the SPA) and `.../packages/okf/src` (the OKF lib). Referred to below as `SRC/` and `OKF/`.
- **Contract:** `/Users/flakss/Projects/owox-data-marts-experimental/AGENTS.md` (v2). Blueprint: `.../packages/plugin-starter`.
- **Keep external (host import-map, never bundle):** `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `react-router-dom`, `@owox/plugin-sdk`.
- **`@owox/plugin-sdk` is NOT an npm dependency** (unpublished). Type it via `tsconfig` `paths` → `ui/sdk-mock.ts`; alias it in `vite.config.ts` (serve) and `vitest.config.ts`.
- **Node 20+.** Package manager: **npm** (not pnpm — this is now a standalone plugin, not the old monorepo).
- **Tailwind:** host uses the **default theme and ignores `tailwind.config`**. Only use standard utilities in `ui/`; if any custom-theme class is required, precompile CSS (Task 9).
- **Tests capped:** always `vitest run --maxWorkers=4` (hardware constraint).
- **No credentials in `settings[]`** (schema-forbidden). No config settings needed.
- **Frontend-only:** no `backend.ts`.
- **Commit** after each task.

---

### Task 1: Scaffold the plugin skeleton (config + entry, no app code yet)

**Files:**
- Create: `plugin.json`, `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `src/test-setup.ts`, `.gitignore`, `owox.dev.example.json`
- Create: `ui/index.html`, `ui/styles.css`, `ui/sdk-mock.ts`

**Interfaces:**
- Produces: the plugin manifest + build config the rest of the plan populates. `ui/sdk-mock.ts` exports `{ owox, ai, storage, settings, ui, credentials, git, sheets, backend }` matching `@owox/plugin-sdk`'s runtime shape.

- [ ] **Step 1: Write `plugin.json`**

```jsonc
{
  "id": "model-canvas",
  "name": "Model Canvas",
  "version": "0.1.0",
  "ui": { "entry": "ui/index.html" },
  "menu": [{ "title": "Model Canvas", "path": "" }],
  "settings": [],
  "credentials": [
    { "type": "data-mart", "scope": "all" },
    { "type": "storage", "scope": "all" },
    { "type": "ai-provider", "scope": "one", "optional": true }
  ]
}
```

- [ ] **Step 2: Write `package.json`** (deps = the canvas's real runtime deps minus supabase/posthog; react* stay external via devDeps)

```jsonc
{
  "name": "model-canvas",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "dev:broker": "owox-plugin-dev",
    "build": "vite build",
    "test": "vitest run --maxWorkers=4",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@dagrejs/dagre": "^1.1.0",
    "@xyflow/react": "^12.3.0",
    "fflate": "^0.8.3",
    "html-to-image": "^1.11.13",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^5.0.0",
    "autoprefixer": "^10.4.0",
    "happy-dom": "^20.10.6",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write `vite.config.ts`** (root `ui`, alias SDK to mock on serve, external on build; also alias `@mc/okf` since okf is vendored under `ui/okf`)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: 'ui',
  resolve: {
    alias: {
      '@mc/okf': fileURLToPath(new URL('./ui/okf/index.ts', import.meta.url)),
      ...(command === 'serve'
        ? { '@owox/plugin-sdk': fileURLToPath(new URL('./ui/sdk-mock.ts', import.meta.url)) }
        : {}),
    },
  },
  build: {
    outDir: '../dist/ui',
    emptyOutDir: true,
    rollupOptions: { external: ['@owox/plugin-sdk'] },
  },
}));
```

- [ ] **Step 4: Write `tsconfig.json`** (SDK + okf path aliases)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "baseUrl": ".",
    "paths": {
      "@owox/plugin-sdk": ["./ui/sdk-mock"],
      "@mc/okf": ["./ui/okf/index"]
    }
  },
  "include": ["ui", "src"]
}
```

- [ ] **Step 5: Copy the small scaffolding files verbatim from the starter, adapting names.**

Copy these from `owox-data-marts-experimental/packages/plugin-starter/`:
- `tailwind.config.ts` → identical (`content: ['./ui/**/*.{ts,tsx,html}']`).
- `postcss.config.js` → identical.
- `vitest.config.ts` → identical, BUT add the okf alias so tests resolve `@mc/okf`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    alias: {
      '@owox/plugin-sdk': new URL('./ui/sdk-mock.ts', import.meta.url).pathname,
      '@mc/okf': new URL('./ui/okf/index.ts', import.meta.url).pathname,
    },
  },
});
```
- `src/test-setup.ts` → identical (`import '@testing-library/jest-dom/vitest';`).
- `owox.dev.example.json` → copy, then trim `credentials` to what this plugin uses:
```jsonc
{
  "_readme": "Copy to owox.dev.json (gitignored) for `npm run dev:broker`. NEVER commit owox.dev.json.",
  "owox": { "apiUrl": "http://localhost:3000", "apiKey": "" },
  "credentials": [
    { "type": "ai-provider", "secret": "", "config": { "baseUrl": "https://openrouter.ai/api/v1" } }
  ],
  "settings": { "global": {}, "byProject": {} },
  "ports": { "ui": 5177, "broker": 5178 }
}
```
- `ui/sdk-mock.ts` → copy the starter's file, then change the `owox` stub so list endpoints don't crash the canvas in browser-only dev:
```ts
// replace `export const owox = stub('owox');` with:
export const owox = {
  request: async (method: string, path: string, _body?: unknown) => {
    console.info('[owox dev mock] owox.request', method, path);
    // Return [] for list reads so the canvas renders without a host; Push is a no-op in mock mode.
    if (method === 'GET' && (path === '/api/data-storages' || path === '/api/data-marts')) return [];
    return undefined;
  },
  dataMart: (id: string) => ({ query: async () => { console.info('[owox dev mock] dataMart.query', id); return undefined; } }),
} as any;
```

- [ ] **Step 6: Write `ui/index.html`**

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Model Canvas</title></head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

- [ ] **Step 7: Write `ui/styles.css`** (Tailwind entry — the canvas's own `index.css` and `canvas.css` are imported separately by the app)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Write `.gitignore`**

```
node_modules
dist
owox.dev.json
.owox-dev
*.log
.DS_Store
```

- [ ] **Step 9: Install and verify config resolves**

Run: `npm install`
Expected: completes with no error (no `@owox/plugin-sdk` or `@supabase/*` fetch attempts).

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: scaffold model-canvas plugin skeleton"
```

---

### Task 2: Vendor the OKF library into `ui/okf/`

**Files:**
- Create: `ui/okf/index.ts`, `ui/okf/parse.ts`, `ui/okf/serialize.ts`, `ui/okf/types.ts`, `ui/okf/slug.ts` (copied from `OKF/`)

**Interfaces:**
- Produces: `@mc/okf` (aliased to `ui/okf/index.ts`) exporting `ModelGraph`, `ModelNode`, `ModelEdge`, `InputSource`, and the parse/serialize functions the app imports.

- [ ] **Step 1: Copy the 5 okf source files**

Run:
```bash
mkdir -p ui/okf
cp /Users/flakss/Projects/owox-model-canvas/packages/okf/src/{index,parse,serialize,types,slug}.ts ui/okf/
```

- [ ] **Step 2: Confirm no build step is needed**

The okf package was consumed as built `dist/` in the monorepo, but its `src` is plain TS with no I/O or external deps — Vite/Vitest/tsc compile it in place via the alias. Open `ui/okf/index.ts` and verify it only re-exports from the sibling files (no `dist` references). If any import points at `./dist` or a package path, change it to the relative sibling (`./parse`, etc.).

- [ ] **Step 3: Verify it typechecks in isolation**

Run: `npx tsc --noEmit -p tsconfig.json` (will still fail later on missing app files — at this point just confirm no errors originate from `ui/okf/*`).

- [ ] **Step 4: Commit**

```bash
git add ui/okf && git commit -m "feat: vendor @mc/okf source into ui/okf"
```

---

### Task 3: Port the canvas app modules (mechanical copy, no edits yet)

**Files:**
- Create (copy from `SRC/`, EXCLUDING the auth/account/analytics files listed below):
  `ui/App.tsx`, `ui/main.tsx`, `ui/index.css`,
  `ui/state/**`, `ui/sync/**`, `ui/okf/io.ts` (note: `SRC/okf/io.ts` is app glue, distinct from the vendored lib — see Step 2),
  `ui/lib/**`, `ui/components/**`, `ui/templates/**`, `ui/share/**`, `ui/analytics/**` (temporarily; deleted in Task 8), `ui/test/**`

**Interfaces:**
- Produces: the full app tree under `ui/`, still importing the to-be-removed auth modules (fixed in Tasks 4–8).

- [ ] **Step 1: Copy the app source directories**

Run:
```bash
cd /Users/flakss/Projects/model-canvas
SRC=/Users/flakss/Projects/owox-model-canvas/packages/web/src
cp "$SRC"/App.tsx "$SRC"/main.tsx "$SRC"/index.css ui/
cp -R "$SRC"/state "$SRC"/sync "$SRC"/lib "$SRC"/components "$SRC"/templates "$SRC"/share "$SRC"/analytics "$SRC"/test ui/
mkdir -p ui/okf && cp "$SRC"/okf/io.ts "$SRC"/okf/io.test.ts "$SRC"/okf/guideExample.test.ts ui/okf/
```

Note: `SRC/okf/io.ts` (canvas↔bundle glue) coexists with the vendored lib files from Task 2 in `ui/okf/`. They don't collide: lib files are `index/parse/serialize/types/slug`; the glue is `io`. Both import `@mc/okf` (the alias points at `ui/okf/index.ts`) — that's fine, the alias resolves before the sibling.

- [ ] **Step 2: Fix the vendored-lib import inside `ui/okf/io.ts`**

`ui/okf/io.ts` imports from `@mc/okf`. Keep it as `@mc/okf` (the alias resolves it). Do NOT rewrite to relative — consistency with the rest of the app.

- [ ] **Step 3: Point `ui/index.html` at the app entry** — already `./main.tsx` (Task 1 Step 6). `ui/main.tsx` was copied in Step 1 and still calls `initAnalytics()` + imports `./index.css`; leave for now (Task 6 fixes it). Add the Tailwind entry import: ensure `ui/main.tsx` imports `./styles.css` too (Task 6 will finalize).

- [ ] **Step 4: Verify structure**

Run: `ls ui && ls ui/components ui/lib ui/sync ui/state`
Expected: directories present. Do NOT run typecheck yet — auth imports still resolve (files copied), full green comes after Task 8.

- [ ] **Step 5: Commit**

```bash
git add ui && git commit -m "chore: port canvas app modules into ui/ (pre-cleanup)"
```

---

### Task 4: Rewrite the `lib/api.ts` seam + port the OWOX-import composite

**Files:**
- Modify: `ui/lib/api.ts` (rewrite body)
- Create: `ui/sync/owoxImportFetch.ts` (frontend port of `server/owox/import.ts` + the client read helpers)
- Modify: `ui/components/OwoxImportDialog.tsx` (call the new composite instead of `api('/api/owox-import?...')`)
- Test: `ui/lib/api.test.ts`, `ui/sync/owoxImportFetch.test.ts`

**Interfaces:**
- Consumes: `owox.request(method, path, body?)` from `@owox/plugin-sdk`.
- Produces:
  - `api<T>(path: string, opts?: RequestInit): Promise<T>` — unchanged signature; routes through the broker.
  - `buildImportPayload(storageId: string): Promise<ImportPayload>` from `ui/sync/owoxImportFetch.ts`, where `ImportPayload` is the existing type from `ui/sync/owoxImport.ts`.

- [ ] **Step 1: Write the failing test for `api.ts`**

`ui/lib/api.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sdk from '@owox/plugin-sdk';
import { api } from './api';

describe('api → owox.request', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('maps method + path + parsed body to owox.request', async () => {
    const spy = vi.spyOn(sdk.owox, 'request').mockResolvedValue({ id: 'x' } as any);
    const out = await api('/api/data-marts', { method: 'POST', body: JSON.stringify({ title: 'T' }) });
    expect(spy).toHaveBeenCalledWith('POST', '/api/data-marts', { title: 'T' });
    expect(out).toEqual({ id: 'x' });
  });

  it('defaults to GET with no body', async () => {
    const spy = vi.spyOn(sdk.owox, 'request').mockResolvedValue([]);
    await api('/api/data-marts');
    expect(spy).toHaveBeenCalledWith('GET', '/api/data-marts', undefined);
  });

  it('rewrites the BFF-only /api/storages alias to /api/data-storages', async () => {
    const spy = vi.spyOn(sdk.owox, 'request').mockResolvedValue([]);
    await api('/api/storages');
    expect(spy).toHaveBeenCalledWith('GET', '/api/data-storages', undefined);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run ui/lib/api.test.ts --maxWorkers=4`
Expected: FAIL (current `api.ts` still calls `fetch`).

- [ ] **Step 3: Rewrite `ui/lib/api.ts`**

```ts
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
```

- [ ] **Step 4: Run the api test — expect PASS**

Run: `npx vitest run ui/lib/api.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the import composite**

`ui/sync/owoxImportFetch.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sdk from '@owox/plugin-sdk';
import { buildImportPayload } from './owoxImportFetch';

describe('buildImportPayload', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('resolves storage → marts → relationships via owox.request', async () => {
    vi.spyOn(sdk.owox, 'request').mockImplementation(async (method: string, path: string) => {
      if (path === '/api/data-storages') return [{ id: 's1', title: 'BQ', type: 'GOOGLE_BIGQUERY' }] as any;
      if (path.startsWith('/api/data-marts') && !path.includes('/')) return { items: [{ id: 'm1', title: 'Orders', storage: { title: 'BQ', type: 'GOOGLE_BIGQUERY' } }], nextOffset: null } as any;
      if (path === '/api/data-marts?') return { items: [], nextOffset: null } as any;
      if (path === '/api/data-marts/m1') return { id: 'm1', title: 'Orders', schema: { fields: [] }, definitionType: 'SQL', definition: { sqlQuery: 'select 1' } } as any;
      if (path.includes('/relationships/graph')) return { nodes: [] } as any;
      return { items: [], nextOffset: null } as any;
    });
    const payload = await buildImportPayload('s1');
    expect(payload.storageId).toBe('s1');
    expect(payload.marts.map(m => m.id)).toEqual(['m1']);
  });

  it('throws on unknown storage id', async () => {
    vi.spyOn(sdk.owox, 'request').mockResolvedValue([] as any);
    await expect(buildImportPayload('nope')).rejects.toThrow(/Unknown storage/);
  });
});
```

- [ ] **Step 6: Run it — expect FAIL** (module missing)

Run: `npx vitest run ui/sync/owoxImportFetch.test.ts --maxWorkers=4`
Expected: FAIL ("Cannot find module './owoxImportFetch'").

- [ ] **Step 7: Write `ui/sync/owoxImportFetch.ts`** (port of `server/owox/import.ts` + `client.ts` read helpers, on `owox.request`)

```ts
import { api } from '../lib/api';
import type { ImportPayload, ImportMart, ImportRelationship } from './owoxImport';
import type { InputSource } from '@mc/okf';

const MAX_IMPORT = 100;

// Paginate every data mart (list items carry storage:{title,type} but NO id).
async function listDataMarts(): Promise<any[]> {
  const out: any[] = [];
  let offset: number | undefined;
  for (;;) {
    const qs = offset !== undefined ? `?offset=${offset}` : '';
    const page = await api<{ items: any[]; nextOffset: number | null }>(`/api/data-marts${qs}`);
    out.push(...(page.items ?? []));
    if (page.nextOffset === null || page.nextOffset === undefined) break;
    offset = page.nextOffset;
  }
  return out;
}

async function getImportMart(id: string): Promise<ImportMart> {
  const d = await api<any>(`/api/data-marts/${encodeURIComponent(id)}`);
  const fields: any[] = d.schema?.fields ?? [];
  const dt: string | undefined = d.definitionType;
  const def = d.definition ?? {};
  const definition =
    dt === 'SQL' ? (def.sqlQuery ?? null)
    : (dt === 'TABLE' || dt === 'VIEW') ? (def.fullyQualifiedName ?? null)
    : null;
  const inputSource = (dt === 'SQL' || dt === 'TABLE' || dt === 'VIEW' || dt === 'CONNECTOR' ? dt : 'SQL') as InputSource;
  return {
    id: d.id ?? id, title: d.title ?? '', status: d.status,
    ...(d.description ? { description: d.description } : {}),
    schema: fields.map(f => ({
      name: f.name, type: f.type, pk: !!f.isPrimaryKey,
      ...(f.alias ? { alias: f.alias } : {}),
      ...(f.description ? { description: f.description } : {}),
    })),
    inputSource, definition,
  };
}

async function getRelationshipGraph(id: string): Promise<ImportRelationship[]> {
  const g = await api<{ nodes?: any[] }>(`/api/data-marts/${encodeURIComponent(id)}/relationships/graph`).catch(() => ({ nodes: [] }));
  const seen = new Set<string>();
  const out: ImportRelationship[] = [];
  for (const n of g.nodes ?? []) {
    if (n.isCycleStub) continue;
    const r = n.relationship; if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      sourceId: r.sourceDataMart.id,
      targetId: r.targetDataMart.id,
      joinConditions: (r.joinConditions ?? []).map((j: any) => ({ sourceFieldName: j.sourceFieldName, targetFieldName: j.targetFieldName })),
    });
  }
  return out;
}

// Resolve the chosen storage → title+type, list+cap its marts, fetch details in
// parallel, then walk relationship graphs (each spans a connected component, so
// skip re-rooting once covered; dedupe by directed pair).
export async function buildImportPayload(storageId: string): Promise<ImportPayload> {
  const storages = await api<any[]>('/api/data-storages');
  const storage = storages.find(s => s.id === storageId);
  if (!storage) throw new Error(`Unknown storage id: ${storageId}`);

  const all = await listDataMarts();
  const forStorage = all.filter(m => m.storage?.title === storage.title && m.storage?.type === storage.type)
    .map(m => ({ id: m.id, title: m.title, status: m.status }));
  const total = forStorage.length;
  const picked = forStorage.slice(0, MAX_IMPORT);

  const marts = await Promise.all(picked.map(m => getImportMart(m.id)));

  const covered = new Set<string>();
  const seenPair = new Set<string>();
  const relationships: ImportRelationship[] = [];
  for (const m of picked) {
    if (covered.has(m.id)) continue;
    const rels = await getRelationshipGraph(m.id);
    covered.add(m.id);
    for (const r of rels) {
      covered.add(r.sourceId); covered.add(r.targetId);
      const key = `${r.sourceId}>${r.targetId}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      relationships.push(r);
    }
  }
  return { storageId, total, truncated: total > MAX_IMPORT, marts, relationships };
}
```

- [ ] **Step 8: Run the import test — expect PASS**

Run: `npx vitest run ui/sync/owoxImportFetch.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 9: Rewire `ui/components/OwoxImportDialog.tsx`**

Find the line (≈25): `const p = await api<ImportPayload>(\`/api/owox-import?storageId=${encodeURIComponent(storageId)}\`);`
Replace with:
```ts
const p = await buildImportPayload(storageId);
```
Add the import at the top: `import { buildImportPayload } from "../sync/owoxImportFetch";`
Remove the now-unused `api` import if nothing else in the file uses it (check first).

- [ ] **Step 10: Run the OwoxImportDialog test**

Run: `npx vitest run ui/components/OwoxImportDialog.test.tsx --maxWorkers=4`
Expected: PASS (the test mocks the payload/graph shape; if it mocked `api('/api/owox-import')` specifically, update it to mock `buildImportPayload` from `../sync/owoxImportFetch`).

- [ ] **Step 11: Commit**

```bash
git add ui/lib/api.ts ui/lib/api.test.ts ui/sync/owoxImportFetch.ts ui/sync/owoxImportFetch.test.ts ui/components/OwoxImportDialog.tsx
git commit -m "feat: route OWOX calls through the broker (api seam + import composite)"
```

---

### Task 5: Move Insight Questions to `ai.chat`

**Files:**
- Modify: `ui/lib/questions.ts` (swap `api('/api/questions')` for `ai.chat`; inline the prompt builder + parser ported from `server/llm/gemini.ts`)
- Test: `ui/lib/questions.test.ts` (adjust to mock `ai.chat` instead of `api`)

**Interfaces:**
- Consumes: `ai.chat({ messages })` → `{ text, model, raw }` from `@owox/plugin-sdk`.
- Produces: `getQuestions(focus, goal, opts?)` unchanged signature returning `InsightQuestion[]`; still throws `AiLimitError` when the AI grant is absent/limited.

- [ ] **Step 1: Update the test to mock `ai.chat`**

Open `ui/lib/questions.test.ts`. Replace any mock of `api('/api/questions')` with a mock of `sdk.ai.chat`:
```ts
import * as sdk from '@owox/plugin-sdk';
// success:
vi.spyOn(sdk.ai, 'chat').mockResolvedValue({ text: JSON.stringify([{ question: 'Q', unlockedBy: 'J' }]), model: 'm', raw: {} });
// limit path: reject with a broker error carrying a code
vi.spyOn(sdk.ai, 'chat').mockRejectedValue(Object.assign(new Error('denied'), { code: 'GRANT_DENIED' }));
```
Keep the existing assertions on the returned `InsightQuestion[]` and on `AiLimitError` being thrown for the limit/denied path. Call `__clearCache()` between cases (already exported).

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run ui/lib/questions.test.ts --maxWorkers=4`
Expected: FAIL (still imports/calls `api`).

- [ ] **Step 3: Rewrite the network part of `ui/lib/questions.ts`**

Remove `import { api } from "./api";`. Add `import { ai } from "@owox/plugin-sdk";`. Add the prompt builder (ported verbatim from `server/llm/gemini.ts`'s `buildPrompt`, minus the server types — reuse the local `QuestionFocus`/`InsightQuestion` already in this file). Replace the `getQuestions` network block:

```ts
// Ported from the old server/llm/gemini.ts buildPrompt — pure string assembly.
function buildPrompt(input: { niche: string; goal: string; focus: QuestionFocus }): string {
  const { niche, goal, focus } = input;
  const marts = focus.marts.map(m => {
    const fields = m.fields.map(f => {
      const label = f.alias && f.alias !== f.name ? ` "${f.alias}"` : "";
      const note = f.description ? ` — ${f.description}` : "";
      return `${f.name}:${f.type}${f.pk ? " (PK)" : ""}${label}${note}`;
    }).join("\n    ");
    return `- ${m.title}${m.role === "selected" ? " [SELECTED]" : ""}${m.description ? ` — ${m.description}` : ""}\n  fields:\n    ${fields || "(none)"}`;
  }).join("\n");
  const joins = focus.joins.length
    ? focus.joins.map(j => `- ${j.from} ⨝ ${j.to} on ${j.on.map(k => `${j.from}.${k.left} = ${j.to}.${k.right}`).join(", ")}`).join("\n")
    : "(none)";
  return [
    `You are a senior analytics consultant helping a data team show business stakeholders the value of data modelling.`,
    `Business niche: ${niche}`,
    `Primary business goal: ${goal}`,
    ``,
    `Data marts in focus (the SELECTED one is the centre of attention; others are joined neighbours):`,
    marts, ``,
    `Relationships (joins) between them:`,
    joins, ``,
    `Generate EXACTLY 5 NON-TRIVIAL business questions that this modelled data — especially the joins — makes answerable, in service of the goal above. Avoid trivial single-column lookups. Favour questions that only become possible BECAUSE these marts are joined.`,
    `For each question, "unlockedBy" must name the specific field(s) or join that makes it answerable (e.g. "Orders ⨝ Customers join").`,
    `Return ONLY a JSON array of exactly 5 objects: [{"question": string, "unlockedBy": string}].`,
  ].join("\n");
}

function parseQuestions(text: string): InsightQuestion[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("AI returned malformed JSON"); }
  if (!Array.isArray(parsed)) throw new Error("AI response was not an array");
  const qs = parsed
    .filter((q): q is InsightQuestion => !!q && typeof (q as any).question === "string" && typeof (q as any).unlockedBy === "string")
    .slice(0, 5)
    .map(q => ({ question: q.question, unlockedBy: q.unlockedBy }));
  if (qs.length === 0) throw new Error("AI response had no valid questions");
  return qs;
}
```

Then the `getQuestions` fetch block becomes:
```ts
  let questions: InsightQuestion[];
  try {
    const reply = await ai.chat({
      messages: [{ role: "user", content: buildPrompt({ niche: goal.niche, goal: goal.goal, focus }) }],
    });
    questions = parseQuestions(reply.text || "");
  } catch (err) {
    const code = (err as { code?: string; status?: number }).code;
    const status = (err as { status?: number }).status;
    // No AI grant, revoked secret, or provider rate/spend cap → the panel's
    // friendly "limit reached" UX (same as the old 429).
    if (code === "GRANT_DENIED" || code === "NO_CREDENTIAL" || status === 429) throw new AiLimitError();
    throw err;
  }
  cache.set(cacheKey, questions);
  return questions;
```

- [ ] **Step 4: Run the questions test — expect PASS**

Run: `npx vitest run ui/lib/questions.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/lib/questions.ts ui/lib/questions.test.ts
git commit -m "feat: Insight Questions via ai.chat (drop Gemini BFF route)"
```

---

### Task 6: Strip providers + analytics from the app shell

**Files:**
- Modify: `ui/App.tsx`, `ui/main.tsx`

**Interfaces:**
- Produces: `App` renders `<CanvasApp/>` with no auth/account context; `main.tsx` mounts it with no analytics.

- [ ] **Step 1: Rewrite `ui/App.tsx`**

```tsx
import { CanvasApp } from "./components/canvas/Canvas";

export function App() {
  // The host scopes the plugin to one authenticated project and brokers OWOX
  // auth, so there is no in-app sign-in. Anonymous-first canvas renders directly.
  return <CanvasApp />;
}
```

- [ ] **Step 2: Rewrite `ui/main.tsx`**

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./index.css";
createRoot(document.getElementById("root")!).render(<App />);
```

(`styles.css` = Tailwind entry; `index.css` = the ported canvas base styles.)

- [ ] **Step 3: Verify no stray provider references remain in the shell**

Run: `grep -nE "AuthProvider|AccountProvider|initAnalytics" ui/App.tsx ui/main.tsx`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add ui/App.tsx ui/main.tsx
git commit -m "refactor: drop auth/account providers + analytics from app shell"
```

---

### Task 7: Canvas surgery — remove account/save/sign-in wiring

**Files:**
- Modify: `ui/components/canvas/Canvas.tsx`

This is the largest edit. `Canvas.tsx` wires the OWOX-connect flow, the Supabase account, saved models, and version history. Remove all of it; keep the anonymous canvas (create/edit/import/export/share/push-with-storage-picker). The host provides the project session, so **storages load unconditionally** and **Push never gates on sign-in**.

**Interfaces:**
- Consumes: `api` (now broker-backed), `pushModel`/`pushPreview` (unchanged), `buildImportPayload`, `mergeGraphs`.
- Produces: `CanvasApp` (default export/named as today) with no auth props.

- [ ] **Step 1: Remove imports** (delete these lines near the top, refs 40–69)

Delete:
```
import { useAuth } from "../../lib/auth";
import { useAccount } from "../../lib/account";
import { supabaseEnabled } from "../../lib/supabase";
import { isAuthRedirecting } from "../../lib/authRedirect";
import { createModel, updateModel, createVersion, listModels, loadModel, deleteModel, listVersions, loadVersion, type SavedModel, type ModelVersion } from "../../lib/models";
import { SignInModal } from "../SignInModal";
import { pushIntent } from "../../sync/pushGate";
import { EnablePanel } from "../rail/EnablePanel";
import { AccountPanel } from "../rail/AccountPanel";
import { MyModelsPanel } from "../rail/MyModelsPanel";
import { HistoryPanel } from "../rail/HistoryPanel";
```
Also remove `import { detachFromOwox } from "../../sync/detach";` (only used by sign-out) and the `DiffDialog` import if only used by history (verify — `grep DiffDialog ui/components/canvas/Canvas.tsx`; if only in the history-diff block, remove).

- [ ] **Step 2: Remove `questionsEnabled` fetch, keep the flag as a grant probe**

Replace the `/api/config` effect (refs 209–214):
```ts
const [questionsEnabled, setQuestionsEnabled] = useState(false);
useEffect(() => {
  api<{ questionsEnabled: boolean }>("/api/config").then(c => setQuestionsEnabled(!!c.questionsEnabled)).catch(() => setQuestionsEnabled(false));
}, []);
```
with an optimistic default (the feature shows; a missing AI grant surfaces as the `AiLimitError` "limit reached" message inside the panel):
```ts
// Insight Questions are available when an ai-provider credential was granted.
// Assume available; a denied grant degrades to the panel's "limit reached" state.
const questionsEnabled = true;
```
Delete the `useState`/effect lines.

- [ ] **Step 3: Remove account/auth hooks + all save/version state**

Delete these (refs ~238–283):
- `const { me, connect, signOut } = useAuth();`
- `const { user: account, ... } = useAccount();`
- the two `useEffect`s reacting to `account` (clear highlight, close gated panels)
- the `listModels` effect, `saving`, `savedModelId`, `savedModels`, `versionsBump`, `versions`, `historyDiff`, `savedSnapshot` state + their effects.
- `const [signIn, setSignIn] = useState(...)`.

- [ ] **Step 4: Make storages load unconditionally**

Replace the gated loader trigger (refs 306–309):
```ts
useEffect(() => {
  if (!me) { setStorages([]); return; }
  void loadStorages();
}, [me, loadStorages]);
```
with:
```ts
// The host session is always present, so load the project's storages on mount.
useEffect(() => { void loadStorages(); }, [loadStorages]);
```

- [ ] **Step 5: Simplify Push (no sign-in gate)**

Replace `handlePush` (refs 733–739):
```ts
const handlePush = useCallback(() => {
  if (pushIntent(me) === "sign-in") { setSignIn({ mode: "push" }); return; }
  setShowPushConfirm(true);
}, [me]);
```
with:
```ts
// Host brokers OWOX auth — no sign-in. Confirm the target storage, then push.
const handlePush = useCallback(() => { setShowPushConfirm(true); }, []);
```
Delete `handleSignOut`, `handleChangeProject` (refs ~745–758) and any remaining `runPush`-from-signin caller. Keep `runPush` itself (invoked by the push-confirm dialog).

- [ ] **Step 6: Remove all save/account handler functions**

Delete `handleSave`, `handleOpenModelById`, `handleNewModel`/`handleRenameModel`/`handleDeleteModel` (the save-backed ones — keep the plain "clear/new canvas" handler if separate; verify), `handleCompare`, `handleRestoreById`, `handleEnable`. Search: `grep -nE "handleSave|handleOpenModelById|handleRenameModel|handleDeleteModel|handleCompare|handleRestoreById|handleEnable|createVersion|savedSnapshot|setSaved" ui/components/canvas/Canvas.tsx` and remove each definition + reference.

- [ ] **Step 7: Trim the `saveState` caption**

Remove the `saveState` computation (refs 770–776, depends on `savedModelId`/`savedSnapshot`). Pass `saveState={null}` / drop the prop at the `RightRail` usage (Step 9).

- [ ] **Step 8: Fix the `<TopBar>` props**

At the TopBar usage (refs 789–810) remove `signedIn`, `projectTitle`, `supabaseEnabled`, `accountEmail`, `onEnable`. Keep `questionsEnabled={questionsEnabled}` (now a const `true`), `storages`, `storageId`, `onStorageChange`, import/export/share/push/library/goal props, `modelName`. (TopBar itself is trimmed in Task 8.)

- [ ] **Step 9: Remove the SignInModal + gated panels + fix RightRail**

- Delete the whole `{signIn && (<SignInModal .../>)}` block (refs 893–915).
- Delete the `{panel.active === "enable" && (<EnablePanel .../>)}`, `"account"`, `"models"`, `"history"` blocks (refs 1018–1050).
- Replace the `RightRail` usage (ref 1057):
```tsx
<RightRail active={panel.active} onOpen={handleRailOpen} signedIn={!!account} highlightId={visualRailId} onSave={supabaseEnabled ? handleSave : undefined} saving={saving} saveState={saveState} />
```
with:
```tsx
<RightRail active={panel.active} onOpen={handleRailOpen} highlightId={visualRailId} />
```
- In `useRightPanel` / `gatedPanelId`, the `enable/account/models/history` panel ids are now dead. Leave `useRightPanel` but ensure `RightRail` (Task 8) no longer renders their icons.

- [ ] **Step 10: Resolve remaining references**

Run: `grep -nE "\bme\b|account|signIn|savedModel|useAccount|useAuth|supabaseEnabled|pushIntent|EnablePanel|MyModelsPanel|HistoryPanel|AccountPanel|isAuthRedirecting|detachFromOwox" ui/components/canvas/Canvas.tsx`
Expected: no matches (except comments you may leave). Fix each straggler.

- [ ] **Step 11: Typecheck the canvas**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep Canvas.tsx || echo "Canvas clean"`
Expected: no Canvas.tsx errors (other files still error until Task 8 deletes their auth deps).

- [ ] **Step 12: Commit**

```bash
git add ui/components/canvas/Canvas.tsx
git commit -m "refactor: remove account/save/sign-in wiring from Canvas"
```

---

### Task 8: Delete dead auth/account/analytics files + trim their consumers

**Files:**
- Delete: `ui/lib/auth.tsx`, `ui/lib/account.tsx`, `ui/lib/supabase.ts`, `ui/lib/authRedirect.ts`, `ui/lib/models.ts`, `ui/analytics/posthog.ts`, `ui/components/SignInModal.tsx`, `ui/components/EnableControl.tsx`, `ui/components/rail/AccountPanel.tsx`, `ui/components/rail/MyModelsPanel.tsx`, `ui/components/rail/HistoryPanel.tsx`, `ui/components/rail/EnablePanel.tsx`, `ui/sync/pushGate.ts`, `ui/sync/detach.ts`, `ui/components/DiffDialog.tsx` (verify DiffDialog only served history)
- Delete their colocated tests: `SignInModal.test.tsx`, `pushGate.test.ts`, `detach.test.ts`, `EnablePanel.test.tsx`, and any `*.test` for the above.
- Modify: `ui/components/TopBar.tsx` (remove account/enable props + `EnableControl` usage), `ui/components/inspector/Inspector.tsx` (keep `questionsEnabled` prop — still used), `ui/components/rail/RightRail.tsx` (remove gated icons + `signedIn`/`onSave`/`saving`/`saveState` props), `ui/components/rail/useRightPanel.ts` (drop dead panel ids if they only served account features)

**Interfaces:**
- Produces: a tree with zero references to Supabase, PostHog, OWOX-key sign-in, or `/api/config`.

- [ ] **Step 1: Delete the files**

Run:
```bash
cd /Users/flakss/Projects/model-canvas
git rm ui/lib/auth.tsx ui/lib/account.tsx ui/lib/supabase.ts ui/lib/authRedirect.ts ui/lib/models.ts \
  ui/analytics/posthog.ts ui/components/SignInModal.tsx ui/components/SignInModal.test.tsx \
  ui/components/EnableControl.tsx ui/components/rail/AccountPanel.tsx ui/components/rail/MyModelsPanel.tsx \
  ui/components/rail/MyModelsPanel.test.tsx ui/components/rail/HistoryPanel.tsx ui/components/rail/HistoryPanel.test.tsx \
  ui/components/rail/EnablePanel.tsx ui/components/rail/EnablePanel.test.tsx \
  ui/sync/pushGate.ts ui/sync/pushGate.test.ts ui/sync/detach.ts ui/sync/detach.test.ts
rmdir ui/analytics 2>/dev/null || true
```
Then check DiffDialog: `grep -rn DiffDialog ui/ --include='*.tsx' | grep -v DiffDialog.tsx`. If no remaining consumer, `git rm ui/components/DiffDialog.tsx`.

- [ ] **Step 2: Trim `ui/components/TopBar.tsx`**

Remove: the `import { EnableControl }` line; the `questionsEnabled?`, `signedIn?`, `projectTitle?`, `modelName?` (keep modelName if still shown), `supabaseEnabled?`, `accountEmail?`, `onEnable?` props from the props interface + destructure; the `{supabaseEnabled && (<EnableControl .../>)}` block (refs 253–254). Keep `{questionsEnabled && (...)}` for the Business Goal button — change its guard to always-on or keep the prop (Canvas now passes `true`). Keep `projectTitle` removal (host shows the project chrome). Verify with `grep -nE "EnableControl|supabaseEnabled|accountEmail|onEnable" ui/components/TopBar.tsx` → no matches.

- [ ] **Step 3: Trim `ui/components/rail/RightRail.tsx`**

Remove the `signedIn`, `onSave`, `saving`, `saveState` props and the Save button + the account/models/history/enable rail icons. Keep the `inspect`/`share` icons (and any always-anonymous panels). Verify `grep -nE "onSave|signedIn|saveState" ui/components/rail/RightRail.tsx` → no matches. Update `RightRail.test.tsx` accordingly (remove assertions on the Save button / gated icons).

- [ ] **Step 4: Trim `ui/components/rail/useRightPanel.ts`**

If `RightPanelId` includes `"enable" | "account" | "models" | "history"`, remove those members and any `gatedPanelId` logic that only guarded them. Keep `"inspect" | "share"` (+ others that are anonymous). Update `useRightPanel.test.ts`.

- [ ] **Step 5: Purge remaining references across `ui/`**

Run:
```bash
grep -rnE "supabase|posthog|useAuth|useAccount|SignInModal|/api/config|/api/me|/api/auth|pushIntent|initAnalytics|@supabase|MyModelsPanel|EnablePanel|AccountPanel|HistoryPanel" ui/ --include='*.ts' --include='*.tsx'
```
Expected: **no matches**. Fix any straggler (usually a stale import or a test).

- [ ] **Step 6: Full typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors).

- [ ] **Step 7: Full test suite**

Run: `npm test`  (= `vitest run --maxWorkers=4`)
Expected: PASS. Delete/adjust any test still asserting removed auth/save/account/version behavior.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: delete Supabase/PostHog/sign-in tiers; trim consumers"
```

---

### Task 9: Tailwind audit, host-build probe, README, final acceptance

**Files:**
- Possibly modify: `ui/styles.css` / `ui/index.css` (precompile if custom-theme classes exist)
- Create: `README.md`
- Delete: leftover monorepo cruft if any copied in (`ui/analytics` already gone)

**Interfaces:** none (verification task).

- [ ] **Step 1: Audit Tailwind for host incompatibility**

The host ignores `tailwind.config` and uses the default theme. Search for custom-theme utilities that wouldn't compile:
```bash
grep -rnE "@apply|theme\(|[^-]bg-brand|text-brand|--tw-" ui/ --include='*.css' --include='*.tsx'
```
The canvas mostly uses arbitrary values (`bg-[#f7f8fa]`, `text-[13px]`) and standard utilities — those are fine. If any `@apply <custom-token>` or config-defined color appears, precompile: run `npx tailwindcss -i ui/styles.css -o ui/styles.built.css` locally and import the built file instead, OR replace the token with an arbitrary value. Document what you did in the commit.

- [ ] **Step 2: Reproduce the host esbuild build (AGENTS.md §7.1)**

Run:
```bash
npm install --ignore-scripts --omit=dev && npx esbuild ui/main.tsx --bundle --format=esm \
  --external:react --external:react-dom --external:react-dom/client \
  --external:react/jsx-runtime --external:react/jsx-dev-runtime \
  --external:react-router-dom --external:@owox/plugin-sdk --outfile=/tmp/mc-probe.js
```
Expected: succeeds with **no unresolved imports**. If `@mc/okf` is unresolved (esbuild doesn't read tsconfig paths), that's the one gotcha — the host build also won't know the alias. Fix: since okf lives at `ui/okf/`, change the app's `@mc/okf` imports to the relative `./okf` / `../okf` path, OR keep a real `ui/okf/index.ts` and rely on Vite's alias for dev while adding an esbuild `--alias:@mc/okf=./ui/okf/index.ts` proof here AND ensuring the host build resolves it. **Decision:** rewrite `@mc/okf` imports to relative paths (`../../okf`, depth-appropriate) so no alias is needed at host-build time. Re-run the probe until clean.

- [ ] **Step 3: Reconfirm typecheck + tests after any okf import rewrite**

Run: `npm run typecheck && npm test`
Expected: both PASS.

- [ ] **Step 4: Browser smoke test (mock mode)**

Run: `npm run dev` → open the printed localhost URL.
Verify: canvas loads; double-click adds a node; drag a port makes a relationship; **Export OKF** downloads a bundle; **Share** copies a URL; Push/storage picker are present (no-op without host — acceptable). No console errors about Supabase/PostHog/missing providers.

- [ ] **Step 5: Write `README.md`** (short — install-by-URL + dev)

```md
# Model Canvas (OWOX plugin)

A Miro-like canvas for OWOX Data Marts: sketch marts + joinable relationships, start from
templates, generate Insight Questions (AI), and push the model into OWOX as drafts. Ships as
an OWOX v2 plugin — the host brokers OWOX auth, so there is no in-app sign-in.

## Develop
    npm install
    npm run dev          # canvas against the local SDK mock (no host)
    npm run dev:broker   # against owox.dev.json creds (copy owox.dev.example.json)
    npm run typecheck
    npm test             # vitest --maxWorkers=4

## Install
Plugins → New Plugin → GitHub URL → `<owner>/model-canvas`. Grant data-mart + storage
(required) and ai-provider (optional, for Insight Questions) on the consent screen.
```

- [ ] **Step 6: Final full verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS; `dist/ui/` is produced.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: tailwind audit, host-build probe, README; migration complete"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-06-model-canvas-plugin-migration-design.md`):
- §3 layout → Task 1 (config/entry), Task 2 (okf), Task 3 (app modules). ✓
- §4 manifest → Task 1 Step 1. ✓
- §5 capability mapping → Task 4 (data-marts/storages/import), Task 5 (questions), Task 7 (removed auth/config). ✓
- §6.1 api seam → Task 4. §6.2 questions → Task 5. §6.3 import composite → Task 4. §6.4 shell → Task 6. §6.5 push gate → Task 7 Step 5. ✓
- §7 deletions → Task 8. ✓
- §8 persistence (URL+OKF, no host storage) → untouched by design; smoke-tested Task 9 Step 4. ✓
- §9 build conformance → Task 9 Steps 1–2 (Tailwind default theme, external deps, esbuild probe). ✓
- §10 testing → Tasks 4/5 (unit), Task 8 Step 7 (full), Task 9 (probe + build). ✓
- §12 acceptance → Task 9 Steps 2/4/6 + the grep gates in Task 8 Step 5. ✓

**Placeholder scan:** no TBD/TODO; every code step shows complete code; grep/verify commands have expected output.

**Type consistency:** `api<T>(path, opts)` signature preserved (Task 4) so all callers compile; `buildImportPayload(storageId): Promise<ImportPayload>` reuses the existing `ImportPayload` from `ui/sync/owoxImport.ts` (Task 4 Step 7 imports it); `getQuestions`/`InsightQuestion`/`AiLimitError` names unchanged (Task 5); `questionsEnabled` remains a boolean the TopBar/Inspector already accept (Task 7 Step 2 makes it a const `true`).

**Known risk flagged inline:** `@mc/okf` alias won't be seen by the host's esbuild — Task 9 Step 2 resolves it by rewriting to relative imports before publish.
