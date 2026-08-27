# OWOX Data Marts plugin development

Before changing this plugin, read:

https://docs.owox.com/docs/plugins/authoring-guide/

Use the OWOX Data Marts plugin authoring guide as the source of truth for plugin behavior,
security constraints, manifests, SDK usage, deployment, releases, and publishing.

If the authoring guide cannot be accessed, report that limitation before making assumptions
about the OWOX plugin contract.

## This plugin

- Read-only. It reads data marts, storages, destinations, `/api/connectors` and `/api/reports`,
  and calls nothing that writes. The one POST — `/api/data-marts/data-quality/summaries` — is a
  batch query: it takes ids and returns states. Do not add create/update/delete calls without asking.
- Untyped endpoints are wrapped in `optional()` in `src/owox.ts`: a member who cannot read one loses
  that detail (field counts, quality, report lines), never the page.
- The canvas layout — SVG wires under the cards, hover isolates, click pins — is a port of
  `owox.com/src/admin/model.astro`. Keep the two in step rather than inventing a second idiom.
- No persistent storage: `plugin.json` declares no `collections`, and the sandbox has no
  localStorage/IndexedDB/cookies. State lives in memory for the session only.

## Hosting

Not GitHub Pages. `https://data-flow.dorland.keenetic.pro/` is KeenDNS in front of this Mac on
port 8787; `npm run preview` (built) or `npm run dev` (live) both bind it, with `cors` and
`allowedHosts` set in `vite.config.ts`. Keep `delivery.url` in `plugin.json` equal to that address,
and keep `base: '/'` — the page sits at the domain root, not under a repo path.
