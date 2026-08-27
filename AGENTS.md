# OWOX Data Marts plugin development

Before changing this plugin, read:

https://docs.owox.com/docs/plugins/authoring-guide/

Use the OWOX Data Marts plugin authoring guide as the source of truth for plugin behavior,
security constraints, manifests, SDK usage, deployment, releases, and publishing.

If the authoring guide cannot be accessed, report that limitation before making assumptions
about the OWOX plugin contract.

## This plugin

- Read-only on open. Reading is data marts, storages, destinations, `/api/connectors` and
  `/api/reports`, plus two batch POSTs that are queries — `/api/data-marts/data-quality/summaries`
  and `/api/data-marts/health-status` each take ids and return states.
- Two POSTs do write, and only when a person presses **Check Quality & Freshness** beside the Data
  Marts count: `/api/data-marts/data-quality/runs/batch` and `/api/data-marts/data-last-updated/refresh`.
  Both start jobs that query the warehouse, so they cost the project real money and must never be
  called on load, on a timer, or as a retry. Do not add other create/update/delete calls without
  asking.
- Untyped endpoints are wrapped in `optional()` in `src/owox.ts`: a member who cannot read one loses
  that detail (field counts, quality, report lines), never the page.
- The canvas layout — SVG wires under the cards, hover isolates, click pins — is a port of
  `owox.com/src/admin/model.astro`. Keep the two in step rather than inventing a second idiom.
- No persistent storage: `plugin.json` declares no `collections`, and the sandbox has no
  localStorage/IndexedDB/cookies. State lives in memory for the session only.

## Hosting

GitHub Pages, from a public repo. `.github/workflows/pages.yml` builds `main` and publishes `dist/`
to `https://owox.github.io/data-flow/`. Keep `delivery.url` in `plugin.json` equal to that address,
and keep `base: '/data-flow/'` in `vite.config.ts` — the page sits under the repo path, not the org
root, so a bare `/` base 404s every asset.

## Develop

    npm install
    npm run typecheck
    npm run lint
    npm run build          # -> dist/

There is no standalone preview: `connect()` needs the real host handshake, so test by publishing a
release to **Only me** and installing it in OWOX Data Marts.

Release with `gh release create vX.Y.Z --target main --generate-notes`; OWOX reads `plugin.json`
from the release commit, and takes versions from published, non-prerelease `MAJOR.MINOR.PATCH` tags.
Publish the plugin itself once, with `owox-ctl plugins publish OWOX/data-flow --scope member`.
