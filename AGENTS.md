# OWOX Data Marts plugin development

Before changing this plugin, read:

https://docs.owox.com/docs/plugins/authoring-guide/

Use the OWOX Data Marts plugin authoring guide as the source of truth for plugin behavior,
security constraints, manifests, SDK usage, deployment, releases, and publishing.

If the authoring guide cannot be accessed, report that limitation before making assumptions
about the OWOX plugin contract.

## This plugin

- Read-only. It reads data marts, storages, destinations, `/api/connectors` and `/api/reports`,
  and calls nothing that writes. Both POSTs — `/api/data-marts/data-quality/summaries` and
  `/api/data-marts/health-status` — are batch queries: each takes ids and returns states. Do not add
  create/update/delete calls without asking.
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
