// One check for the part that can silently go wrong: which cards exist and which lines connect
// them. Run with `npm test` — node strips the types, so this needs no test framework.
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModel } from './owox.ts'

const ctx = (over: Record<string, unknown> = {}) => {
  const marts = [
    { id: 'm1', title: 'Facebook ads', status: 'PUBLISHED', definitionType: 'CONNECTOR', connectorSourceName: 'FacebookAds', dataLastUpdated: { dataLastUpdatedAt: '2026-08-01T00:00:00Z', coverage: 'complete' } },
    { id: 'm2', title: 'Facebook spend', status: 'DRAFT', definitionType: 'CONNECTOR', connectorSourceName: 'FacebookAds' },
    { id: 'm3', title: 'Blend', status: 'PUBLISHED', definitionType: 'SQL' },
  ]
  const owox = {
    dataMarts: { list: async () => marts },
    destinations: { list: async () => [
      { id: 'd1', title: 'Sheet A', type: 'GOOGLE_SHEETS' },
      { id: 'd2', title: 'Sheet B', type: 'GOOGLE_SHEETS' },
      { id: 'd3', title: 'Looker', type: 'LOOKER_STUDIO' },
    ] },
    storages: { list: async () => [{ id: 's1', title: 'BQ', type: 'GOOGLE_BIGQUERY' }] },
    models: { getDataMarts: async () => ({ items: [{ id: 'm1', fieldCount: 42 }], total: 1, nextOffset: null }) },
    getJson: async (path: string) =>
      path === '/api/connectors'
        ? [{ name: 'FacebookAds', title: 'Facebook Ads' }]
        : [
            // Two reports, same mart, same destination type — one line, not two.
            { dataMart: { id: 'm1' }, dataDestinationAccess: { id: 'd1', type: 'GOOGLE_SHEETS' } },
            { dataMart: { id: 'm1' }, dataDestinationAccess: { id: 'd2', type: 'GOOGLE_SHEETS' } },
            { dataMart: { id: 'm3' }, dataDestinationAccess: { id: 'd3', type: 'LOOKER_STUDIO' } },
            // A report on a mart this member cannot list must not invent a card.
            { dataMart: { id: 'gone' }, dataDestinationAccess: { id: 'd3', type: 'LOOKER_STUDIO' } },
          ],
    postJson: async () => ({ items: [{ dataMartId: 'm1', summary: { state: 'ISSUES' } }] }),
    ...over,
  }
  return { owox } as never
}

test('sources, marts and destination types with the lines between them', async () => {
  const model = await loadModel(ctx())

  assert.deepEqual(
    model.sources.map(s => [s.name, s.marts]),
    [['Facebook Ads', 2]],
  )
  // Connector marts first, then the rest.
  assert.deepEqual(model.marts.map(m => m.id), ['m1', 'm2', 'm3'])
  assert.equal(model.marts[0].fields, 42)
  assert.equal(model.marts[0].quality, 'ISSUES')
  assert.equal(model.marts[1].draft, true)
  assert.deepEqual(model.destinations.map(d => [d.type, d.count]), [['GOOGLE_SHEETS', 2], ['LOOKER_STUDIO', 1]])

  assert.deepEqual(model.wires, [
    { from: 'src-facebookads', to: 'dm-m1', kind: 'source' },
    { from: 'src-facebookads', to: 'dm-m2', kind: 'source' },
    { from: 'dm-m1', to: 'dst-GOOGLE_SHEETS', kind: 'report' },
    { from: 'dm-m3', to: 'dst-LOOKER_STUDIO', kind: 'report' },
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
      },
    }),
  )

  assert.equal(model.marts.length, 3)
  assert.equal(model.marts[0].fields, undefined)
  assert.equal(model.marts[0].quality, undefined)
  // No /api/connectors: the raw connector name still names the source.
  assert.deepEqual(model.sources.map(s => s.name), ['FacebookAds'])
  // No /api/reports: the source lines survive, the report lines do not.
  assert.deepEqual(model.wires.map(w => w.kind), ['source', 'source'])
})
