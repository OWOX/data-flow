import { connect, type PluginContext } from '@owox/plugin-sdk'
import {
  ArchiveRestore,
  Box,
  CalendarClock,
  Columns3,
  Database,
  FileText,
  Filter,
  KeyRound,
  Layers,
  Plug,
  RefreshCw,
  Sigma,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AddCard, Logo, MartCard, MoreCard, NodeCard, RunIcon, type CardState } from './cards'
import { ago, count, reportName, scheduleLabel } from './format'
import { Block, MultiSelect, SearchBox } from './controls'
import { DESTINATION, EXIT, STORAGE, type Mark } from './icons'
import {
  destId,
  loadModel,
  recheck,
  reportId,
  settling,
  sourceId,
  storeId,
  type Destination,
  type Mart,
  type Model,
  type Report,
  type Progress,
  type Source,
  type Storage,
  type Wire,
} from './owox'
import { useReorder, type Cards } from './reorder'
import { reach, useWires } from './wires'

/** How many cards are on screen before the rest wait behind the block's "load more". */
const PAGE = 25

/**
 * The attribute filter, in facets.
 *
 * Options inside one facet are alternatives — "Draft" or "Published" — so they widen the result.
 * Facets narrow it: choosing Draft and With reports asks for both.
 */
/**
 * One attribute filter, in facets.
 *
 * Options inside one facet are alternatives, so they widen the result; facets narrow it. A facet
 * with nothing ticked asks for nothing and gets nothing. Three tables follow this shape, so the
 * rule is written once and handed each of them.
 */
type Flag<T> = { key: string; facet: string; label: string; test: (item: T) => boolean }

const facetFilter = <T,>(flags: Array<Flag<T>>) => {
  const facets = [...new Set(flags.map(flag => flag.facet))]
  return (chosen: string[]) => {
    const picked = flags.filter(flag => chosen.includes(flag.key))
    return (item: T) => facets.every(facet => picked.some(flag => flag.facet === facet && flag.test(item)))
  }
}

const FLAGS: Array<Flag<Mart>> = [
  { key: 'rel', facet: 'relationships', label: 'With relationship', test: m => m.inbound + m.outbound > 0 },
  { key: 'no-rel', facet: 'relationships', label: 'Without relationship', test: m => m.inbound + m.outbound === 0 },
  { key: 'published', facet: 'status', label: 'Published', test: m => !m.draft },
  { key: 'draft', facet: 'status', label: 'Draft', test: m => m.draft },
  { key: 'reports', facet: 'reports', label: 'With reports', test: m => m.reports > 0 },
  { key: 'no-reports', facet: 'reports', label: 'Without reports', test: m => m.reports === 0 },
  { key: 'triggers', facet: 'triggers', label: 'With triggers', test: m => m.triggers > 0 },
  { key: 'no-triggers', facet: 'triggers', label: 'Without triggers', test: m => m.triggers === 0 },
  { key: 'errors', facet: 'errors', label: 'With errors', test: m => m.errors },
  { key: 'no-errors', facet: 'errors', label: 'Without errors', test: m => !m.errors },
  // OWOX's own words for these two: a mart everyone can report on, and one other technical users
  // may maintain. They are independent of each other, so each gets its own facet.
  { key: 'reporting', facet: 'reporting', label: 'Shared for reporting', test: m => m.sharedForReporting },
  { key: 'no-reporting', facet: 'reporting', label: 'Not shared for reporting', test: m => !m.sharedForReporting },
  {
    key: 'maintenance',
    facet: 'maintenance',
    label: 'Shared for maintenance',
    test: m => m.sharedForMaintenance,
  },
  {
    key: 'no-maintenance',
    facet: 'maintenance',
    label: 'Not shared for maintenance',
    test: m => !m.sharedForMaintenance,
  },
]

/**
 * Ways out of OWOX that no endpoint lists. Selectable like any card; only the link opens.
 *
 * `type` puts them under the same filter as the real destinations, so picking Google Sheets hides
 * them the way it hides a Slack destination.
 */
const EXITS: Array<{ id: string; type: string; icon: Mark; title: string; note: string; to: string }> = [
  {
    id: 'x-claude',
    type: 'AI',
    icon: EXIT.CLAUDE,
    title: 'Claude',
    note: 'OWOX Data Marts connector',
    to: 'https://claude.ai/directory/owox-data-marts',
  },
  {
    id: 'x-chatgpt',
    type: 'AI',
    icon: EXIT.CHATGPT,
    title: 'ChatGPT',
    note: 'OWOX Data Marts app',
    to: 'https://chatgpt.com/plugins/plugin_asdk_app_6a3e81be8f8481918e1e2cd1d7ea09c4',
  },
  { id: 'x-api', type: 'API', icon: KeyRound, title: 'API', note: 'Read the marts over HTTP', to: '' },
]

/** The filter rows behind those cards: no endpoint counts them, so they count themselves. */
const EXIT_TYPES = [
  { type: 'AI', label: 'AI', icon: Sparkles },
  { type: 'API', label: 'API', icon: KeyRound },
].map(row => ({ ...row, destinations: EXITS.filter(exit => exit.type === row.type).length }))


/**
 * The Data Marts block itself, as one end of a wire.
 *
 * An exit reads every data mart in the project, so drawing it a line per card would be fifty lines
 * saying one thing. It gets one line to the block, and the block takes a border.
 */
const MARTS = 'marts-block'
/**
 * Each block's own id, and the card ids it holds.
 *
 * A folded block still holds its cards, so `holds` is what lets a line end at the block instead of
 * vanishing: the canvas keeps its shape when detail is put away.
 */
const BANDS = {
  sources: { id: 'sources-block', holds: 'src-' },
  storages: { id: 'storages-block', holds: 'st-' },
  marts: { id: MARTS, holds: 'dm-' },
  destinations: { id: 'destinations-block', holds: 'dd-,x-' },
  reports: { id: 'reports-block', holds: 'rp-' },
}
const EXIT_WIRES: Wire[] = EXITS.map(exit => ({ from: exit.id, to: MARTS, kind: 'exit' }))

/**
 * The Storage block's filter.
 *
 * Type is the one thing a storage is, and sharing is the one thing it grants — OWOX's own words:
 * a storage everyone may build on, and one other technical users may maintain.
 */
const STORAGE_FLAGS: Array<Flag<Storage>> = [
  { key: 'use', facet: 'sharing', label: 'Shared for use', test: s => s.sharedForUse },
  { key: 'no-use', facet: 'sharing', label: 'Not shared for use', test: s => !s.sharedForUse },
  { key: 'maint', facet: 'maintenance', label: 'Shared for maintenance', test: s => s.sharedForMaintenance },
  { key: 'no-maint', facet: 'maintenance', label: 'Not shared for maintenance', test: s => !s.sharedForMaintenance },
]

/** The Reports block's own filter: the one thing about a report that is not on its card's face. */
const REPORT_FLAGS: Array<Flag<Report>> = [
  { key: 'triggers', facet: 'triggers', label: 'With triggers', test: report => (report.schedule?.total ?? 0) > 0 },
  { key: 'no-triggers', facet: 'triggers', label: 'Without triggers', test: report => !report.schedule?.total },
]

const martPasses = facetFilter(FLAGS)
const storagePasses = facetFilter(STORAGE_FLAGS)
const reportPasses = facetFilter(REPORT_FLAGS)

/** Everything the four blocks read. Canvas works it out; each block takes the whole thing. */
type Page = {
  ctx: PluginContext
  model: Model
  sourceCards: Cards<Source>
  storages: Storage[]
  storagesMatching: number
  moreStorages: () => void
  resetStorages: () => void
  storageCards: Cards<Storage>
  storageTypes: string[]
  setStorageTypes: (value: string[]) => void
  storageFlags: string[]
  setStorageFlags: (value: string[]) => void
  folded: Set<string>
  onFold: (block: string) => void
  band: (block: keyof typeof BANDS) => Record<string, unknown>
  storageScopeTitle?: string
  marts: Mart[]
  martCards: Cards<Mart>
  martSearch: string
  setMartSearch: (value: string) => void
  flags: string[]
  setFlags: (value: string[]) => void
  limit: number
  setLimit: (value: number) => void
  destinations: Destination[]
  destinationCards: Cards<Destination>
  exitCards: Cards<(typeof EXITS)[number]>
  types: string[]
  setTypes: (value: string[]) => void
  reports: Report[]
  reportCards: Cards<Report>
  selectedTitle?: string
  reportSearch: string
  setReportSearch: (value: string) => void
  reportFlags: string[]
  setReportFlags: (value: string[]) => void
  reportLimit: number
  setReportLimit: (value: number) => void
  state: CardState
  pending: Progress | null
  /** Runs both host checks over every mart, then re-reads until quality stops moving. */
  onRecheck: () => void
  checking: boolean
}

/**
 * How far the read has got, or `null` once it is done.
 *
 * Every block unfolds together because every card needs the wires, and the wires need the last
 * read: a block showing cards while another still cannot draw its lines would be a page that
 * looks finished and is not.
 */
const reading = (pending: Progress | null) => (pending ? pending.done / pending.total : null)

/** The shape of a project nothing has been read from yet, so the blocks can be drawn at once. */
const NOTHING_YET: Model = {
  sources: [],
  marts: [],
  destinationTypes: [],
  destinations: [],
  reports: [],
  storages: [],
  wires: [],
  chains: [],
}

export default function App() {
  const [ctx, setCtx] = useState<PluginContext | null>(null)
  const [model, setModel] = useState<Model | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Starts at nothing read rather than at `null`.
   *
   * A null progress means "not loading", which folds nothing — so the first paint drew the grids,
   * and an empty project's grid still holds the three exit cards and the "new" cards, which are
   * constants rather than anything read. They appeared before the destinations they sit beside.
   */
  const [progress, setProgress] = useState<Progress | null>({ done: 0, total: 1, counts: {} })
  const [checking, setChecking] = useState(false)
  const [folded, setFolded] = useState(true)

  useEffect(() => {
    let live = true
    connect()
      .then(async host => {
        document.documentElement.classList.toggle('dark', host.theme === 'dark')
        if (live) setCtx(host)
        const loaded = await loadModel(host, p => live && setProgress(p))
        if (!live) return
        setModel(loaded)
        // The bar turns green the moment it fills. Unfolding on that same frame would make the
        // colour a thing nobody sees, so the blocks open just after it.
        setTimeout(() => live && setFolded(false), 450)
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [])

  /**
   * Ask the host to check everything, then watch it happen.
   *
   * A quality run is queued, not answered, so one re-read would only show it starting. The page
   * keeps re-reading while any mart is still QUEUED or RUNNING — the shields spin meanwhile,
   * which `qualityVisual` already draws — and stops the moment they settle or the tries run out.
   */
  const onRecheck = useCallback(async () => {
    if (!ctx || checking) return
    setChecking(true)
    setError(null)
    try {
      await recheck(ctx, model?.marts.map(mart => mart.id) ?? [])
      // ponytail: 20 tries at 3s is a minute of watching; a slower warehouse finishes off-screen
      // and the next open shows it.
      for (let tries = 0; tries < 20; tries++) {
        const next = await loadModel(ctx)
        setModel(next)
        if (!settling(next)) break
        await new Promise(wait => setTimeout(wait, 3000))
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }, [ctx, model, checking])

  return (
    <div className="dm-page">
      <header className="dm-page-header">
        <h1 className="dm-page-header-title">Data Flow</h1>
      </header>
      <main className="dm-page-content">
        {error ? (
          <section className="dm-card">
            <p className="dm-bad">Could not read the project</p>
            <p className="dm-muted">{error}</p>
          </section>
        ) : ctx ? (
          <Canvas
            ctx={ctx}
            model={model ?? NOTHING_YET}
            pending={folded ? progress : null}
            onRecheck={onRecheck}
            checking={checking}
          />
        ) : null}
      </main>
    </div>
  )
}

function Canvas({
  ctx,
  model,
  pending,
  onRecheck,
  checking,
}: {
  ctx: PluginContext
  model: Model
  /** Set while the project is still being read: counts to show before the cards exist. */
  pending: Progress | null
  onRecheck: () => void
  checking: boolean
}) {
  const canvas = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  // Filters start with everything ticked rather than empty: an empty menu now means "none", which
  // is what unticking "Select all" asks for.
  const [flags, setFlags] = useState(() => FLAGS.map(flag => flag.key))
  const [martSearch, setMartSearch] = useState('')
  const [storageTypes, setStorageTypes] = useState<string[]>([])
  const [storageFlags, setStorageFlags] = useState(() => STORAGE_FLAGS.map(flag => flag.key))
  /**
   * How many extra pages of storages have been asked for.
   *
   * The list is ordered by how much each storage holds, so the empty ones fall to the end on their
   * own — the first page stops at whichever comes first, twenty-five or the last storage holding
   * something. One card reveals the rest, in pages, whichever kind they are.
   */
  const [storagePages, setStoragePages] = useState(0)
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const onFold = useCallback(
    (block: string) =>
      setFolded(open => {
        const next = new Set(open)
        if (!next.delete(block)) next.add(block)
        return next
      }),
    [],
  )
  const [types, setTypes] = useState<string[]>(() => EXIT_TYPES.map(row => row.type))
  const [reportSearch, setReportSearch] = useState('')
  const [reportFlags, setReportFlags] = useState(() => REPORT_FLAGS.map(flag => flag.key))
  const [reportLimit, setReportLimit] = useState(PAGE)
  /**
   * What the Reports block is narrowed to, which is not the same as what is selected.
   *
   * Selecting a report inside a narrowed list must not widen it again: the list would re-page from
   * the top and the very card just clicked could fall past the cap and vanish under the pointer.
   * Only a data mart, a destination, or clearing the selection re-aims the block.
   */
  const [scope, setScope] = useState<string | null>(null)
  /** Which storage the Data Marts block is narrowed to, if any. */
  const [storageScope, setStorageScope] = useState<string | null>(null)
  /**
   * Storage and destination-type options do not exist until the project has been read, so they are
   * ticked when they arrive rather than in `useState`, which runs against an empty project. Once
   * seeded they are the reader's: a later re-read must not hand back the ones they unticked.
   */
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || model.storages.length + model.destinationTypes.length === 0) return
    seeded.current = true
    setStorageTypes([...new Set(model.storages.map(storage => storage.type))])
    setTypes([...model.destinationTypes.map(type => type.type), ...EXIT_TYPES.map(row => row.type)])
  }, [model])
  const onPin = useCallback((id: string | null) => {
    setPinned(id)
    if (id === null || id.startsWith('dm-') || id.startsWith('dd-')) {
      setScope(id)
      setReportLimit(PAGE)
    }
    // A storage narrows the Data Marts block to what it holds; anything else clears that.
    if (id === null || id.startsWith('st-') || id.startsWith('dm-')) {
      setStorageScope(id?.startsWith('st-') ? id.slice(3) : null)
      setLimit(PAGE)
    }
  }, [])

  const marts = useMemo(() => {
    const passes = martPasses(flags)
    const needle = martSearch.trim().toLowerCase()
    return model.marts.filter(
      mart =>
        (!storageScope || mart.storageId === storageScope) &&
        (needle === '' || mart.title.toLowerCase().includes(needle)) &&
        passes(mart),
    )
  }, [model.marts, storageScope, flags, martSearch])

  const storagesMatching = useMemo(() => {
    const passes = storagePasses(storageFlags)
    return model.storages.filter(storage => storageTypes.includes(storage.type) && passes(storage))
  }, [model.storages, storageTypes, storageFlags])
  const storageLimit =
    Math.min(PAGE, storagesMatching.filter(storage => storage.marts > 0).length) + storagePages * PAGE
  const storageList = storagesMatching.slice(0, storageLimit)

  const destinations = model.destinations.filter(destination => types.includes(destination.type))

  // Selecting a data mart or a destination turns the Reports block into that card's reports.
  const selectedMart = scope?.startsWith('dm-') ? scope.slice(3) : null
  const selectedDestination = scope?.startsWith('dd-') ? scope.slice(3) : null
  const selectedTitle = selectedMart
    ? model.marts.find(mart => mart.id === selectedMart)?.title
    : model.destinations.find(destination => destination.id === selectedDestination)?.title

  const reports = useMemo(() => {
    const needle = reportSearch.trim().toLowerCase()
    const passes = reportPasses(reportFlags)
    return model.reports.filter(
      report =>
        (!selectedMart || report.martId === selectedMart) &&
        (!selectedDestination || report.destinationId === selectedDestination) &&
        (needle === '' || reportName(report).toLowerCase().includes(needle)) &&
        passes(report),
    )
  }, [model.reports, selectedMart, selectedDestination, reportSearch, reportFlags])

  // `<details name>` closes the other menu when one opens; nothing but this closes the last one
  // when the pointer goes elsewhere.
  useEffect(() => {
    const close = (e: MouseEvent) => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>('details.dm-filter[open]')) {
        if (!menu.contains(e.target as Node)) menu.open = false
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  /**
   * The page of data marts, plus any the selection points at.
   *
   * A selected report reaches back to one data mart, and a selected data mart to the ones it joins;
   * either may sit behind a filter or past the 25-card cap. Show them anyway — a highlight pointing
   * at nothing is worse than an extra card.
   */
  const shown = useMemo(() => {
    const page = marts.slice(0, limit)
    if (!pinned) return page
    const wanted = new Set(
      model.chains
        .filter(chain => chain.includes(pinned))
        .flat()
        .filter(id => id.startsWith('dm-'))
        .map(id => id.slice(3)),
    )
    // The marts the selection joins to directly, so those lines have somewhere to land.
    for (const wire of model.wires) {
      if (wire.kind !== 'relationship') continue
      if (wire.from === pinned) wanted.add(wire.to.slice(3))
      if (wire.to === pinned) wanted.add(wire.from.slice(3))
    }
    /**
     * What the selection points at comes first, and the page fills what is left.
     *
     * Never more than a page either way. A storage sits on a chain with every data mart it holds,
     * so asking for all of them put a thousand cards on the page at once — and a block that opens
     * a thousand cards to explain one click is not showing a chain, it is dumping a list. The
     * "load more" card says how many are still behind it, as it does for everything else.
     */
    const points = model.marts.filter(mart => wanted.has(mart.id)).slice(0, limit)
    const seen = new Set(points.map(mart => mart.id))
    const filled = [...points, ...page.filter(mart => !seen.has(mart.id))].slice(0, limit)
    // Which cards make the page is what the selection decides; the order they sit in is not its
    // business. Choosing them first and then restoring the block's own order keeps a selected data
    // mart where it was rather than sending it to the front of its block.
    const rank = new Map(model.marts.map((mart, at) => [mart.id, at]))
    return filled.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  }, [marts, limit, pinned, model.chains, model.wires, model.marts])
  // The selected report is on screen whatever the paging says, for the same reason its data mart is.
  const shownReports = useMemo(() => {
    const page = reports.slice(0, reportLimit)
    const id = pinned?.startsWith('rp-') ? pinned.slice(3) : null
    if (!id || page.some(report => report.id === id)) return page
    return [...page, ...model.reports.filter(report => report.id === id)]
  }, [reports, reportLimit, pinned, model.reports])
  // Cards can be dragged into another order inside their block; the lines follow them.
  const sourceCards = useReorder(model.sources, source => source.key)
  const storageCards = useReorder(storageList, storage => storage.id)
  const martCards = useReorder(shown, mart => mart.id)
  const destinationCards = useReorder(destinations, destination => destination.id)
  const exitCards = useReorder(EXITS.filter(exit => types.includes(exit.type)), exit => exit.id)
  const reportCards = useReorder(shownReports, report => report.id)

  // Filters, paging, searching and dragging all reach the lines the same way: by changing which
  // cards are on the page, and in what order.
  // The pinned card and everything it lights are rendered, not toggled by hand: a filter, a search
  // or a drag re-renders the block, and would wipe anything written onto the DOM after the fact.
  const wires = useMemo(() => [...model.wires, ...EXIT_WIRES], [model.wires])
  const state: CardState = useMemo(
    () => ({ pinned, lit: pinned ? reach(wires, model.chains, pinned).lit : null }),
    [pinned, wires, model.chains],
  )

  /**
   * A block takes the border its folded cards would have taken.
   *
   * Rendered rather than written onto the DOM, for the reason the cards' own lighting is: a
   * filter or a drag re-renders the block and would wipe anything set by hand.
   */
  const bandLit = (block: keyof typeof BANDS) => {
    // The block is itself an end of a wire — which is what an exit selection lights.
    if (state.lit?.has(BANDS[block].id)) return true
    if (!folded.has(block) || !state.lit) return false
    const prefixes = BANDS[block].holds.split(',')
    return [...state.lit].some(id => prefixes.some(prefix => id.startsWith(prefix)))
  }

  /**
   * Everything a block takes from the page, in one place.
   *
   * These five travelled as five props on five blocks, and twice a block quietly went without one:
   * Storages drew its cards while the project was still loading, and Data Marts needed its `lit`
   * written by hand to keep the exits working.
   */
  const band = (block: keyof typeof BANDS) => ({
    id: BANDS[block].id,
    holds: BANDS[block].holds,
    folded: folded.has(block),
    onFold: () => onFold(block),
    lit: bandLit(block),
    loading: reading(pending),
  })

  const revision = [sourceCards, storageCards, martCards, destinationCards, exitCards, reportCards]
    .map(block => block.key)
    .join('|')
  useWires(canvas, wires, model.chains, revision, pinned, onPin)

  const page: Page = {
    ctx,
    model,
    sourceCards,
    storages: storageList,
    storagesMatching: storagesMatching.length,
    moreStorages: () => setStoragePages(pages => pages + 1),
    resetStorages: () => setStoragePages(0),
    storageCards,
    storageScopeTitle: model.storages.find(storage => storage.id === storageScope)?.title,
    storageTypes,
    setStorageTypes,
    storageFlags,
    setStorageFlags,
    folded,
    onFold,
    band,
    marts,
    martCards,
    martSearch,
    setMartSearch,
    flags,
    setFlags,
    limit,
    setLimit,
    destinations,
    destinationCards,
    exitCards,
    types,
    setTypes,
    reports,
    reportCards,
    selectedTitle,
    reportSearch,
    setReportSearch,
    reportFlags,
    setReportFlags,
    reportLimit,
    setReportLimit,
    state,
    pending,
    onRecheck,
    checking,
  }

  return (
    <div id="canvas" ref={canvas} className={`dm-canvas${pinned ? ' focused' : ''}`}>
      <svg id="wires" aria-hidden="true">
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0.5 L7 4 L0 7.5 z" fill="context-stroke" />
          </marker>
        </defs>
      </svg>

      <SourcesBlock {...page} />

      <StoragesBlock {...page} />

      <DataMartsBlock {...page} />

      <DestinationsBlock {...page} />

      <ReportsBlock {...page} />
    </div>
  )
}

function SourcesBlock({ state, ctx, model, sourceCards, pending, band }: Page) {
  return (
    <Block
      {...band('sources')}
      icon={Plug}
      title="Sources"
      count={pending?.counts.sources ?? model.sources.length}
      hint="The connectors this project pulls from. One card per source, badged with how many data marts it feeds — its line runs to the storage it lands in, not straight to those marts."
    >
      {sourceCards.items.map(source => (
        <NodeCard
          key={source.key}
          ctx={ctx}
          drag={sourceCards.dragProps(source)}
          state={state}
          id={sourceId(source.key)}
          tone={source.tone}
          mark={<Logo name={source.name} logo={source.logo} />}
          title={source.name}
          hint={source.key}
          badge={count(source.marts, 'data mart')}
        />
      ))}
      {/* A source is not a thing you create: it appears once a connector data mart pulls from it,
          so the way to add one is the way to add that mart. */}
      <AddCard ctx={ctx} to={`/ui/${ctx.projectId}/data-marts/create`} label="Connect source" />
    </Block>
  )
}

/** Starts both host checks over every mart, and spins until they have answered. */
function RecheckButton({ onRecheck, checking }: { onRecheck: () => void; checking: boolean }) {
  const hint = 'Check Quality & Freshness'
  // `dm-mark` is what the quality and freshness glyphs wear: it carries the bubble, and the rule
  // that shows it on hover. This one presses, so it takes the pointer back from `cursor: help`.
  return (
    <button
      type="button"
      className="dm-band-action dm-mark"
      onClick={onRecheck}
      disabled={checking}
      aria-label={hint}
    >
      <RefreshCw size={14} className={checking ? 'dm-spin' : undefined} />
      <span className="dm-hint-body dm-mark-body dm-mark-below">
        <span>{checking ? 'Checking…' : hint}</span>
        <span>Runs both checks over every data mart in this project, and waits for the answers.</span>
      </span>
    </button>
  )
}

function StoragesBlock({
  state,
  ctx,
  model,
  pending,
  storages,
  storagesMatching,
  moreStorages,
  resetStorages,
  storageCards,
  storageTypes,
  setStorageTypes,
  storageFlags,
  setStorageFlags,
  band,
}: Page) {
  const types = [...new Set(model.storages.map(storage => storage.type))]
  return (
    <Block
      {...band('storages')}
      icon={Database}
      title="Storages"
      count={pending?.counts.storages ?? storages.length}
      hint="Where the data marts live. Selecting one narrows the Data Marts block to what it holds, and the lines show which sources land in it."
      toolbar={
        <>
          <MultiSelect
            label="Type"
            options={types.map(type => ({
              value: type,
              label: STORAGE[type]?.label ?? type,
              count: model.storages.filter(storage => storage.type === type).length,
              icon: STORAGE[type]?.icon ?? Database,
            }))}
            selected={storageTypes}
            onChange={next => {
              setStorageTypes(next)
              resetStorages()
            }}
          />
          <MultiSelect
            label="Sharing"
            options={STORAGE_FLAGS.map(flag => ({ value: flag.key, label: flag.label, group: flag.facet }))}
            selected={storageFlags}
            onChange={next => {
              setStorageFlags(next)
              resetStorages()
            }}
          />
        </>
      }
    >
      {storageCards.items.map(storage => (
        <NodeCard
          key={storage.id}
          ctx={ctx}
          drag={storageCards.dragProps(storage)}
          state={state}
          id={storeId(storage.id)}
          mark={<Logo icon={STORAGE[storage.type]?.icon ?? Database} />}
          title={storage.title}
          hint={STORAGE[storage.type]?.label ?? storage.type}
          badge={count(storage.marts, 'data mart')}
          link={`/ui/${ctx.projectId}/data-storages?id=${encodeURIComponent(storage.id)}`}
          linkTitle="Open this storage"
        />
      ))}
      {/* Ordered by what each holds, so the empty ones are last in the queue rather than a case. */}
      <MoreCard shown={storages.length} total={storagesMatching} page={PAGE} onMore={moreStorages} />
      <AddCard ctx={ctx} to={`/ui/${ctx.projectId}/data-storages`} label="New storage" />
    </Block>
  )
}

function DataMartsBlock({ state, ctx, marts, martCards, martSearch, setMartSearch, flags, setFlags, limit, setLimit, onRecheck, checking, pending, band, storageScopeTitle }: Page) {
  return (
    <Block
      {...band('marts')}
      icon={Box}
      title={storageScopeTitle ? `Data Marts · ${storageScopeTitle}` : 'Data Marts'}
      count={pending?.counts.marts ?? marts.length}
      action={<RecheckButton onRecheck={onRecheck} checking={checking} />}
      hint={`Ordered by how much depends on them, ${PAGE} at a time. A dashed line is a relationship — a join between two marts; selecting one brings the marts it joins onto the page.`}
      toolbar={
        <>
          <SearchBox value={martSearch} onChange={setMartSearch} label="Search data marts" />
          <MultiSelect
            label="Filter"
            options={FLAGS.map(flag => ({ value: flag.key, label: flag.label, group: flag.facet }))}
            selected={flags}
            onChange={next => {
              setFlags(next)
              setLimit(PAGE)
            }}
          />
        </>
      }
    >
      {martCards.items.map(mart => (
        <MartCard key={mart.id} ctx={ctx} mart={mart} drag={martCards.dragProps(mart)} state={state} />
      ))}
      <MoreCard
        shown={Math.min(limit, marts.length)}
        total={marts.length}
        page={PAGE}
        onMore={() => setLimit(limit + PAGE)}
      />
      <AddCard ctx={ctx} to={`/ui/${ctx.projectId}/data-marts/create`} label="New data mart" />
    </Block>
  )
}

function DestinationsBlock({ state, ctx, model, destinations, destinationCards, exitCards, types, setTypes, pending, band }: Page) {
  return (
    <Block
      {...band('destinations')}
      icon={ArchiveRestore}
      title="Destinations"
      count={pending?.counts.destinations ?? destinations.length}
      hint="Where the reports go, badged with how many write to each. Claude, ChatGPT and the API are ways out that no endpoint lists — select them, or follow the link in the corner."
      toolbar={
        <MultiSelect
          label="Type"
          options={[
            ...model.destinationTypes.map(type => ({
              value: type.type,
              label: DESTINATION[type.type]?.label ?? type.type,
              count: type.destinations,
              icon: DESTINATION[type.type]?.icon ?? ArchiveRestore,
            })),
            ...EXIT_TYPES.map(row => ({
              value: row.type,
              label: row.label,
              count: row.destinations,
              icon: row.icon,
            })),
          ]}
          selected={types}
          onChange={setTypes}
        />
      }
    >
      {destinationCards.items.map(destination => (
        <NodeCard
          key={destination.id}
          ctx={ctx}
          drag={destinationCards.dragProps(destination)}
          state={state}
          id={destId(destination.id)}
          tone={destination.tone}
          mark={<Logo icon={DESTINATION[destination.type]?.icon ?? ArchiveRestore} />}
          title={destination.title}
          badge={count(destination.reports, 'report')}
          link={`/ui/${ctx.projectId}/data-destinations?id=${encodeURIComponent(destination.id)}`}
          linkTitle="Open this destination"
        />
      ))}
      {exitCards.items.map(exit => (
        <NodeCard
          key={exit.id}
          ctx={ctx}
          drag={exitCards.dragProps(exit)}
          state={state}
          id={exit.id}
          mark={<Logo icon={exit.icon} />}
          title={exit.title}
          note={exit.note}
          link={exit.to || `/ui/${ctx.projectId}/me/api-keys`}
          linkTitle={`Open ${exit.title}`}
        />
      ))}
      <AddCard ctx={ctx} to={`/ui/${ctx.projectId}/data-destinations`} label="New destination" />
    </Block>
  )
}

function ReportsBlock({
  state,
  ctx,
  reports,
  reportCards,
  selectedTitle,
  reportSearch,
  setReportSearch,
  reportFlags,
  setReportFlags,
  reportLimit,
  setReportLimit,
  pending,
  band,
}: Page) {
  return (
    <Block
      {...band('reports')}
      icon={FileText}
      title={selectedTitle ? `Reports · ${selectedTitle}` : 'Reports'}
      count={pending?.counts.reports ?? reports.length}
      hint={`The ${PAGE} most recently run reports. Select a data mart or a destination above and this block narrows to its reports.`}
      toolbar={
        <>
          <SearchBox
            value={reportSearch}
            onChange={next => {
              setReportSearch(next)
              setReportLimit(PAGE)
            }}
            label="Search reports"
          />
          <MultiSelect
            label="Filter"
            options={REPORT_FLAGS.map(flag => ({ value: flag.key, label: flag.label }))}
            selected={reportFlags}
            onChange={next => {
              setReportFlags(next)
              setReportLimit(PAGE)
            }}
          />
        </>
      }
    >
      {reportCards.items.map(report => (
        <NodeCard
          key={report.id}
          ctx={ctx}
          drag={reportCards.dragProps(report)}
          state={state}
          id={reportId(report.id)}
          tone={report.tone}
          title={reportName(report)}
          link={
            report.martId
              ? `/ui/${ctx.projectId}/data-marts/${report.martId}/reports?reportId=${encodeURIComponent(report.id)}`
              : undefined
          }
          linkTitle="Open this report"
        >
          <div className="dm-badges">
            {/* No column picked means every reportable field, which is not a number this page
                can put on the badge without asking the data mart for its schema. */}
            {report.columns > 0 && (
              <span className="dm-badge" title={`${count(report.columns, 'column')} in the output`}>
                <Columns3 size={12} />
              </span>
            )}
            {report.schedule && (
              <span
                className={`dm-badge${report.schedule.active === 0 ? ' dm-badge-off' : ''}`}
                title={scheduleLabel(report.schedule)}
              >
                <CalendarClock size={12} />
              </span>
            )}
            {report.preJoin > 0 && (
              <span className="dm-badge" title={`Pre-join filter (slice) — ${count(report.preJoin, 'rule')}`}>
                <Layers size={12} />
              </span>
            )}
            {report.postJoin > 0 && (
              <span className="dm-badge" title={`Output filter — ${count(report.postJoin, 'rule')}`}>
                <Filter size={12} />
              </span>
            )}
            {report.aggregations > 0 && (
              <span className="dm-badge" title={count(report.aggregations, 'aggregated column')}>
                <Sigma size={12} />
              </span>
            )}
          </div>
          <div className="dm-node-foot">
            <span className={`dm-status dm-${report.tone}`} title={report.lastRunStatus}>
              <RunIcon status={report.lastRunStatus} />
            </span>
            <span className="dm-muted dm-run">{report.lastRunAt ? ago(report.lastRunAt) : 'never run'}</span>
          </div>
        </NodeCard>
      ))}
      <MoreCard
        shown={Math.min(reportLimit, reports.length)}
        total={reports.length}
        page={PAGE}
        onMore={() => setReportLimit(reportLimit + PAGE)}
      />
      {reports.length === 0 && (
        <p className="dm-muted dm-empty">
          {selectedTitle ? 'Nothing here has reports.' : 'No reports in this project yet.'}
        </p>
      )}
    </Block>
  )
}
