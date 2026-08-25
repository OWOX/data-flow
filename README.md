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

Push to `main` → GitHub Actions publishes `dist/` to <https://owox.github.io/model-canvas/> (the URL
in `plugin.json`). Then `gh release create vX.Y.Z --target main --generate-notes`.

See [AGENTS.md](AGENTS.md) and the [authoring guide](https://docs.owox.com/docs/plugins/authoring-guide/).
