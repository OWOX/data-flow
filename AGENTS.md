# OWOX Data Marts plugin development

Before changing this plugin, read:

https://docs.owox.com/docs/plugins/authoring-guide/

Use the OWOX Data Marts plugin authoring guide as the source of truth for plugin behavior,
security constraints, manifests, SDK usage, deployment, releases, and publishing.

If the authoring guide cannot be accessed, report that limitation before making assumptions
about the OWOX plugin contract.

## This plugin

- Read-only. It calls `list()` on `ctx.owox.dataMarts`, `storages` and `destinations` and nothing
  that writes. Do not add create/update/delete calls without asking.
- No persistent storage: `plugin.json` declares no `collections`, and the sandbox has no
  localStorage/IndexedDB/cookies. State lives in memory for the session only.

## Hosting

Not GitHub Pages. `https://model-canvas.dorland.keenetic.pro/` is KeenDNS in front of this Mac on
port 8787; `npm run preview` (built) or `npm run dev` (live) both bind it, with `cors` and
`allowedHosts` set in `vite.config.ts`. Keep `delivery.url` in `plugin.json` equal to that address,
and keep `base: '/'` — the page sits at the domain root, not under a repo path.
