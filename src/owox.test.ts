// One check for the part that can silently go wrong: which cards exist, in what order, and which
// lines connect them. Run with `npm test` — node strips the types, so this needs no test framework.
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModel } from './owox.ts'

const ctx = (over: Record<string, unknown> = {}) => {
  const marts = [
    { id: 'm1', title: 'Facebook ads', status: 'PUBLISHED', definitionType: 'CONNECTOR', connectorSourceName: 'FacebookAds', storage: { title: 'BigQuery', type: 'GOOGLE_BIGQUERY' }, dataLastUpdated: { dataLastUpdatedAt: '2026-08-01T00:00:00Z', coverage: 'complete' } },
    { id: 'm2', title: 'Facebook spend', status: 'DRAFT', definitionType: 'CONNECTOR', connectorSourceName: 'FacebookAds', storage: { title: 'BigQuery', type: 'GOOGLE_BIGQUERY' } },
    { id: 'm3', title: 'Blend', status: 'PUBLISHED', definitionType: 'SQL', storage: { title: 'Athena', type: 'AWS_ATHENA' } },
  ]
  const owox = {
    dataMarts: { list: async () => marts },
    destinations: {
      list: async () => [
        { id: 'd1', title: 'Sheet A', type: 'GOOGLE_SHEETS' },
        { id: 'd2', title: 'Sheet B', type: 'GOOGLE_SHEETS' },
        { id: 'd3', title: 'Looker', type: 'LOOKER_STUDIO' },
      ],
    },
    storages: { list: async () => [{ id: 's1', title: 'BQ', type: 'GOOGLE_BIGQUERY' }] },
    models: {
      getDataMarts: async () => ({ items: [{ id: 'm1', fieldCount: 42 }], total: 1, nextOffset: null }),
      // m3 joins m1: m1 gains an inbound relationship, m3 an outbound one.
      getEdges: async () => [{ id: 'e1', sourceDataMartId: 'm3', targetDataMartId: 'm1', joinConditions: [] }],
    },
    getJson: async (path: string) =>
      path === '/api/connectors'
        ? [{ name: 'FacebookAds', title: 'Facebook Ads' }]
        : [
            // Two reports, same mart, same destination type — one line, not two.
            { id: 'r1', title: 'Daily', lastRunAt: '2026-08-02T00:00:00Z', lastRunStatus: 'SUCCESS', dataMart: { id: 'm1', title: 'Facebook ads' }, dataDestinationAccess: { id: 'd1', type: 'GOOGLE_SHEETS' } },
            { id: 'r2', title: 'Weekly', lastRunAt: '2026-08-03T00:00:00Z', lastRunStatus: 'ERROR', dataMart: { id: 'm1', title: 'Facebook ads' }, dataDestinationAccess: { id: 'd2', type: 'GOOGLE_SHEETS' } },
            { id: 'r3', title: 'Blend export', lastRunAt: '2026-08-01T00:00:00Z', lastRunStatus: 'SUCCESS', dataMart: { id: 'm3' }, dataDestinationAccess: { id: 'd3', type: 'LOOKER_STUDIO' } },
            // A report on a mart this member cannot list must not invent a card.
            { id: 'r4', title: 'Ghost', dataMart: { id: 'gone' }, dataDestinationAccess: { id: 'd3', type: 'LOOKER_STUDIO' } },
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
  assert.equal(model.marts[0].errors, true)
  assert.equal(model.marts[1].outbound, 1)
  assert.equal(model.marts[2].draft, true)
  assert.deepEqual(
    model.storages.map(s => [s.title, s.type, s.marts]),
    [
      ['BigQuery', 'GOOGLE_BIGQUERY', 2],
      ['Athena', 'AWS_ATHENA', 1],
    ],
  )

  assert.deepEqual(model.destinationTypes.map(d => [d.type, d.destinations]), [['GOOGLE_SHEETS', 2], ['LOOKER_STUDIO', 1]])
  // Looker counts two: a report whose data mart this member cannot see still writes to it.
  assert.deepEqual(model.destinations.map(d => [d.title, d.reports]), [['Looker', 2], ['Sheet A', 1], ['Sheet B', 1]])
  // Most recently run first.
  assert.deepEqual(model.reports.map(r => r.id), ['r2', 'r1', 'r3', 'r4'])

  assert.deepEqual(model.wires, [
    { from: 'src-facebookads', to: 'dm-m1', kind: 'source' },
    { from: 'src-facebookads', to: 'dm-m2', kind: 'source' },
    { from: 'dm-m3', to: 'dm-m1', kind: 'relationship' },
    { from: 'dm-m1', to: 'dt-GOOGLE_SHEETS', kind: 'report' },
    { from: 'dm-m3', to: 'dt-LOOKER_STUDIO', kind: 'report' },
    { from: 'dd-d1', to: 'dt-GOOGLE_SHEETS', kind: 'type' },
    { from: 'dd-d2', to: 'dt-GOOGLE_SHEETS', kind: 'type' },
    { from: 'dd-d3', to: 'dt-LOOKER_STUDIO', kind: 'type' },
    { from: 'dd-d1', to: 'rp-r1', kind: 'run' },
    { from: 'dd-d2', to: 'rp-r2', kind: 'run' },
    { from: 'dd-d3', to: 'rp-r3', kind: 'run' },
    { from: 'dd-d3', to: 'rp-r4', kind: 'run' },
  ])
})

test('an endpoint the member cannot read costs only its own detail', async () => {
  const model = await loadModel(
    ctx({
      getJson: async () => {
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
  // Source lines and the destination-to-type lines survive; joins and reports do not.
  assert.deepEqual(model.wires.map(w => w.kind), ['source', 'source', 'type', 'type', 'type'])
})
