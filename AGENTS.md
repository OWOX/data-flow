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
- Who made a thing and who owns it come from the same list payloads, so they cost no request:
  `createdByUser` on all four, `ownerUsers` on storages, destinations and reports, and
  `businessOwnerUsers`/`technicalOwnerUsers` on data marts. Only `userId` is guaranteed, so a name
  falls back to the email and a face to initials.
- No persistent storage: `plugin.json` declares no `collections`, and the sandbox has no
  localStorage/IndexedDB/cookies. State lives in memory for the session only.

## The canvas

Five blocks in a column — Sources, Storages, Data Marts, Destinations, Reports — over one SVG
layer. The notes below are the contract; nothing outside this repo defines it.

- The wire layer sits above the block panels and below their titles (`#wires` is z-index 1, a
  block's head is 5), so a line crosses a block's background but never its name.
- An end that is not on the page resolves to something that is: the block that would have held it
  when the card is one this member cannot see, or the block's own "Load 25 more" card when it is
  simply past the page limit. A line is never dropped for want of an endpoint.
- A line is one colour in every state, and one weight with a single exception. Opacity says one
  thing — faded means "not the card you picked" — and colour says what a line is: blue crosses a
  block boundary, grey stays inside the Data Marts block as a join between two marts. Neither may
  be reused to mean anything else.
- The exception is weight, and only for a relationship: one arriving at the card in hand is 1px
  against 2px for one leaving it. Both its ends are in the same block, so nothing else on the
  canvas says which way a join points. Every other line crosses blocks, where the blocks already
  say it, and stays at 2px both ways.
- Selecting is not hovering. A chosen card keeps its lines whatever the pointer does; the card
  under the pointer adds its own beside them, faded. Hovering with nothing chosen is not faded.

### The wire layer, and what keeps breaking in it

`src/wires.ts` is two effects: one builds and measures the paths, the other lights them. Four
invariants hold it together, and each one has been broken at least once — read them before
touching it.

1. **One drawn path per pair of boxes, not per wire.** A storage holding 1,091 data marts has a
   wire to each, and with 25 on the page the rest all end at the same block: 1,091 wires, 26
   curves. Drawing every one meant a thousand identical strokes stacked on the same pixels, each
   with an arrowhead and an opacity transition — Chrome cannot raster that and drops tiles, which
   looks like the page going white below wherever it gave up while the cards under it still answer
   the mouse. One path carries the line; every other wire maps to it through `leads`.
2. **Map every follower, never drop it.** An earlier attempt let the first wire of a pair claim the
   line and left the rest with nothing, so a wire lit by its own ends had no line to light.
3. **Light after measuring, never before.** Which path carries a wire is only known once boxes are
   measured, and measuring runs in a `ResizeObserver` callback — after the lighting effect has
   already run. So `layout()` ends by calling `lightAgain.current()`. Without it a selection lights
   its cards and draws no lines at all.
4. **What is lit outlives the effect that lit it.** The lighting effect re-runs whenever the
   selection changes; `alight` is a ref for that reason. As a local, each run started with no
   record of what the run before it had lit and those paths kept their classes for good.

`revision` appears in both effects' dependencies and is read in neither body. It is load-bearing:
it is what rebuilds the paths when the visible set of cards changes.

## Hosting

GitHub Pages, from a public repo. `.github/workflows/pages.yml` builds `main` and publishes `dist/`
to `https://owox.github.io/data-flow/`. Keep `delivery.url` in `plugin.json` equal to that address,
and keep `base: '/data-flow/'` in `vite.config.ts` — the page sits under the repo path, not the org
root, so a bare `/` base 404s every asset.

## Develop

    npm install
    npm run typecheck
    npm run lint
    npm test               # node --test over src/owox.test.ts
    npm run build          # -> dist/

`npm test` covers the model — what the API returns turned into cards, wires and tones. The wire
layer needs a DOM and is not covered by it; the four invariants above were each found with a
throwaway Playwright harness that mounts `useWires` over a synthetic canvas, which is not in the
repo because it would add Playwright as a dependency.

There is no standalone preview: `connect()` needs the real host handshake, so test by publishing a
release to **Only me** and installing it in OWOX Data Marts.

Release with `gh release create vX.Y.Z --target main --generate-notes`; OWOX reads `plugin.json`
from the release commit, and takes versions from published, non-prerelease `MAJOR.MINOR.PATCH` tags.
Publish the plugin itself once, with `owox-ctl plugins publish OWOX/data-flow --scope member`.
