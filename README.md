# Model Canvas — OWOX Data Marts plugin

The project's data model on one page: **Sources** → **Data Marts** → **Destinations**, as cards with
the lines that connect them. Hover a card to isolate what it touches, click to pin it. Read-only.
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

Served from this Mac, not GitHub Pages (private repo on a free org plan). KeenDNS terminates HTTPS
for `https://model-canvas.dorland.keenetic.pro/` and proxies it to this host on **8787** — the same
port `vite` pins for both commands:

    npm run build && npm run preview   # the built page, what OWOX loads in production
    npm run dev                        # live reload, same URL, while iterating inside OWOX

Both send `Access-Control-Allow-Origin: *` (`server.cors`) and no `X-Frame-Options`, which the
opaque-origin iframe requires, and accept the tunnel's Host via `allowedHosts`.

Release with `gh release create vX.Y.Z --target main --generate-notes`; OWOX reads `plugin.json`
from the release commit, so the repo being private means publishing once and following the GitHub
App install link OWOX returns.
