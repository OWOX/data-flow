# Model Canvas (OWOX plugin)

A Miro-like canvas for OWOX Data Marts: sketch marts + joinable relationships, start from
templates, generate Insight Questions (AI), and push the model into OWOX as drafts. Ships as
an OWOX v2 plugin — the host brokers OWOX auth, so there is no in-app sign-in.

## Develop
    npm install
    npm run dev          # canvas against the local SDK mock (no host)
    npm run dev:broker   # against owox.dev.json creds (copy owox.dev.example.json)
    npm run typecheck
    npm test             # vitest --maxWorkers=4

## Install
Plugins → New Plugin → GitHub URL → `<owner>/model-canvas`. Grant data-mart + storage
(required) and ai-provider (optional, for Insight Questions) on the consent screen.
