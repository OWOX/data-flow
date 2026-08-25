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

The page is not on GitHub Pages (repo is private, org plan is free). It is served from this Mac:

    npm run build && npm run serve     # http://10.0.0.11:8787, ACAO * and no X-Frame-Options

Keenetic/KeenDNS terminates HTTPS and proxies the public domain to that host:port; the URL in
`plugin.json` must be that public HTTPS address.
