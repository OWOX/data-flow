# Model Canvas — OWOX Data Marts plugin

Read-only view of the Data Marts, storages and destinations the installing member can see.
Runs in the OWOX plugin iframe; all API calls are brokered by the host through
[`@owox/plugin-sdk`](https://docs.owox.com/packages/plugin-sdk/readme/) — the plugin never holds a
credential and stores nothing (no collections declared).

## Develop

    npm install
    npm run typecheck
    npm run lint
    npm run build          # -> dist/

There is no standalone preview: `connect()` needs the real host handshake, so test by publishing a
release to **Only me** and installing it in OWOX Data Marts.

## Deploy

The page is served from this Mac, not GitHub Pages (private repo on a free org plan):

    npm run build
    npm run serve          # http://10.0.0.11:8787 — sends `Access-Control-Allow-Origin: *`,
                           # no X-Frame-Options, so the OWOX iframe can load it

Keenetic/KeenDNS terminates HTTPS for the public domain and proxies it to `10.0.0.11:8787`; that
public HTTPS address is what goes in `plugin.json` → `delivery.url`. Then
`gh release create vX.Y.Z --target main --generate-notes` so OWOX picks up the version.

See [AGENTS.md](AGENTS.md) and the [authoring guide](https://docs.owox.com/docs/plugins/authoring-guide/).
