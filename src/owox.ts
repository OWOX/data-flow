// The project's data model, read out of OWOX: which sources feed which data marts, how those marts
// join to each other, and which destinations and reports they end up in.
//
// Read-only — `list`/`getJson`, plus one batch POST that is a query (`data-quality/summaries` takes
// ids and returns states; it changes nothing).
import type { PluginContext } from '@owox/plugin-sdk'
import type { OWOXDataMart } from '@owox/api-client'

export type QualityState =
  | 'NEVER_RUN'
  | 'QUEUED'
  | 'RUNNING'
  | 'PASSED'
  | 'ISSUES'
  | 'EXECUTION_FAILED'
  | 'RESTRICTED'
  | 'CANCELLED'
  | 'ALL_DISABLED'

type Freshness = { dataLastUpdatedAt?: string | null; coverage?: 'complete' | 'partial' | 'unavailable' }

export type Source = { id: string; key: string; name: string; logo?: string; marts: number }

export type Mart = {
  id: string
  title: string
  kind: OWOXDataMart['definitionType']
  draft: boolean
  source?: string
  storage: string
  storageType: string
  fields?: number
  quality?: QualityState
  freshness?: Freshness
  inbound: number
  outbound: number
  reports: number
  errors: boolean
}

export type DestinationType = { id: string; type: string; destinations: number }
export type Destination = { id: string; title: string; type: string; reports: number }

export type Report = {
  id: string
  title: string
  martId?: string
  martTitle?: string
  destinationId?: string
  lastRunAt?: string
  lastRunStatus?: string
}

export type Wire = { from: string; to: string; kind: 'source' | 'relationship' | 'report' | 'type' | 'run' }

export type Storage = { title: string; type: string; marts: number }

export type Model = {
  sources: Source[]
  marts: Mart[]
  destinationTypes: DestinationType[]
  destinations: Destination[]
  reports: Report[]
  storages: Storage[]
  wires: Wire[]
}

export const sourceId = (key: string) => `src-${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
export const martId = (id: string) => `dm-${id}`
export const destId = (id: string) => `dd-${id}`
export const typeId = (type: string) => `dt-${type}`
export const reportId = (id: string) => `rp-${id}`

/** An endpoint outside the typed client, or one this member may not read, must not cost the page. */
async function optional<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch {
    return fallback
  }
}

type Connector = { name: string; title?: string | null; logo?: unknown }
type RawReport = {
  id?: string
  title?: string
  lastRunAt?: string
  lastRunStatus?: string
  dataMart?: { id?: string; title?: string } | null
  dataDestinationAccess?: { id?: string; title?: string; type?: string } | null
}
type QualityRow = { dataMartId: string; summary?: { state?: QualityState } | null }

/** Field counts and join edges are both scoped to one storage at a time by the model-canvas route. */
async function perStorage(ctx: PluginContext, storageIds: string[]) {
  const fields = new Map<string, number>()
  const edges: Array<{ from: string; to: string }> = []

  for (const storageId of storageIds) {
    await optional(async () => {
      // ponytail: 50-page ceiling as a runaway guard; raise it if a storage ever holds more.
      let offset: number | undefined
      for (let page = 0; page < 50; page++) {
        const result = await ctx.owox.models.getDataMarts(storageId, offset)
        for (const node of result.items) fields.set(node.id, node.fieldCount)
        if (result.nextOffset === null) break
        offset = result.nextOffset
      }
    }, undefined)
    await optional(async () => {
      for (const edge of await ctx.owox.models.getEdges(storageId)) {
        edges.push({ from: edge.sourceDataMartId, to: edge.targetDataMartId })
      }
    }, undefined)
  }
  return { fields, edges }
}

export async function loadModel(ctx: PluginContext): Promise<Model> {
  const [dataMarts, destinations, storages] = await Promise.all([
    ctx.owox.dataMarts.list(),
    ctx.owox.destinations.list(),
    optional(() => ctx.owox.storages.list(), [] as Awaited<ReturnType<typeof ctx.owox.storages.list>>),
  ])

  const [connectors, rawReports, quality, canvas] = await Promise.all([
    optional(() => ctx.owox.getJson<Connector[]>('/api/connectors'), []),
    optional(() => ctx.owox.getJson<RawReport[]>('/api/reports'), []),
    optional(
      () =>
        ctx.owox.postJson<{ items?: QualityRow[] }>('/api/data-marts/data-quality/summaries', {
          dataMartIds: dataMarts.map(m => m.id),
        }),
      {},
    ),
    perStorage(ctx, storages.map(s => s.id)),
  ])

  const connectorBy = new Map(connectors.map(c => [c.name, c]))
  const qualityBy = new Map((quality.items ?? []).map(row => [row.dataMartId, row.summary?.state]))
  const known = new Set(dataMarts.map(m => m.id))
  const destinationBy = new Map(destinations.map(d => [d.id, d]))

  const edges = canvas.edges.filter(e => known.has(e.from) && known.has(e.to) && e.from !== e.to)
  const inbound = tally(edges.map(e => e.to))
  const outbound = tally(edges.map(e => e.from))

  const reports: Report[] = rawReports.map((report, i) => ({
    id: report.id ?? `report-${i}`,
    title: report.title ?? 'Untitled report',
    martId: report.dataMart?.id,
    martTitle: report.dataMart?.title,
    destinationId: report.dataDestinationAccess?.id,
    lastRunAt: report.lastRunAt,
    lastRunStatus: report.lastRunStatus,
  }))
  const reportsPerMart = tally(reports.map(r => r.martId))
  const reportsPerDestination = tally(reports.map(r => r.destinationId))
  const failingMarts = new Set(reports.filter(r => r.lastRunStatus === 'ERROR').map(r => r.martId))

  const marts: Mart[] = dataMarts
    .map(m => {
      const state = qualityBy.get(m.id)
      return {
        id: m.id,
        title: m.title,
        kind: m.definitionType ?? null,
        draft: m.status === 'DRAFT',
        source: m.connectorSourceName,
        storage: m.storage?.title ?? 'Unknown storage',
        storageType: m.storage?.type ?? 'UNKNOWN',
        fields: canvas.fields.get(m.id),
        quality: state,
        freshness: (m.dataLastUpdated as Freshness | undefined) ?? undefined,
        inbound: inbound.get(m.id) ?? 0,
        outbound: outbound.get(m.id) ?? 0,
        reports: reportsPerMart.get(m.id) ?? 0,
        errors: state === 'ISSUES' || state === 'EXECUTION_FAILED' || failingMarts.has(m.id),
      }
    })
    .sort(order)

  const sources = new Map<string, Source>()
  for (const mart of marts) {
    if (!mart.source) continue
    const connector = connectorBy.get(mart.source)
    const source = sources.get(mart.source) ?? {
      id: sourceId(mart.source),
      key: mart.source,
      name: connector?.title || mart.source,
      logo: typeof connector?.logo === 'string' ? connector.logo : undefined,
      marts: 0,
    }
    source.marts += 1
    sources.set(mart.source, source)
  }

  // One card per destination type that actually has a destination behind it.
  const perType = tally(destinations.map(d => d.type))

  const wires: Wire[] = []
  for (const mart of marts) {
    if (mart.source && sources.has(mart.source)) {
      wires.push({ from: sourceId(mart.source), to: martId(mart.id), kind: 'source' })
    }
  }
  for (const edge of edges) {
    wires.push({ from: martId(edge.from), to: martId(edge.to), kind: 'relationship' })
  }
  // Several reports commonly run one mart into one destination type: one line, not one per report.
  const seen = new Set<string>()
  for (const report of reports) {
    const type = report.destinationId ? destinationBy.get(report.destinationId)?.type : undefined
    if (!report.martId || !type || !known.has(report.martId)) continue
    const key = `${report.martId}>${type}`
    if (seen.has(key)) continue
    seen.add(key)
    wires.push({ from: martId(report.martId), to: typeId(type), kind: 'report' })
  }
  for (const destination of destinations) {
    wires.push({ from: destId(destination.id), to: typeId(destination.type), kind: 'type' })
  }
  for (const report of reports) {
    if (report.destinationId && destinationBy.has(report.destinationId)) {
      wires.push({ from: destId(report.destinationId), to: reportId(report.id), kind: 'run' })
    }
  }

  return {
    sources: [...sources.values()].sort((a, b) => b.marts - a.marts || a.name.localeCompare(b.name)),
    marts,
    destinationTypes: [...perType].map(([type, count]) => ({ id: typeId(type), type, destinations: count })),
    destinations: destinations
      .map(d => ({ id: d.id, title: d.title, type: d.type, reports: reportsPerDestination.get(d.id) ?? 0 }))
      .sort((a, b) => b.reports - a.reports || a.title.localeCompare(b.title)),
    reports: reports.sort((a, b) => (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? '')),
    storages: storageList(marts),
    wires,
  }
}

/**
 * Published before draft, connector-based before the rest, then the marts other things depend on:
 * most joined-into first, then most joining-out, then most reported-on, then everything else.
 */
function order(a: Mart, b: Mart) {
  return (
    Number(a.draft) - Number(b.draft) ||
    Number(a.kind !== 'CONNECTOR') - Number(b.kind !== 'CONNECTOR') ||
    b.inbound - a.inbound ||
    b.outbound - a.outbound ||
    b.reports - a.reports ||
    a.title.localeCompare(b.title)
  )
}

/** One row per storage the visible marts live in, with the type its icon comes from. */
function storageList(marts: Mart[]): Storage[] {
  const storages = new Map<string, Storage>()
  for (const mart of marts) {
    const storage = storages.get(mart.storage) ?? { title: mart.storage, type: mart.storageType, marts: 0 }
    storage.marts += 1
    storages.set(mart.storage, storage)
  }
  return [...storages.values()].sort((a, b) => b.marts - a.marts || a.title.localeCompare(b.title))
}

function tally(keys: Array<string | undefined>) {
  const counts = new Map<string, number>()
  for (const key of keys) if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  return counts
}
