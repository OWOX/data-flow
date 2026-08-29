// The project's data model, read out of OWOX: which sources feed which data marts, how those marts
// join to each other, and which destinations and reports they end up in.
//
// Read-only on open — `list`/`getJson`, plus two batch POSTs that are queries
// (`data-quality/summaries` and `health-status` each take ids and return states). `recheck` below
// is the one exception, and only a button press reaches it.
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

/** As much of OWOX's compact summary as its own status icon reads. */
export type QualitySummary = {
  state: QualityState
  totalChecks?: number
  passedChecks?: number
  notApplicableChecks?: number
  noticeFindings?: number
  warningFindings?: number
  errorFindings?: number
  highestSeverity?: 'notice' | 'warning' | 'error' | null
}

/** What the host's own Data Last Updated tooltip reads, passed through as it arrives. */
type Freshness = {
  dataLastUpdatedAt?: string | null
  coverage?: 'complete' | 'partial' | 'unavailable'
  computedAt?: string | null
  sources?: Array<{ table: string; dataLastUpdatedAt?: string | null; note?: string | null }>
}

/**
 * The colour a card carries, in the vocabulary the status icons already speak.
 *
 * `idle` is "nothing has run", which stays grey rather than claiming health either way.
 */
export type Tone = 'ok' | 'notice' | 'warn' | 'bad' | 'progress' | 'idle'

/**
 * OWOX's own rule for the dot on its Data Marts list, applied to any set of run statuses.
 *
 * All succeeded is green, all failed red, a mix amber, still-going blue, nothing at all grey. One
 * function for every card: a data mart reads its three latest runs, a report its own last one, a
 * destination the reports that write to it, a source the marts it feeds.
 */
/**
 * Worst wins, and `idle` is not a verdict.
 *
 * A signal nothing has run yet carries no information, so it never outranks one that has and never
 * drags a healthy card down; a card is only grey when every signal on it is silent.
 */
const RANK: Record<Tone, number> = { idle: 0, ok: 1, notice: 2, progress: 3, warn: 4, bad: 5 }

export const worst = (tones: Tone[]): Tone =>
  tones.reduce<Tone>((carried, next) => (RANK[next] > RANK[carried] ? next : carried), 'idle')

/** A border is painted in four colours and a grey, so a notice reads as what it is: an issue. */
export const qualityTone = (t: Tone): Tone => (t === 'notice' ? 'warn' : t)

/**
 * How far back a run still counts, in days.
 *
 * The host applies its own cutoff to data marts and sources server-side — `health-status` simply
 * does not return runs older than it, and its own wording says thirty days. Reports and the
 * destinations they feed arrive with no cutoff at all, so the same one is applied here, from the
 * `lastRunAt` that comes in the same payload as the status. One number, one meaning, no extra
 * request. If OWOX ever states a different figure, this is the only place to change.
 */
export const RECENT_DAYS = 30

/** Whether a run is recent enough to count. A run that never happened never is. */
export const recent = (at?: string | null) =>
  at !== undefined && at !== null && Date.now() - Date.parse(at) <= RECENT_DAYS * 86_400_000

export function tone(statuses: Array<string | undefined>): Tone {
  const seen = new Set(statuses.filter(Boolean))
  if (seen.size === 0) return 'idle'
  const ok = seen.has('SUCCESS')
  const bad = seen.has('FAILED') || seen.has('ERROR')
  const going = seen.has('PENDING') || seen.has('RUNNING')
  // A run still going is not evidence yet, so it abstains rather than muddying the verdict. The
  // host applies this rule to three runs at a time; a destination gathers one per report, and with
  // twenty of them something is nearly always in flight — which would leave it amber for good.
  if (!ok && !bad) return going ? 'progress' : 'warn'
  if (ok && bad) return 'warn'
  return bad ? 'bad' : 'ok'
}

export type Source = { key: string; name: string; logo?: string; marts: number; tone: Tone }

export type Mart = {
  id: string
  title: string
  kind: OWOXDataMart['definitionType']
  draft: boolean
  source?: string
  storage: string
  storageType: string
  /** The storage that holds it. Two storages can share a title, so the id is what wires it. */
  storageId?: string
  fields?: number
  quality?: QualitySummary
  freshness?: Freshness
  triggers: number
  /** Every project member can see it and report on it. */
  sharedForReporting: boolean
  /** Technical users who do not own it can edit it and manage its triggers. */
  sharedForMaintenance: boolean
  inbound: number
  outbound: number
  reports: number
  errors: boolean
  people: Party[]
}

/**
 * Someone a thing records: who made it, or who owns it.
 *
 * The API guarantees only the id, so the name falls back through the email and then to nothing
 * worth printing, and the avatar is a URL that may not be there at all.
 */
export type Person = { id: string; name: string; avatar?: string }
/** One role and everyone holding it. A role nobody holds is dropped rather than shown empty. */
export type Party = { role: string; who: Person[] }

type RawUser = { userId?: string; fullName?: string | null; email?: string | null; avatar?: string | null }
type RawOwned = {
  createdByUser?: RawUser | null
  ownerUsers?: RawUser[]
  businessOwnerUsers?: RawUser[]
  technicalOwnerUsers?: RawUser[]
}

const person = (raw: RawUser): Person => ({
  id: raw.userId ?? '',
  name: raw.fullName || raw.email || 'Unnamed user',
  avatar: raw.avatar ?? undefined,
})

/**
 * Who a thing belongs to, in the order a reader wants it: whoever made it, then whoever owns it.
 *
 * Every list the page already reads carries these — a data mart names business and technical
 * owners separately, a storage, destination and report name one set — so none of this costs a
 * request.
 */
function owners(raw: unknown): Party[] {
  const held = (raw ?? {}) as RawOwned
  const roles: Array<[string, RawUser[] | undefined]> = [
    ['Created by', held.createdByUser ? [held.createdByUser] : undefined],
    ['Owners', held.ownerUsers],
    ['Business owners', held.businessOwnerUsers],
    ['Technical owners', held.technicalOwnerUsers],
  ]
  return roles
    .filter(([, who]) => who?.length)
    .map(([role, who]) => ({ role, who: who!.map(person) }))
}

export type DestinationType = { type: string; destinations: number }
export type Destination = {
  id: string
  title: string
  type: string
  reports: number
  tone: Tone
  /** Every project member can write to it. */
  sharedForUse: boolean
  /** Technical users who do not own it can maintain it. */
  sharedForMaintenance: boolean
  people: Party[]
}

export type Report = {
  id: string
  title: string
  martId?: string
  martTitle?: string
  destinationId?: string
  destinationType?: string
  lastRunAt?: string
  lastRunStatus?: string
  /** The scheduled triggers on this report, and how many of them are switched on. */
  schedule?: { total: number; active: number; cron?: string; nextRun?: string }
  columns: number
  /** A slice filter, applied before the join. */
  preJoin: number
  /** An output filter, applied after it — the placement OWOX leaves unset. */
  postJoin: number
  aggregations: number
  tone: Tone
  people: Party[]
}

export type Wire = {
  from: string
  to: string
  /** `dormant` is a route that exists but has never carried data: drawn only when selected. */
  kind: 'source' | 'held' | 'relationship' | 'report' | 'dormant' | 'run' | 'exit'
}

export type Storage = {
  id: string
  title: string
  type: string
  marts: number
  /** Every project member can build on it. */
  sharedForUse: boolean
  /** Technical users who do not own it can maintain it. */
  sharedForMaintenance: boolean
  people: Party[]
}

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

/**
 * The blocks, as ends of a line.
 *
 * A member cannot always see every storage or destination in their own project, and a link through
 * one they cannot see is still a link. Rather than drop it, or draw a shortcut that claims the two
 * ends meet directly, the line runs to the block that would have held the missing card — the same
 * way the exits reach every data mart at once.
 */
export const STORAGES_BLOCK = 'storages-block'
export const MARTS_BLOCK = 'marts-block'
export const DESTINATIONS_BLOCK = 'destinations-block'

/**
 * What each kind of card's id begins with, and the only place that is written down.
 *
 * The page used to read an id back by testing a prefix and cutting three characters off, ten times
 * over. Three is right for four of these and wrong for the other two, so the idiom read as general
 * and was not — a source id cut that way loses a character and matches nothing, silently.
 */
const PREFIX = { source: 'src-', storage: 'st-', mart: 'dm-', destination: 'dd-', report: 'rp-' } as const
type Kind = keyof typeof PREFIX

export const sourceId = (key: string) =>
  `${PREFIX.source}${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
export const storeId = (id: string) => `${PREFIX.storage}${id}`
export const martId = (id: string) => `${PREFIX.mart}${id}`
export const destId = (id: string) => `${PREFIX.destination}${id}`
export const reportId = (id: string) => `${PREFIX.report}${id}`

/** The thing's own id back out of a card id, or null when that card is not of this kind. */
export const idOf = (kind: Kind, cardId: string | null | undefined) =>
  cardId?.startsWith(PREFIX[kind]) ? cardId.slice(PREFIX[kind].length) : null

/** Whether a card id names this kind of thing. */
export const isKind = (kind: Kind, cardId: string | null | undefined) =>
  cardId?.startsWith(PREFIX[kind]) === true

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
  filterConfig?: Array<{ placement?: string }>
  aggregationConfig?: unknown[]
  dataMart?: { id?: string; title?: string } | null
  dataDestinationAccess?: { id?: string; title?: string; type?: string } | null
}
type RawStorage = {
  id: string
  title: string
  type: string
  publishedDataMartsCount?: number
  draftDataMartsCount?: number
  availableForUse?: boolean
  availableForMaintenance?: boolean
}
type QualityRow = { dataMartId: string; summary?: QualitySummary | null }
/**
 * The latest connector run per mart.
 *
 * The endpoint also returns the latest report and insight run. Nothing reads them: a mart's colour
 * is its data quality, and a source's is the connectors that pull for it.
 */
type HealthRow = { dataMartId: string; connector?: { status?: string } | null }
type Trigger = {
  type?: string
  isActive?: boolean
  cronExpression?: string
  nextRunTimestamp?: unknown
  triggerConfig?: { reportId?: string } | null
}

/**
 * The data mart list, paged here rather than by the SDK.
 *
 * `/api/data-marts` is the one list in the API that says how many there are — page one carries
 * `total` — and the SDK's own `list()` unwraps to a bare array, dropping it. Paging it here means
 * the badge can show the real count from the first page, and the bar can fill as the rest arrive
 * instead of jumping when the last one does.
 */
async function listMarts(ctx: PluginContext, report: (loaded: number, total: number, pages: number) => void) {
  const items: OWOXDataMart[] = []
  let offset: number | undefined
  let pages = 0
  for (;;) {
    const page = await ctx.owox.getJson<{ items?: OWOXDataMart[]; total?: number; nextOffset?: number | null }>(
      '/api/data-marts',
      offset === undefined ? undefined : { offset: String(offset) },
    )
    items.push(...(page.items ?? []))
    report(items.length, page.total ?? items.length, (pages += 1))
    // `nextOffset` is the API's own end-of-list signal, so no page ceiling has to stand in for it.
    if (page.nextOffset === null || page.nextOffset === undefined) return items
    offset = page.nextOffset
  }
}

/** Field counts and join edges are both scoped to one storage at a time by the model-canvas route. */
async function perStorage(
  ctx: PluginContext,
  storageIds: string[],
  report: (walked: number) => void = () => {},
) {
  const fields = new Map<string, number>()
  /** Which storage holds which mart — the mart's own record names only a title, and titles repeat. */
  const holder = new Map<string, string>()
  const edges: Array<{ from: string; to: string }> = []
  const seenEdges = new Set<string>()
  let walked = 0

  const walk = async (storageId: string) => {
    await optional(async () => {
      // This route reports its own `total`, so the loop stops on a number the API gave rather than
      // on a ceiling picked here — and cannot run away if `nextOffset` ever fails to end.
      let offset: number | undefined
      let seen = 0
      let total = Infinity
      while (seen < total) {
        const result = await ctx.owox.models.getDataMarts(storageId, offset)
        for (const node of result.items) {
          fields.set(node.id, node.fieldCount)
          holder.set(node.id, storageId)
        }
        seen += result.items.length
        total = result.total
        if (result.nextOffset === null || result.items.length === 0) break
        offset = result.nextOffset
      }
    }, undefined)
    await optional(async () => {
      for (const edge of await ctx.owox.models.getEdges(storageId)) {
        // One join, one line: a relationship reachable from two storages must not be counted twice,
        // or the marts at its ends each gain a phantom neighbour.
        const key = `${edge.sourceDataMartId}>${edge.targetDataMartId}`
        if (seenEdges.has(key)) continue
        seenEdges.add(key)
        edges.push({ from: edge.sourceDataMartId, to: edge.targetDataMartId })
      }
    }, undefined)
    report((walked += 1))
  }

  /**
   * A few storages at a time, rather than one after another.
   *
   * This route is scoped to one storage — `storageId` is required — so it costs two round trips per
   * storage however little that storage holds, and a project with sixty of them spent two minutes
   * asking sixty times in a row. Six at once hides the latency without asking the host for sixty.
   */
  const queue = [...storageIds]
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) await walk(id)
  }
  await Promise.all(Array.from({ length: Math.min(6, storageIds.length) }, worker))

  return { fields, holder, edges }
}

/**
 * What the page knows before it knows everything.
 *
 * The blocks are on screen from the first paint, so a read that lands with a count hands it
 * straight to that block's badge — the page fills in rather than appearing all at once.
 */
export type Progress = {
  done: number
  total: number
  counts: { sources?: number; storages?: number; marts?: number; destinations?: number; reports?: number }
}

/**
 * The reads that cost one request each: destinations, storages, connectors, reports, triggers,
 * and the two batch queries. The other two cost as many as the project makes them cost, so the
 * bar counts requests rather than reads — one read in nine was claiming a ninth of the bar while
 * doing most of the work.
 */
const PLAIN_READS = 7

/**
 * The two checks the host runs from its own Actions menu, over every mart on the page.
 *
 * These are the only calls here that write: each starts real jobs that query the warehouse, so
 * nothing runs them but a person pressing the button. Quality settles asynchronously — the marts
 * come back QUEUED, then RUNNING — so the page re-reads itself until they stop moving.
 */
export async function recheck(ctx: PluginContext, ids: string[]) {
  if (ids.length === 0) return
  const [quality, freshness] = await Promise.allSettled([
    ctx.owox.postJson('/api/data-marts/data-quality/runs/batch', { dataMartIds: ids }),
    ctx.owox.postJson('/api/data-marts/data-last-updated/refresh', { ids }),
  ])
  // One check may be refused while the other is allowed; say so rather than failing both silently.
  const refused = [
    quality.status === 'rejected' ? 'quality' : '',
    freshness.status === 'rejected' ? 'freshness' : '',
  ].filter(Boolean)
  if (refused.length === 2) throw new Error('Could not start either check')
  if (refused.length === 1) throw new Error(`Could not start the ${refused[0]} check`)
}

/** A mart whose quality run has not finished, which is why the page keeps looking. */
export const settling = (model: Model) =>
  model.marts.some(m => m.quality?.state === 'QUEUED' || m.quality?.state === 'RUNNING')

export async function loadModel(ctx: PluginContext, onProgress?: (p: Progress) => void): Promise<Model> {
  let done = 0
  /** What the two paged reads will cost, known only once they have started. */
  const weight = { marts: 1, storages: 1 }
  const counts: Progress['counts'] = {}
  let shown = 0
  const emit = () => {
    const total = PLAIN_READS + weight.marts + weight.storages
    // The weights only sharpen as the project reveals itself, and a bar that goes backwards is
    // worse than one that pauses, so it never recedes.
    shown = Math.max(shown, Math.min(done / total, 1))
    onProgress?.({ done: shown, total: 1, counts: { ...counts } })
  }
  /** Report a read the moment it lands, rather than when the batch it rides in finishes. */
  const track = <T,>(work: Promise<T>, tally?: (value: T) => Partial<Progress['counts']>) =>
    work.then(value => {
      done += 1
      Object.assign(counts, tally?.(value))
      emit()
      return value
    })

  const [dataMarts, destinations, storages] = await Promise.all([
    // The count comes from page one; the bar fills as the pages after it arrive.
    track(
      listMarts(ctx, (loaded, total, pages) => {
        counts.marts = total
        // Every page is a request, and after the first one we know how many there will be.
        weight.marts = Math.max(1, Math.ceil(total / Math.max(loaded / pages, 1)))
        done += 1
        emit()
      }),
    ),
    track(ctx.owox.destinations.list(), d => ({ destinations: d.length })),
    track(
      optional(() => ctx.owox.storages.list(), [] as Awaited<ReturnType<typeof ctx.owox.storages.list>>),
      st => ({ storages: st.length }),
    ),
  ])

  /**
   * Storages worth asking about.
   *
   * This route costs two round trips per storage whatever it holds, and the storage list already
   * says how many data marts each has — so an empty one is two requests that return two empty
   * lists. A mart in a storage skipped here still finds it by title and type.
   */
  const walkable = (storages as RawStorage[])
    .filter(storage => {
      // Only a count that is actually there can rule a storage out. A host that does not send one
      // gets asked, because "unknown" is not "empty".
      const counted =
        storage.publishedDataMartsCount !== undefined || storage.draftDataMartsCount !== undefined
      return (
        !counted || (storage.publishedDataMartsCount ?? 0) + (storage.draftDataMartsCount ?? 0) > 0
      )
    })
    .map(storage => storage.id)
  weight.storages = Math.max(1, walkable.length)

  const [connectors, rawReports, triggers, quality, health, canvas] = await Promise.all([
    track(optional(() => ctx.owox.getJson<Connector[]>('/api/connectors'), []), c => ({ sources: c.length })),
    track(optional(() => ctx.owox.getJson<RawReport[]>('/api/reports'), []), r => ({ reports: r.length })),
    track(optional(() => ctx.owox.getJson<{ triggers?: Trigger[] }>('/api/data-marts/scheduled-triggers'), {})),
    track(
      optional(
        () =>
          ctx.owox.postJson<{ items?: QualityRow[] }>('/api/data-marts/data-quality/summaries', {
            dataMartIds: dataMarts.map(m => m.id),
          }),
        {},
      ),
    ),
    // One batch POST covers every mart's run health — the same call, and the same rule, behind
    // the red/green dot on OWOX's own Data Marts list.
    track(
      optional(
        () =>
          ctx.owox.postJson<{ items?: HealthRow[] }>('/api/data-marts/health-status', {
            ids: dataMarts.map(m => m.id),
          }),
        {},
      ),
    ),
    perStorage(ctx, walkable, walked => {
      done += 1
      if (walked === walkable.length) done += 1
      emit()
    }),
  ])

  const connectorRunBy = new Map((health.items ?? []).map(row => [row.dataMartId, row.connector?.status]))

  const connectorBy = new Map(connectors.map(c => [c.name, c]))
  const qualityBy = new Map((quality.items ?? []).map(row => [row.dataMartId, row.summary ?? undefined]))
  const known = new Set(dataMarts.map(m => m.id))
  const destinationBy = new Map(destinations.map(d => [d.id, d]))

  const edges = canvas.edges.filter(e => known.has(e.from) && known.has(e.to) && e.from !== e.to)
  const inbound = tally(edges.map(e => e.to))
  const outbound = tally(edges.map(e => e.from))

  // One project-wide call covers every report's refresh schedule.
  const scheduled = new Map<string, { total: number; active: number; cron?: string; nextRun?: string }>()
  for (const trigger of triggers.triggers ?? []) {
    const reportId = trigger.triggerConfig?.reportId
    if (trigger.type !== 'REPORT_RUN' || !reportId) continue
    const entry = scheduled.get(reportId) ?? { total: 0, active: 0 }
    entry.total += 1
    if (trigger.isActive) {
      entry.active += 1
      // The cron shown is a live one: a paused trigger says nothing about when the report refreshes.
      entry.cron ??= trigger.cronExpression
      entry.nextRun ??= typeof trigger.nextRunTimestamp === 'string' ? trigger.nextRunTimestamp : undefined
    }
    scheduled.set(reportId, entry)
  }

  const reports: Report[] = rawReports.map((report, i) => ({
    people: owners(report),
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
    preJoin: report.filterConfig?.filter(rule => rule?.placement === 'pre-join').length ?? 0,
    postJoin: report.filterConfig?.filter(rule => rule?.placement !== 'pre-join').length ?? 0,
    aggregations: report.aggregationConfig?.length ?? 0,
    tone: recent(report.lastRunAt) ? tone([report.lastRunStatus]) : 'idle',
  }))
  const reportsPerMart = tally(reports.map(r => r.martId))
  const reportsPerDestination = tally(reports.map(r => r.destinationId))
  const failingMarts = new Set(reports.filter(r => r.lastRunStatus === 'ERROR').map(r => r.martId))

  const place = placeMarts(storages as RawStorage[], canvas.holder)
  const marts: Mart[] = dataMarts
    .map(m => {
      const state = qualityBy.get(m.id)?.state
      return {
        id: m.id,
        title: m.title,
        kind: m.definitionType ?? null,
        draft: m.status === 'DRAFT',
        source: m.connectorSourceName,
        storage: m.storage?.title ?? 'Unknown storage',
        storageType: m.storage?.type ?? 'UNKNOWN',
        storageId: place(m),
        fields: canvas.fields.get(m.id),
        quality: qualityBy.get(m.id),
        freshness: (m.dataLastUpdated as Freshness | undefined) ?? undefined,
        triggers: m.triggersCount ?? 0,
        sharedForReporting: m.availableForReporting === true,
        sharedForMaintenance: m.availableForMaintenance === true,
        people: owners(m),
        inbound: inbound.get(m.id) ?? 0,
        outbound: outbound.get(m.id) ?? 0,
        reports: reportsPerMart.get(m.id) ?? 0,
        errors: state === 'ISSUES' || state === 'EXECUTION_FAILED' || failingMarts.has(m.id),
      }
    })
    .sort(order)

  const sources = new Map<string, Source>()
  /**
   * A source is as healthy as the connectors that pull from it.
   *
   * Only the connector run of each mart it feeds counts — a report failing downstream says nothing
   * about the source — and the worst of them wins outright: one failed pull is a failed source.
   */
  const sourceRuns = new Map<string, Tone[]>()
  for (const mart of marts) {
    if (!mart.source) continue
    const connector = connectorBy.get(mart.source)
    const source = sources.get(mart.source) ?? {
      key: mart.source,
      name: connector?.title || mart.source,
      logo: typeof connector?.logo === 'string' ? connector.logo : undefined,
      marts: 0,
      tone: 'idle' as Tone,
    }
    source.marts += 1
    sources.set(mart.source, source)
    sourceRuns.set(mart.source, [...(sourceRuns.get(mart.source) ?? []), tone([connectorRunBy.get(mart.id)])])
  }
  for (const [key, source] of sources) source.tone = worst(sourceRuns.get(key) ?? [])

  // One card per destination type that actually has a destination behind it.
  const perType = tally(destinations.map(d => d.type))

  // A destination is as healthy as the reports that write to it.
  const destinationRuns = new Map<string, Array<string | undefined>>()
  for (const report of reports) {
    if (!report.destinationId) continue
    destinationRuns.set(report.destinationId, [
      ...(destinationRuns.get(report.destinationId) ?? []),
      // A run outside the window says nothing, the way one the host has forgotten says nothing.
      recent(report.lastRunAt) ? report.lastRunStatus : undefined,
    ])
  }

  const storageList_ = storageList(storages as RawStorage[], marts)
  const wires = drawWires(marts, sources, destinationBy, edges, reports)
  const chains = traceChains(marts, sources, destinationBy, reports)

  return {
    sources: [...sources.values()].sort((a, b) => b.marts - a.marts || a.name.localeCompare(b.name)),
    marts,
    destinationTypes: [...perType].map(([type, destinations]) => ({ type, destinations })),
    destinations: destinations
      .map(d => ({
        id: d.id,
        title: d.title,
        type: d.type,
        reports: reportsPerDestination.get(d.id) ?? 0,
        tone: tone(destinationRuns.get(d.id) ?? []),
        sharedForUse: d.availableForUse === true,
        sharedForMaintenance: d.availableForMaintenance === true,
        people: owners(d),
      }))
      .sort((a, b) => b.reports - a.reports || a.title.localeCompare(b.title)),
    reports: reports.sort((a, b) => (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? '')),
    storages: storageList_,
    wires,
    chains,
  }
}


type Destinations = Map<string, { id: string; type: string }>

/** Every line on the canvas, and what each one means. */
function drawWires(
  marts: Mart[],
  sources: Map<string, Source>,
  destinationBy: Destinations,
  edges: Array<{ from: string; to: string }>,
  reports: Report[],
): Wire[] {
  const known = new Set(marts.map(m => m.id))
  const wires: Wire[] = []
  // A source lands in a storage, and the storage holds the mart. One line per source/storage pair
  // rather than one per mart: a connector feeding forty marts into one storage is one arrow.
  const landed = new Set<string>()
  for (const mart of marts) {
    // Where the storage cannot be seen, the block stands for it: the mart is in one of them.
    const holder = mart.storageId ? storeId(mart.storageId) : STORAGES_BLOCK
    if (mart.source && sources.has(mart.source)) {
      const key = `${mart.source}>${holder}`
      if (!landed.has(key)) {
        landed.add(key)
        wires.push({ from: sourceId(mart.source), to: holder, kind: 'source' })
      }
    }
    wires.push({ from: holder, to: martId(mart.id), kind: 'held' })
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
    if (!report.martId || !known.has(report.martId)) continue
    // Where the destination cannot be seen, the block stands for it: it writes to one of them.
    const into =
      report.destinationId && destinationBy.has(report.destinationId)
        ? destId(report.destinationId)
        : DESTINATIONS_BLOCK
    const key = `${report.martId}>${into}`
    routes.set(key, Boolean(routes.get(key)) || Boolean(report.lastRunAt))
  }
  for (const [key, live] of routes) {
    const [from, to] = key.split('>')
    wires.push({ from: martId(from), to, kind: live ? 'report' : 'dormant' })
  }
  for (const report of reports) {
    if (report.destinationId && destinationBy.has(report.destinationId)) {
      wires.push({ from: destId(report.destinationId), to: reportId(report.id), kind: 'run' })
    } else {
      wires.push({ from: DESTINATIONS_BLOCK, to: reportId(report.id), kind: 'run' })
    }
  }

  return wires
}

/**
 * Source → data mart → destination → report, one chain per report, plus the marts that have none.
 *
 * This is what lets a selected report reach back to the one data mart that feeds it, rather than to
 * every mart that happens to share its destination.
 */
function traceChains(
  marts: Mart[],
  sources: Map<string, Source>,
  destinationBy: Destinations,
  reports: Report[],
): string[][] {
  const martBy = new Map(marts.map(m => [m.id, m]))
  const chains: string[][] = []
  for (const report of reports) {
    const mart = report.martId ? martBy.get(report.martId) : undefined
    const destination = report.destinationId ? destinationBy.get(report.destinationId) : undefined
    // A destination this member cannot see used to drop the whole chain — the source, the storage
    // and the mart with it, all of which are known. The report reads that mart whatever happens
    // downstream, so the chain keeps everything up to it and leaves out only the missing link.
    if (!destination && !mart) continue
    chains.push(
      [
        mart?.source && sources.has(mart.source) ? sourceId(mart.source) : undefined,
        // A block stands where a card cannot be seen, so the chain runs through it unbroken.
        mart ? (mart.storageId ? storeId(mart.storageId) : STORAGES_BLOCK) : undefined,
        mart ? martId(mart.id) : undefined,
        destination ? destId(destination.id) : mart ? DESTINATIONS_BLOCK : undefined,
        reportId(report.id),
      ].filter((id): id is string => Boolean(id)),
    )
  }
  // A mart with no reports still hangs off its source.
  for (const mart of marts) {
    if (mart.reports > 0) continue
    const chain = [
      mart.source && sources.has(mart.source) ? sourceId(mart.source) : undefined,
      mart.storageId ? storeId(mart.storageId) : STORAGES_BLOCK,
      martId(mart.id),
    ].filter((id): id is string => Boolean(id))
    if (chain.length > 1) chains.push(chain)
  }

  return chains
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
/**
 * Which storage holds a mart, from the best evidence there is.
 *
 * A mart's own record names only `{type, title}` today — verified against the published spec,
 * where both are required and there is no id — so the mapping has to be found rather than read:
 *
 *  1. `storage.id`, for the day OWOX starts sending it. Costs nothing until then, and the moment
 *     it arrives it wins, needing no change here.
 *  2. The per-storage walk, which is the only place the mapping is stated today. Authoritative,
 *     but a member who cannot read that route loses every mart's storage with it.
 *  3. Title and type, when that pair names exactly one storage. Ambiguous pairs are left unplaced
 *     rather than guessed at: this project has two storages both called "Google BigQuery", and
 *     putting a mart in the wrong one draws a line that is simply false.
 */
function placeMarts(raw: RawStorage[], walked: Map<string, string>) {
  const seen = new Map<string, string | null>()
  for (const storage of raw) {
    const key = `${storage.type}|${storage.title}`
    seen.set(key, seen.has(key) ? null : storage.id)
  }
  return (mart: OWOXDataMart) =>
    (mart.storage as { id?: string } | undefined)?.id ??
    walked.get(mart.id) ??
    seen.get(`${mart.storage?.type}|${mart.storage?.title}`) ??
    undefined
}

/**
 * One card per storage the project has, counting the marts this member can actually see.
 *
 * Built from the storage endpoint rather than inferred from the marts: it is the only place the
 * ids, the sharing flags and the empty storages exist. Two storages may carry the same title.
 */
function storageList(raw: RawStorage[], marts: Mart[]): Storage[] {
  const held = tally(marts.map(mart => mart.storageId))
  return raw
    .map(storage => ({
      id: storage.id,
      title: storage.title,
      type: storage.type,
      marts: held.get(storage.id) ?? 0,
      sharedForUse: storage.availableForUse === true,
      sharedForMaintenance: storage.availableForMaintenance === true,
      people: owners(storage),
    }))
    .sort((a, b) => b.marts - a.marts || a.title.localeCompare(b.title))
}

function tally(keys: Array<string | undefined>) {
  const counts = new Map<string, number>()
  for (const key of keys) if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  return counts
}
