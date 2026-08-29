// One check for the part that can silently go wrong: which cards exist, in what order, and which
// lines connect them. Run with `npm test` — node strips the types, so this needs no test framework.
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModel, qualityTone, recent, tone, worst } from './owox.ts'
import { reach } from './wires.ts'

const marts = [
  { id: 'm1', title: 'Facebook ads', status: 'PUBLISHED', definitionType: 'CONNECTOR', connectorSourceName: 'FacebookAds', storage: { title: 'BigQuery', type: 'GOOGLE_BIGQUERY' }, availableForReporting: true, dataLastUpdated: { dataLastUpdatedAt: '2026-08-01T00:00:00Z', coverage: 'complete' } },
  { id: 'm2', title: 'Facebook spend', status: 'DRAFT', definitionType: 'CONNECTOR', connectorSourceName: 'FacebookAds', storage: { title: 'BigQuery', type: 'GOOGLE_BIGQUERY' } },
  { id: 'm3', title: 'Blend', status: 'PUBLISHED', definitionType: 'SQL', storage: { title: 'Athena', type: 'AWS_ATHENA' } },
]

const ctx = (over: Record<string, unknown> = {}) => {
  const owox = {
    destinations: {
      list: async () => [
        { id: 'd1', title: 'Sheet A', type: 'GOOGLE_SHEETS' },
        { id: 'd2', title: 'Sheet B', type: 'GOOGLE_SHEETS' },
        { id: 'd3', title: 'Looker', type: 'LOOKER_STUDIO' },
      ],
    },
    storages: {
      list: async () => [
        { id: 's1', title: 'BQ', type: 'GOOGLE_BIGQUERY', availableForUse: true, availableForMaintenance: false, publishedDataMartsCount: 2, draftDataMartsCount: 0 },
        // No counts at all: unknown is not empty, so it is still walked.
        { id: 's2', title: 'Athena', type: 'AWS_ATHENA', availableForUse: false, availableForMaintenance: false },
        // Counted, and holding nothing — two round trips this never has to make.
        { id: 's3', title: 'Empty', type: 'SNOWFLAKE', availableForUse: true, availableForMaintenance: true, publishedDataMartsCount: 0, draftDataMartsCount: 0 },
      ],
    },
    models: {
      // The only place a mart's storage is stated: its own record names a title, and titles repeat.
      getDataMarts: async (storageId: string) =>
        storageId === 's1'
          ? { items: [{ id: 'm1', fieldCount: 42 }, { id: 'm2', fieldCount: 7 }], total: 2, nextOffset: null }
          : { items: [{ id: 'm3', fieldCount: 3 }], total: 1, nextOffset: null },
      // m3 joins m1: m1 gains an inbound relationship, m3 an outbound one. Both storages report
      // it, as a cross-storage join would, and it must still draw one line.
      getEdges: async () => [{ id: 'e1', sourceDataMartId: 'm3', targetDataMartId: 'm1', joinConditions: [] }],
    },
    getJson: async (path: string) =>
      // The mart list is paged here rather than by the SDK, for the `total` page one carries.
      path === '/api/data-marts'
        ? { items: marts, total: marts.length, nextOffset: null }
        : path === '/api/connectors'
        ? [{ name: 'FacebookAds', title: 'Facebook Ads' }]
        : path === '/api/data-marts/scheduled-triggers'
        ? {
            triggers: [
              { type: 'REPORT_RUN', isActive: true, cronExpression: '0 6 * * *', triggerConfig: { reportId: 'r1' } },
              // Paused, and a connector refresh: neither marks a report.
              { type: 'REPORT_RUN', isActive: false, triggerConfig: { reportId: 'r2' } },
              { type: 'CONNECTOR_RUN', isActive: true, triggerConfig: {} },
            ],
          }
        : [
            // Two reports, same mart, same destination type — one line, not two.
            {
              id: 'r1',
              title: 'Daily',
              lastRunAt: '2026-08-02T00:00:00Z',
              lastRunStatus: 'SUCCESS',
              dataMart: { id: 'm1', title: 'Facebook ads' },
              dataDestinationAccess: { id: 'd1', type: 'GOOGLE_SHEETS' },
              columnConfig: ['date', 'spend', 'clicks'],
              // An unset placement is an output filter, which is how OWOX writes the common case.
              filterConfig: [{ placement: 'pre-join' }, { placement: 'post-join' }, {}],
              aggregationConfig: [{ column: 'spend', function: 'SUM' }],
            },
            { id: 'r2', title: 'Weekly', lastRunAt: '2026-08-03T00:00:00Z', lastRunStatus: 'ERROR', dataMart: { id: 'm1', title: 'Facebook ads' }, dataDestinationAccess: { id: 'd2', type: 'GOOGLE_SHEETS' } },
            { id: 'r3', title: 'Blend export', lastRunAt: '2026-08-01T00:00:00Z', lastRunStatus: 'SUCCESS', dataMart: { id: 'm3' }, dataDestinationAccess: { id: 'd3', type: 'LOOKER_STUDIO' } },
            // A report on a mart this member cannot list must not invent a card.
            { id: 'r4', title: 'Ghost', dataMart: { id: 'gone' }, dataDestinationAccess: { id: 'd3', type: 'LOOKER_STUDIO' } },
            // Created but never run — a Looker destination nobody activated. No line from m2.
            { id: 'r5', title: 'Never run', dataMart: { id: 'm2' }, dataDestinationAccess: { id: 'd3', type: 'LOOKER_STUDIO' } },
          ],
    postJson: async () => ({ items: [{ dataMartId: 'm1', summary: { state: 'PASSED' } }] }),
    ...over,
  }
  return { owox } as never
}

test('the whole graph: cards, order, badges and lines', async () => {
  const model = await loadModel(ctx())

  assert.deepEqual(model.sources.map(s => [s.name, s.marts]), [['Facebook Ads', 2]])

  // Published before draft, connector before the rest, then most-joined-into first.
  assert.deepEqual(model.marts.map(m => m.id), ['m1', 'm3', 'm2'])
  assert.equal(model.marts[0].fields, 42)
  assert.equal(model.marts[0].inbound, 1)
  assert.equal(model.marts[0].reports, 2)
  // PASSED quality, but a report that last ran with an error still marks the mart.
  assert.equal(model.marts[0].quality?.state, 'PASSED')
  // Sharing is off unless OWOX says otherwise: a missing flag is not a shared data mart.
  assert.deepEqual(
    [model.marts[0].sharedForReporting, model.marts[0].sharedForMaintenance],
    [true, false],
  )
  assert.equal(model.marts[0].errors, true)
  assert.equal(model.marts[1].outbound, 1)
  assert.equal(model.marts[2].draft, true)
  assert.deepEqual(
    model.storages.map(s => [s.id, s.title, s.marts, s.sharedForUse]),
    [
      ['s1', 'BQ', 2, true],
      ['s2', 'Athena', 1, false],
      ['s3', 'Empty', 0, true],
    ],
  )

  assert.deepEqual(model.destinationTypes.map(d => [d.type, d.destinations]), [['GOOGLE_SHEETS', 2], ['LOOKER_STUDIO', 1]])
  // Looker counts two: a report whose data mart this member cannot see still writes to it.
  assert.deepEqual(model.destinations.map(d => [d.title, d.reports]), [['Looker', 3], ['Sheet A', 1], ['Sheet B', 1]])
  // A Looker report carries its data mart, which the page shows in place of its own name.
  const looker = model.reports.find(r => r.id === 'r3')
  assert.equal(looker?.destinationType, 'LOOKER_STUDIO')

  const daily = model.reports.find(r => r.id === 'r1')
  assert.deepEqual([daily?.columns, daily?.preJoin, daily?.postJoin, daily?.aggregations], [3, 1, 2, 1])
  // No columnConfig: the report returns every column, so there is no count to badge.
  assert.equal(looker?.columns, 0)

  // Both report triggers are counted; the connector one belongs to no report.
  assert.deepEqual(model.reports.find(r => r.id === 'r1')?.schedule, {
    total: 1,
    active: 1,
    cron: '0 6 * * *',
    nextRun: undefined,
  })
  // A paused trigger still counts as added, but leaves nothing to say about the next refresh.
  assert.deepEqual(model.reports.find(r => r.id === 'r2')?.schedule, { total: 1, active: 0 })

  // Most recently run first.
  assert.deepEqual(model.reports.map(r => r.id), ['r2', 'r1', 'r3', 'r4', 'r5'])

  assert.deepEqual(model.wires, [
    // Marts are walked in card order — m1, m3, m2 — so the lines fall in that order too.
    { from: 'src-facebookads', to: 'st-s1', kind: 'source' },
    { from: 'st-s1', to: 'dm-m1', kind: 'held' },
    { from: 'st-s2', to: 'dm-m3', kind: 'held' },
    { from: 'st-s1', to: 'dm-m2', kind: 'held' },
    { from: 'dm-m3', to: 'dm-m1', kind: 'relationship' },
    { from: 'dm-m1', to: 'dd-d1', kind: 'report' },
    { from: 'dm-m1', to: 'dd-d2', kind: 'report' },
    { from: 'dm-m3', to: 'dd-d3', kind: 'report' },
    // m2's only report has never run: the route is drawn, but stays hidden until it is selected.
    { from: 'dm-m2', to: 'dd-d3', kind: 'dormant' },
    { from: 'dd-d1', to: 'rp-r1', kind: 'run' },
    { from: 'dd-d2', to: 'rp-r2', kind: 'run' },
    { from: 'dd-d3', to: 'rp-r3', kind: 'run' },
    { from: 'dd-d3', to: 'rp-r4', kind: 'run' },
    { from: 'dd-d3', to: 'rp-r5', kind: 'run' },
  ])

  // A report reaches back to the one data mart that feeds it, and on to its source.
  assert.deepEqual(
    model.chains.filter(chain => chain.includes('rp-r1')),
    // The chain runs through the storage the mart lives in.
    [['src-facebookads', 'st-s1', 'dm-m1', 'dd-d1', 'rp-r1']],
  )
})

test('an endpoint the member cannot read costs only its own detail', async () => {
  const model = await loadModel(
    ctx({
      // The mart list is the page: it is not wrapped in `optional()`, and losing it is an error
      // rather than a thinner canvas. Every read that IS optional refuses here.
      getJson: async (path: string) => {
        if (path === '/api/data-marts') return { items: marts, total: marts.length, nextOffset: null }
        throw new Error('403')
      },
      postJson: async () => {
        throw new Error('403')
      },
      models: {
        getDataMarts: async () => {
          throw new Error('403')
        },
        getEdges: async () => {
          throw new Error('403')
        },
      },
    }),
  )

  assert.equal(model.marts.length, 3)
  assert.equal(model.marts[0].fields, undefined)
  assert.equal(model.marts[0].quality, undefined)
  assert.equal(model.reports.length, 0)
  // No /api/connectors: the raw connector name still names the source.
  assert.deepEqual(model.sources.map(s => s.name), ['FacebookAds'])
  // Joins, routes and runs all come from endpoints that failed. What is left is the way in: m3's
  // "Athena" names exactly one storage so it is placed by title and type, while m1 and m2 say
  // "BigQuery", which matches none — those two hang off the Storages block instead of nothing, and
  // the source that fills them reaches it.
  assert.deepEqual(model.wires.map(w => w.kind), ['source', 'held', 'held', 'held'])
  assert.deepEqual(
    model.wires.filter(w => w.kind === 'held').map(w => [w.from, w.to]),
    [['storages-block', 'dm-m1'], ['st-s2', 'dm-m3'], ['storages-block', 'dm-m2']],
  )
  assert.deepEqual(
    model.marts.map(m => [m.id, m.storageId]),
    [['m1', undefined], ['m3', 's2'], ['m2', undefined]],
  )
})



// The one rule every card's colour goes through, so a change to it cannot pass unnoticed.
test('tone reads a set of run statuses the way the host does', () => {
  assert.equal(tone([]), 'idle')
  assert.equal(tone([undefined, undefined]), 'idle')
  assert.equal(tone(['SUCCESS']), 'ok')
  assert.equal(tone(['SUCCESS', 'SUCCESS']), 'ok')
  assert.equal(tone(['FAILED']), 'bad')
  assert.equal(tone(['ERROR']), 'bad')
  assert.equal(tone(['SUCCESS', 'FAILED']), 'warn')
  assert.equal(tone(['RUNNING']), 'progress')
  assert.equal(tone(['PENDING', 'RUNNING']), 'progress')
  // A run still going abstains: what has settled decides, and the rest is not evidence yet.
  assert.equal(tone(['SUCCESS', 'RUNNING']), 'ok')
  assert.equal(tone(['FAILED', 'RUNNING']), 'bad')
  assert.equal(tone(['SUCCESS', 'FAILED', 'RUNNING']), 'warn')
  // A status nobody models is not a claim of health.
  assert.equal(tone(['CANCELLED']), 'warn')
})

// Worst wins, and a signal that has never run is not a verdict either way.
test('worst outranks by severity and ignores idle', () => {
  assert.equal(worst([]), 'idle')
  assert.equal(worst(['idle', 'idle']), 'idle')
  // One failure carries the whole set: a source whose other connectors are fine is still red.
  assert.equal(worst(['ok', 'ok', 'bad']), 'bad')
  assert.equal(worst(['ok', 'warn']), 'warn')
  assert.equal(worst(['ok', 'progress']), 'progress')
  assert.equal(worst(['warn', 'progress']), 'warn')
  // Silence never drags a healthy card down, nor lifts a failing one.
  assert.equal(worst(['idle', 'ok']), 'ok')
  assert.equal(worst(['idle', 'bad']), 'bad')
  // The Sessions case: the run went fine, the data did not. Two signals only — staleness reaches
  // this through the quality summary's own `data_freshness` check, not as a third opinion.
  assert.equal(worst([tone(['SUCCESS']), qualityTone('warn')]), 'warn')
  assert.equal(worst([tone(['SUCCESS']), qualityTone('notice')]), 'warn')
  assert.equal(worst([tone(['SUCCESS']), qualityTone('bad')]), 'bad')
  assert.equal(worst([tone(['SUCCESS']), qualityTone('ok')]), 'ok')
  // Quality that has never run says nothing, so the run status stands alone.
  assert.equal(worst([tone(['SUCCESS']), qualityTone('idle')]), 'ok')
  assert.equal(worst([tone(['FAILED']), qualityTone('idle')]), 'bad')
})

test('a report whose destination is invisible is reached through the block', async () => {
  const model = await loadModel(
    ctx({
      getJson: async (path: string) =>
        path === '/api/data-marts'
          ? { items: marts, total: marts.length, nextOffset: null }
          : path === '/api/connectors'
            ? [{ name: 'FacebookAds', title: 'Facebook Ads' }]
            : path === '/api/data-marts/scheduled-triggers'
              ? {}
              : [
                  // Its destination is real to OWOX and unreadable here, which used to take the
                  // source, the storage and the mart down with it.
                  { id: 'r9', title: 'Orphan', dataMart: { id: 'm1' }, dataDestinationAccess: { id: 'hidden' } },
                ],
    }),
  )

  // The destination is real to OWOX and unreadable here, so the block stands where it would be:
  // the mart writes into one of them, and one of them runs the report.
  assert.deepEqual(
    model.wires.filter(w => w.to === 'rp-r9'),
    [{ from: 'destinations-block', to: 'rp-r9', kind: 'run' }],
  )
  assert.deepEqual(
    model.wires.filter(w => w.from === 'dm-m1').map(w => [w.to, w.kind]),
    [['destinations-block', 'dormant']],
  )
  // Selecting the source still reaches the report, across the gap where the destination would be.
  const { lit } = reach(model.wires, model.chains, 'src-facebookads')
  assert.equal(lit.has('rp-r9'), true)
  assert.equal(lit.has('dm-m1'), true)
  assert.equal(lit.has('st-s1'), true)
})

// One window, one meaning: a run the host would have forgotten is forgotten here too.
test('a run outside the window stops counting', () => {
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
  assert.equal(recent(ago(1)), true)
  assert.equal(recent(ago(29)), true)
  assert.equal(recent(ago(31)), false)
  assert.equal(recent(ago(394)), false)
  assert.equal(recent(undefined), false)
  assert.equal(recent(null), false)
  // A destination whose only failure is a year old is untested, not failing.
  assert.equal(tone([recent(ago(394)) ? 'FAILED' : undefined]), 'idle')
  assert.equal(tone([recent(ago(2)) ? 'FAILED' : undefined]), 'bad')
})
