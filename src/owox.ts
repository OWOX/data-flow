// The project's data model, read out of OWOX: which sources feed which data marts, and which
// destinations those marts publish to. Read-only — `list`/`getJson`, plus one batch POST that is a
// query (`data-quality/summaries` takes ids and returns states; it changes nothing).
import type { PluginContext } from '@owox/plugin-sdk'
import type { OWOXDataMart, OWOXDestination } from '@owox/api-client'

export type DestinationType =
  | 'GOOGLE_SHEETS'
  | 'LOOKER_STUDIO'
  | 'EMAIL'
  | 'SLACK'
  | 'MS_TEAMS'
  | 'GOOGLE_CHAT'

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
  fields?: number
  quality?: QualityState
  freshness?: Freshness
}

export type Destination = { id: string; type: DestinationType | string; count: number }

export type Wire = { from: string; to: string; kind: 'source' | 'report' }

export type Model = {
  sources: Source[]
  marts: Mart[]
  destinations: Destination[]
  wires: Wire[]
}

export const sourceId = (key: string) => `src-${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
export const martId = (id: string) => `dm-${id}`
export const destId = (type: string) => `dst-${type}`

/** An endpoint outside the typed client, or one this member may not read, must not cost the page. */
async function optional<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch {
    return fallback
  }
}

type Connector = { name: string; title?: string | null; logo?: unknown }
type Report = {
  dataMart?: { id?: string } | null
  dataDestinationAccess?: { id?: string; type?: string } | null
}
type QualityRow = { dataMartId: string; summary?: { state?: QualityState } | null }

/** `fieldCount` lives on the model-canvas route, which is scoped to one storage at a time. */
async function fieldCounts(ctx: PluginContext, storageIds: string[]) {
  const counts = new Map<string, number>()
  for (const storageId of storageIds) {
    await optional(async () => {
      // ponytail: 50-page ceiling as a runaway guard; raise it if a storage ever holds more.
      let offset: number | undefined
      for (let page = 0; page < 50; page++) {
        const result = await ctx.owox.models.getDataMarts(storageId, offset)
        for (const node of result.items) counts.set(node.id, node.fieldCount)
        if (result.nextOffset === null) break
        offset = result.nextOffset
      }
    }, undefined)
  }
  return counts
}

export async function loadModel(ctx: PluginContext): Promise<Model> {
  const [dataMarts, destinations, storages] = await Promise.all([
    ctx.owox.dataMarts.list(),
    ctx.owox.destinations.list(),
    optional(() => ctx.owox.storages.list(), [] as Awaited<ReturnType<typeof ctx.owox.storages.list>>),
  ])

  const [connectors, reports, quality, fields] = await Promise.all([
    optional(() => ctx.owox.getJson<Connector[]>('/api/connectors'), []),
    optional(() => ctx.owox.getJson<Report[]>('/api/reports'), []),
    optional(
      () =>
        ctx.owox.postJson<{ items?: QualityRow[] }>('/api/data-marts/data-quality/summaries', {
          dataMartIds: dataMarts.map(m => m.id),
        }),
      {},
    ),
    fieldCounts(ctx, storages.map(s => s.id)),
  ])

  const connectorBy = new Map(connectors.map(c => [c.name, c]))
  const qualityBy = new Map((quality.items ?? []).map(row => [row.dataMartId, row.summary?.state]))

  // Connector-based marts first, as they are the ones the sources above feed.
  const marts: Mart[] = [...dataMarts]
    .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
    .map(m => ({
      id: m.id,
      title: m.title,
      kind: m.definitionType ?? null,
      draft: m.status === 'DRAFT',
      source: m.connectorSourceName,
      fields: fields.get(m.id),
      quality: qualityBy.get(m.id),
      freshness: (m.dataLastUpdated as Freshness | undefined) ?? undefined,
    }))

  const sources = new Map<string, Source>()
  for (const mart of marts) {
    if (!mart.source) continue
    const known = connectorBy.get(mart.source)
    const source = sources.get(mart.source) ?? {
      id: sourceId(mart.source),
      key: mart.source,
      name: known?.title || mart.source,
      logo: typeof known?.logo === 'string' ? known.logo : undefined,
      marts: 0,
    }
    source.marts += 1
    sources.set(mart.source, source)
  }

  // One card per destination type that actually has a destination behind it.
  const byType = new Map<string, number>()
  for (const destination of destinations as OWOXDestination[]) {
    byType.set(destination.type, (byType.get(destination.type) ?? 0) + 1)
  }

  const martIds = new Set(marts.map(m => m.id))
  const wired = new Set<string>()
  const wires: Wire[] = []
  for (const mart of marts) {
    if (mart.source && sources.has(mart.source)) {
      wires.push({ from: sourceId(mart.source), to: martId(mart.id), kind: 'source' })
    }
  }
  for (const report of reports) {
    const from = report.dataMart?.id
    const type = report.dataDestinationAccess?.type
    // Several reports commonly run the same mart into the same destination type: one line.
    if (!from || !type || !martIds.has(from) || !byType.has(type)) continue
    const key = `${from}>${type}`
    if (wired.has(key)) continue
    wired.add(key)
    wires.push({ from: martId(from), to: destId(type), kind: 'report' })
  }

  return {
    sources: [...sources.values()].sort((a, b) => b.marts - a.marts || a.name.localeCompare(b.name)),
    marts,
    destinations: [...byType].map(([type, count]) => ({ id: destId(type), type, count })),
    wires,
  }
}

const rank = (m: OWOXDataMart) => (m.definitionType === 'CONNECTOR' ? 0 : 1)
