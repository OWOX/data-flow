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
  Sigma,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AddCard, Logo, MartCard, MoreCard, NodeCard, RunIcon, type CardState } from './cards'
import { ago, count, reportName, runTone, scheduleLabel } from './format'
import { Block, MultiSelect, SearchBox } from './controls'
import { DESTINATION, EXIT, STORAGE, type Mark } from './icons'
import {
  destId,
  loadModel,
  reportId,
  sourceId,
  type Destination,
  type Mart,
  type Model,
  type Report,
  type Source,
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
const FLAGS: Array<{ key: string; facet: string; label: string; test: (mart: Mart) => boolean }> = [
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

const FACETS = [...new Set(FLAGS.map(flag => flag.facet))]

/**
 * The Data Marts block itself, as one end of a wire.
 *
 * An exit reads every data mart in the project, so drawing it a line per card would be fifty lines
 * saying one thing. It gets one line to the block, and the block takes a border.
 */
const MARTS = 'marts-block'
const EXIT_WIRES: Wire[] = EXITS.map(exit => ({ from: exit.id, to: MARTS, kind: 'exit' }))

/** The Reports block's own filter: the one thing about a report that is not on its card's face. */
const REPORT_FLAGS: Array<{ key: string; label: string; test: (report: Report) => boolean }> = [
  { key: 'triggers', label: 'With triggers', test: report => (report.schedule?.total ?? 0) > 0 },
  { key: 'no-triggers', label: 'Without triggers', test: report => !report.schedule?.total },
]

/** Everything the four blocks read. Canvas works it out; each block takes the whole thing. */
type Page = {
  ctx: PluginContext
  model: Model
  sourceCards: Cards<Source>
  marts: Mart[]
  martCards: Cards<Mart>
  martSearch: string
  setMartSearch: (value: string) => void
  storages: string[]
  setStorages: (value: string[]) => void
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
}

export default function App() {
  const [ctx, setCtx] = useState<PluginContext | null>(null)
  const [model, setModel] = useState<Model | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    connect()
      .then(async host => {
        document.documentElement.classList.toggle('dark', host.theme === 'dark')
        if (live) setCtx(host)
        const loaded = await loadModel(host)
        if (live) setModel(loaded)
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [])

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
        ) : !model || !ctx ? (
          <section className="dm-card dm-muted">Loading…</section>
        ) : (
          <Canvas ctx={ctx} model={model} />
        )}
      </main>
    </div>
  )
}

function Canvas({ ctx, model }: { ctx: PluginContext; model: Model }) {
  const canvas = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  // Filters start with everything ticked rather than empty: an empty menu now means "none", which
  // is what unticking "Select all" asks for.
  const [storages, setStorages] = useState(() => model.storages.map(storage => storage.title))
  const [flags, setFlags] = useState(() => FLAGS.map(flag => flag.key))
  const [martSearch, setMartSearch] = useState('')
  const [types, setTypes] = useState(() => [
    ...model.destinationTypes.map(type => type.type),
    ...EXIT_TYPES.map(row => row.type),
  ])
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
  const onPin = useCallback((id: string | null) => {
    setPinned(id)
    if (id === null || id.startsWith('dm-') || id.startsWith('dd-')) {
      setScope(id)
      setReportLimit(PAGE)
    }
  }, [])

  const marts = useMemo(() => {
    const chosen = FLAGS.filter(flag => flags.includes(flag.key))
    const needle = martSearch.trim().toLowerCase()
    return model.marts.filter(
      mart =>
        storages.includes(mart.storage) &&
        (needle === '' || mart.title.toLowerCase().includes(needle)) &&
        FACETS.every(facet => {
          // Picking one option out of a facet empties the others, and an empty facet asks for
          // nothing rather than for the impossible.
          const rules = chosen.filter(flag => flag.facet === facet)
          return rules.length === 0 || rules.some(flag => flag.test(mart))
        }),
    )
  }, [model.marts, storages, flags, martSearch])

  const destinations = model.destinations.filter(destination => types.includes(destination.type))

  // Selecting a data mart or a destination turns the Reports block into that card's reports.
  const selectedMart = scope?.startsWith('dm-') ? scope.slice(3) : null
  const selectedDestination = scope?.startsWith('dd-') ? scope.slice(3) : null
  const selectedTitle = selectedMart
    ? model.marts.find(mart => mart.id === selectedMart)?.title
    : model.destinations.find(destination => destination.id === selectedDestination)?.title

  const reports = useMemo(() => {
    const needle = reportSearch.trim().toLowerCase()
    const chosen = REPORT_FLAGS.filter(flag => reportFlags.includes(flag.key))
    return model.reports.filter(
      report =>
        (!selectedMart || report.martId === selectedMart) &&
        (!selectedDestination || report.destinationId === selectedDestination) &&
        (needle === '' || reportName(report).toLowerCase().includes(needle)) &&
        // Nothing ticked constrains nothing, as in the Data Marts filter.
        (chosen.length === 0 || chosen.some(flag => flag.test(report))),
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
    const on = new Set(page.map(mart => mart.id))
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
    return [...page, ...model.marts.filter(mart => wanted.has(mart.id) && !on.has(mart.id))]
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

  const revision = [sourceCards, martCards, destinationCards, exitCards, reportCards]
    .map(block => block.key)
    .join('|')
  useWires(canvas, wires, model.chains, revision, pinned, onPin)

  const page: Page = {
    ctx,
    model,
    sourceCards,
    marts,
    martCards,
    martSearch,
    setMartSearch,
    storages,
    setStorages,
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

      <DataMartsBlock {...page} />

      <DestinationsBlock {...page} />

      <ReportsBlock {...page} />
    </div>
  )
}

function SourcesBlock({ state, ctx, model, sourceCards }: Page) {
  return (
    <Block
      icon={Plug}
      title="Sources"
      count={model.sources.length}
      hint="Input sources behind the connector data marts below. One card per source, badged with how many data marts it feeds."
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
    </Block>
  )
}

function DataMartsBlock({ state, ctx, model, marts, martCards, martSearch, setMartSearch, storages, setStorages, flags, setFlags, limit, setLimit }: Page) {
  return (
    <Block
      id={MARTS}
      lit={state.lit?.has(MARTS)}
      icon={Box}
      title="Data Marts"
      count={marts.length}
      hint={`Published before draft, connector-based before the rest, then ordered by how much depends on them: joins in, joins out, reports. ${PAGE} at a time. A dashed line between two data marts is a relationship — a join OWOX knows how to make between them, drawn from the mart that holds the join to the one it points at. Quality and freshness sit along the bottom of each card. Selecting a mart brings the marts it joins onto the page, wherever they are in the list.`}
      toolbar={
        <>
          <SearchBox value={martSearch} onChange={setMartSearch} label="Search data marts" />
          <MultiSelect
            label="Storage"
            options={model.storages.map(storage => ({
              value: storage.title,
              label: storage.title,
              count: storage.marts,
              icon: STORAGE[storage.type]?.icon ?? Database,
            }))}
            selected={storages}
            onChange={next => {
              setStorages(next)
              setLimit(PAGE)
            }}
          />
          <MultiSelect
            label="Filter"
            options={FLAGS.map(flag => ({ value: flag.key, label: flag.label, group: flag.facet }))}
            emptyMeans="all"
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

function DestinationsBlock({ state, ctx, model, destinations, destinationCards, exitCards, types, setTypes }: Page) {
  return (
    <Block
      icon={ArchiveRestore}
      title="Destinations"
      count={destinations.length}
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
}: Page) {
  return (
    <Block
      icon={FileText}
      title={selectedTitle ? `Reports · ${selectedTitle}` : 'Reports'}
      count={reports.length}
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
            emptyMeans="all"
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
            <span className={`dm-status dm-${runTone(report.lastRunStatus)}`} title={report.lastRunStatus}>
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
