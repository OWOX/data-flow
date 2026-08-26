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

export type Source = { key: string; name: string; logo?: string; marts: number }

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

export type DestinationType = { type: string; destinations: number }
export type Destination = { id: string; title: string; type: string; reports: number }

export type Report = {
  id: string
  title: string
  martId?: string
  martTitle?: string
  destinationId?: string
  destinationType?: string
  lastRunAt?: string
  lastRunStatus?: string
  /** Set when an active scheduled trigger refreshes this report. */
  schedule?: { cron?: string; nextRun?: string }
  columns: number
  /**
   * The report asks for aggregates or unique counts, so no columns means no dimensions.
   *
   * Without one of those, an empty `columnConfig` means every native column instead — the
   * distinction OWOX draws in `isMetricsOnlyProjection`.
   */
  metricsOnly: boolean
  /** A slice filter, applied before the join. */
  preJoin: number
  /** An output filter, applied after it — the placement OWOX leaves unset. */
  postJoin: number
  aggregations: number
}

export type Wire = {
  from: string
  to: string
  /** `dormant` is a route that exists but has never carried data: drawn only when selected. */
  kind: 'source' | 'relationship' | 'report' | 'dormant' | 'run'
}

export type Storage = { title: string; type: string; marts: number }

export type Model = {
  sources: Source[]
  marts: Mart[]
  destinationTypes: DestinationType[]
  destinations: Destination[]
  reports: Report[]
  storages: Storage[]
  wires: Wire[]
  /**
   * Source → data mart → destination → report, one chain per report.
   *
   * Selecting a card lights every chain it appears on, which is how a report reaches back up to
   * the one data mart that feeds it instead of every mart that happens to share its destination
   * type. Consecutive ids in a chain are always a real wire, in one direction or the other.
   */
  chains: string[][]
}

export const sourceId = (key: string) => `src-${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
export const martId = (id: string) => `dm-${id}`
export const destId = (id: string) => `dd-${id}`
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
  columnConfig?: unknown[]
  uniqueCountConfig?: boolean | string[] | null
  filterConfig?: Array<{ placement?: string }>
  aggregationConfig?: unknown[]
  dataMart?: { id?: string; title?: string } | null
  dataDestinationAccess?: { id?: string; title?: string; type?: string } | null
}
type QualityRow = { dataMartId: string; summary?: { state?: QualityState } | null }
type Trigger = {
  type?: string
  isActive?: boolean
  cronExpression?: string
  nextRunTimestamp?: unknown
  triggerConfig?: { reportId?: string } | null
}

/**
 * How many of a data mart's fields a report can actually ask for.
 *
 * `isHiddenForReporting` takes a column off the reporting menu, and the model-canvas `fieldCount`
 * counts the schema as it stands, hidden columns included — so a report with no column picked
 * returns this number, not that one. One call per data mart, so it is fetched only for the reports
 * on screen that need it.
 */
export async function reportableFields(ctx: PluginContext, martId: string) {
  type Field = { isHiddenForReporting?: boolean }
  const mart = await ctx.owox.getJson<{ schema?: { fields?: Field[] } }>(`/api/data-marts/${martId}`)
  // ponytail: top-level fields only; nested records count as one until someone needs the leaves.
  return (mart.schema?.fields ?? []).filter(field => !field.isHiddenForReporting).length
}

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

  const [connectors, rawReports, triggers, quality, canvas] = await Promise.all([
    optional(() => ctx.owox.getJson<Connector[]>('/api/connectors'), []),
    optional(() => ctx.owox.getJson<RawReport[]>('/api/reports'), []),
    optional(() => ctx.owox.getJson<{ triggers?: Trigger[] }>('/api/data-marts/scheduled-triggers'), {}),
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

  // One project-wide call covers every report's refresh schedule; only the live ones count.
  const scheduled = new Map<string, { cron?: string; nextRun?: string }>()
  for (const trigger of triggers.triggers ?? []) {
    const reportId = trigger.triggerConfig?.reportId
    if (trigger.type !== 'REPORT_RUN' || !trigger.isActive || !reportId) continue
    scheduled.set(reportId, {
      cron: trigger.cronExpression,
      nextRun: typeof trigger.nextRunTimestamp === 'string' ? trigger.nextRunTimestamp : undefined,
    })
  }

  const reports: Report[] = rawReports.map((report, i) => ({
    id: report.id ?? `report-${i}`,
    title: report.title ?? 'Untitled report',
    martId: report.dataMart?.id,
    martTitle: report.dataMart?.title,
    destinationId: report.dataDestinationAccess?.id,
    destinationType: report.dataDestinationAccess?.id
      ? destinationBy.get(report.dataDestinationAccess.id)?.type
      : undefined,
    lastRunAt: report.lastRunAt,
    lastRunStatus: report.lastRunStatus,
    schedule: report.id ? scheduled.get(report.id) : undefined,
    columns: report.columnConfig?.length ?? 0,
    metricsOnly:
      (report.aggregationConfig?.length ?? 0) > 0 ||
      report.uniqueCountConfig === true ||
      (Array.isArray(report.uniqueCountConfig) && report.uniqueCountConfig.length > 0),
    preJoin: report.filterConfig?.filter(rule => rule?.placement === 'pre-join').length ?? 0,
    postJoin: report.filterConfig?.filter(rule => rule?.placement !== 'pre-join').length ?? 0,
    aggregations: report.aggregationConfig?.length ?? 0,
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
  // Several reports commonly run one mart into one destination: one line, not one per report.
  //
  // A route none of them has ever run is drawn `dormant` — a Looker Studio destination nobody
  // activated, a sheet report created and left alone. It stays invisible until something on it is
  // selected, so the canvas shows the data's actual routes without losing the intended ones.
  const routes = new Map<string, boolean>()
  for (const report of reports) {
    if (!report.martId || !report.destinationId || !known.has(report.martId)) continue
    if (!destinationBy.has(report.destinationId)) continue
    const key = `${report.martId}>${report.destinationId}`
    routes.set(key, Boolean(routes.get(key)) || Boolean(report.lastRunAt))
  }
  for (const [key, live] of routes) {
    const [from, to] = key.split('>')
    wires.push({ from: martId(from), to: destId(to), kind: live ? 'report' : 'dormant' })
  }
  for (const report of reports) {
    if (report.destinationId && destinationBy.has(report.destinationId)) {
      wires.push({ from: destId(report.destinationId), to: reportId(report.id), kind: 'run' })
    }
  }

  const martBy = new Map(marts.map(m => [m.id, m]))
  const chains: string[][] = []
  for (const report of reports) {
    const mart = report.martId ? martBy.get(report.martId) : undefined
    const destination = report.destinationId ? destinationBy.get(report.destinationId) : undefined
    if (!destination) continue
    chains.push(
      [
        mart?.source && sources.has(mart.source) ? sourceId(mart.source) : undefined,
        mart ? martId(mart.id) : undefined,
        destId(destination.id),
        reportId(report.id),
      ].filter((id): id is string => Boolean(id)),
    )
  }
  // A mart with no reports still hangs off its source.
  for (const mart of marts) {
    if (mart.reports === 0 && mart.source && sources.has(mart.source)) {
      chains.push([sourceId(mart.source), martId(mart.id)])
    }
  }

  return {
    sources: [...sources.values()].sort((a, b) => b.marts - a.marts || a.name.localeCompare(b.name)),
    marts,
    destinationTypes: [...perType].map(([type, destinations]) => ({ type, destinations })),
    destinations: destinations
      .map(d => ({ id: d.id, title: d.title, type: d.type, reports: reportsPerDestination.get(d.id) ?? 0 }))
      .sort((a, b) => b.reports - a.reports || a.title.localeCompare(b.title)),
    reports: reports.sort((a, b) => (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? '')),
    storages: storageList(marts),
    wires,
    chains,
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
