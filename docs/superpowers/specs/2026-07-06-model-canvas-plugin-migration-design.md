# OWOX Model Canvas → v2 Plugin — Design

**Date:** 2026-07-06
**Goal:** Migrate `owox-model-canvas` (a 3-package pnpm monorepo with its own Fastify BFF and
Supabase auth) into a single **OWOX v2 plugin** installable into `owox-data-marts-experimental`,
and **remove all third-party authorization**. The plugin lives in this `model-canvas` repo.

Authoritative contract: `owox-data-marts-experimental/AGENTS.md` (v2 capability-broker model).
Blueprint to mirror: `packages/plugin-starter/`.

## 1. What changes, in one sentence

The host is a capability broker; the plugin holds no tokens. So the entire server tier
(BFF session, OWOX token exchange, Gemini proxy, SSRF allowlist) and the entire Supabase
account/save tier collapse into brokered SDK calls (`owox`, `ai`), and the plugin ships as a
plain source folder the host builds on install.

## 2. Source inventory (owox-model-canvas)

- `packages/okf` — pure `ModelGraph ⇄ OKF markdown` lib, **no I/O**. → **vendored into `ui/okf/`**.
- `packages/server` — Fastify BFF: OWOX token in cookie session, proxies OWOX HTTP, Gemini for
  Insight Questions, Supabase-independent OWOX auth. → **deleted in full**.
- `packages/web` — React + Vite + React Flow SPA. → **becomes `ui/`**.

## 3. Target layout (standalone plugin repo, mirrors plugin-starter)

```
plugin.json
ui/
  index.html            # <script type="module" src="./main.tsx">
  main.tsx              # createRoot(...).render(<App/>); NO analytics init
  App.tsx              # renders <CanvasApp/> directly (no auth/account providers)
  okf/                 # vendored @mc/okf source (index/parse/serialize/types/slug)
  lib/ state/ sync/ components/ templates/ share/ analytics?  # ported from web/src (see §6)
  sdk-mock.ts          # from starter — local dev SDK (owox/ai/settings/storage stubs)
  styles.css / index.css
package.json            # deps only: real runtime deps; react* external
vite.config.ts          # root: 'ui', alias @owox/plugin-sdk→sdk-mock on `serve`, external on build
tsconfig.json           # paths: @owox/plugin-sdk → ui/sdk-mock ; @mc/okf → ui/okf
tailwind.config.ts postcss.config.js
owox.dev.example.json   # { owox, credentials[], settings } for dev:broker
```

No `backend.ts`: push + AI both run as **frontend** capabilities (work in dev and prod). Backend
execution is dev-only/experimental (AGENTS.md §6) — not needed here.

## 4. Manifest (`plugin.json`)

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
    { "type": "storage",   "scope": "all" },
    { "type": "ai-provider", "scope": "one", "optional": true }
  ]
}
```

- `data-mart` + `storage` grants back the Push flow (create marts, read/list storages,
  relationships). `scope: "all"` because the canvas creates *new* marts and lists *all* storages.
- `ai-provider` is **optional** — Insight Questions degrade off if the user skips it
  (`GRANT_DENIED` at call time → hide the button). This reproduces the old `questionsEnabled` flag.
- **No credential-typed settings** (schema forbids it). No config settings needed at all today.

## 5. Capability mapping (BFF route → SDK)

| Old web call | New |
|---|---|
| `POST /api/auth/connect`, `/api/auth/signout`, `GET /api/me` | **removed** — host owns identity/session |
| `GET /api/config` → `{questionsEnabled}` | **removed** — gate on `ai-provider` grant (catch `GRANT_DENIED`) |
| `GET/POST/PUT/DELETE /api/data-marts…`, `…/relationships` | `owox.request(method, path, body)` — **paths identical** to OWOX API |
| `GET /api/storages` | `owox.request('GET', '/api/data-storages')` |
| `GET /api/owox-import?storageId=` | ported composite (§6.3): 3 OWOX GETs from the frontend |
| `POST /api/questions` (Gemini) | `ai.chat({ messages })` (§6.2) |

The broker's `owox` proxy forwards `req.originalUrl` verbatim to `{project.endpoint}` with the
project token + api-key-id injected (`host-backend/src/owox-proxy.ts`), so the OWOX paths the old
`OwoxClient` used (`/api/data-marts`, `/api/data-marts/:id/schema|title|description|definition`,
`/api/data-marts/:id/relationships`, `/api/data-marts/:id/relationships/graph`, `/api/data-storages`)
are exactly what `owox.request` should send.

## 6. Port plan (per area)

### 6.1 The one seam — `lib/api.ts`
Rewrite the body only; keep the `api<T>(path, opts)` signature so every caller
(`sync/push.ts`, `sync/owoxImport.ts`, storage/meta reads) is untouched:

```ts
import { owox } from '@owox/plugin-sdk';
export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body as string) : undefined;
  // BFF-only aliases:
  if (path === '/api/storages') path = '/api/data-storages';
  return owox.request(method, path, body) as Promise<T>;   // broker injects auth
}
```
Errors from the broker carry `code`/`status` (e.g. `GRANT_DENIED`), matching what callers branch on.

### 6.2 Insight Questions — `lib/questions.ts` + prompt
Move `server/src/llm/gemini.ts`'s prompt construction + JSON-shape parsing to the frontend. Replace
the `api('/api/questions')` call with `ai.chat({ messages: [{role:'system',...},{role:'user', content: JSON.stringify(input)}] })`,
parse `reply.text` into `InsightQuestion[]`. Map a thrown `GRANT_DENIED`/`NO_CREDENTIAL` (or the
old 429 rate-limit) to the existing `AiLimitError` path so the panel's "limit reached" UX still works.
Keep the in-module cache and `buildFocus` unchanged.

### 6.3 OWOX import composite — port `server/src/owox/import.ts` + `client.ts` readers
`/api/owox-import` was BFF-composite. Port `buildImportPayload` + the three read helpers
(`listDataMartsForStorage`, `getImportMart`, `getRelationshipGraph`) into a frontend module
(`sync/owoxImportFetch.ts`) built on `owox.request`. `OwoxImportDialog` calls it instead of
`api('/api/owox-import?…')`. The parsing/shape logic is pure and moves verbatim.

### 6.4 App shell
`App.tsx` → drop `AuthProvider`/`AccountProvider`; render `<CanvasApp/>` directly.
`main.tsx` → drop `initAnalytics()`.

### 6.5 Push gate
Old flow gated Push behind the OWOX-key `SignInModal`. The host already scopes the plugin to one
authenticated project, so **Push needs no sign-in**. Remove the sign-in gate; keep the
**storage picker** (a storage must be selected before push — `pushModel` already errors "No storage
selected"). `pushGate` / `PushConfirmDialog` stay, minus the auth precondition.

## 7. Deletions (third-party auth + dead tiers)

- `packages/server/**` (whole BFF).
- `lib/supabase.ts`, `lib/account.tsx`, `lib/models.ts`, `lib/auth.tsx`, `lib/authRedirect.ts`.
- `components/SignInModal.tsx`, `rail/MyModelsPanel.tsx`, `rail/HistoryPanel.tsx`,
  `rail/EnablePanel.tsx`/`EnableControl.tsx` **iff** they only exist to gate on account/OWOX-connect
  (verify during impl; keep any pure-canvas rail bits).
- `analytics/posthog.ts` + its `initAnalytics` call.
- Version-history code (`createVersion/listVersions/loadVersion` in `models.ts`, already deleted).
- `@supabase/supabase-js`, `posthog-js` from deps. Supabase env vars, all `VITE_SUPABASE_*`.
- Anything referencing `useAuth`/`useAccount`/`supabase` — remove the import + the gated branch,
  keeping the anonymous path (the app was already anonymous-first, so branches default "open").

## 8. Persistence after removing accounts

No account = no server-saved models. Persistence remains **client-side only**, unchanged and
already present:
- **Shareable URL** — whole model encoded in the link (`share/url.ts`, `lib/links.ts`).
- **OKF export/import** — `okf/io.ts` round-trips a Markdown bundle.
- **localStorage** draft autosave (`state/persist.ts`) if present.

Host `storage` KV is **not** used (we chose to drop the saved-models list, not re-home it).

## 9. Build/dev conformance (AGENTS.md §7.1)

- Entry `ui/index.html` boots one ES module (`main.tsx`).
- Keep `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react-router-dom`,
  `@owox/plugin-sdk` **external** (host import-map). Do **not** declare `@owox/plugin-sdk` as a dep
  (unpublished) — type it via `tsconfig paths` → `ui/sdk-mock.ts`.
- Every other runtime dep in `dependencies` (`@xyflow/react`, `@dagrejs/dagre`, `lucide-react`,
  `fflate`, `html-to-image`). Drop `@supabase/supabase-js`, `posthog-js`.
- Tailwind: host uses **default theme, ignores `tailwind.config`**. Audit for custom-theme classes;
  if any, precompile `ui/styles.css` and commit it. Otherwise standard utilities compile on install.
- Verify with the AGENTS.md §7.1 esbuild probe before publish.

## 10. Testing

Port the Vitest suites into `ui/` (`*.test.ts(x)` already colocated). They mock `api`/state, not
the network, so they pass once `lib/api.ts` is a thin `owox.request` shim. Add/adjust a test for the
new `ai.chat`-backed `questions.ts` (mock the SDK). Run capped: `vitest run --maxWorkers=4`.
Drop server tests (server deleted) and any test asserting the sign-in/account flow.

## 11. Out of scope

- Re-homing saved models on host `storage` (explicitly dropped).
- `backend.ts` (frontend capabilities cover everything).
- PostHog / analytics (dropped).
- Changing the OKF format, templates, or canvas UX.

## 12. Acceptance

1. `npm install && npm run typecheck` clean; `vitest run --maxWorkers=4` green.
2. AGENTS.md §7.1 esbuild probe resolves with no unresolved imports.
3. `npm run dev` renders the canvas against `sdk-mock.ts` (no host) — create/edit/export/share work.
4. `npm run dev:broker` with `owox.dev.json`: Push creates draft data marts + relationships in the
   configured project; Insight Questions return via the granted AI key.
5. No reference to Supabase, PostHog, OWOX API-key sign-in, or a local BFF remains in `ui/`.
