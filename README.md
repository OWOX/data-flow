# Model Canvas (OWOX plugin)

A Miro-like canvas for OWOX Data Marts: sketch marts + joinable relationships, start from
templates, generate Insight Questions (AI), and push the model into OWOX as drafts. Ships as
an OWOX v2 plugin — the host brokers OWOX auth, so there is no in-app sign-in.

## Layout
- `app/` — the React source (canvas, state, sync, components, vendored OKF lib).
- `ui/` — the **prebuilt** output the host installs (`index.html` + `index.js` + `index.css`),
  produced by `npm run build`. Committed on purpose (see below).

## Develop
    npm install
    npm run dev          # canvas against the local SDK mock (no host), from app/
    npm run dev:broker   # against owox.dev.json creds (copy owox.dev.example.json)
    npm run typecheck
    npm test             # vitest --maxWorkers=4
    npm run build        # regenerate the prebuilt ui/ — run before committing UI changes

## Why prebuilt
`@xyflow/react` pulls in `zustand` → `use-sync-external-store`, a **CommonJS** package that does
`require("react")`. The host builds source plugins with esbuild keeping `react` external, which
turns that CJS require into a runtime `__require("react")` that throws in the iframe ("Dynamic
require of 'react' is not supported") → blank screen. So we ship a Vite/rollup **prebuilt** `ui/`
instead: rollup rewrites the CJS require into a proper ESM `import`, and the built `ui/index.html`
carries the shared-deps import map itself. The host sees a built `.js` entry and serves `ui/` as-is
(AGENTS.md §7.1). **Rebuild `ui/` (`npm run build`) whenever you change `app/`.**

## Install
Plugins → New Plugin → GitHub URL → `<owner>/model-canvas`. Grant data-mart + storage
(required) and ai-provider (optional, for Insight Questions) on the consent screen.
