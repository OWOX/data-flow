import { connect, type PluginContext } from '@owox/plugin-sdk'
import {
  ArchiveRestore,
  Bot,
  Box,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  Columns3,
  CircleCheck,
  CircleDashed,
  Clock,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Info,
  KeyRound,
  Loader2,
  Plug,
  Plus,
  Layers,
  Search,
  Sigma,
  Sparkles,
  Waypoints,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  destId,
  loadModel,
  martId,
  reportId,
  sourceId,
  type Mart,
  type Model,
  type QualityState,
  type Report,
} from './owox'
import { DESTINATION, KIND, STORAGE, type Mark } from './icons'
import { useWires } from './wires'

/** How many cards are on screen before the rest wait behind the block's "load more". */
const PAGE = 25

/** PASSED / ISSUES / failed / not-run, in the four tones the card footer can show. */
const QUALITY: Record<QualityState, { tone: 'ok' | 'warn' | 'bad' | 'idle'; label: string }> = {
  PASSED: { tone: 'ok', label: 'Data quality: passed' },
  ISSUES: { tone: 'warn', label: 'Data quality: issues found' },
  EXECUTION_FAILED: { tone: 'bad', label: 'Data quality: last run failed' },
  CANCELLED: { tone: 'idle', label: 'Data quality: last run cancelled' },
  QUEUED: { tone: 'idle', label: 'Data quality: queued' },
  RUNNING: { tone: 'idle', label: 'Data quality: running' },
  NEVER_RUN: { tone: 'idle', label: 'Data quality: never run' },
  RESTRICTED: { tone: 'idle', label: 'Data quality: not visible to you' },
  ALL_DISABLED: { tone: 'idle', label: 'Data quality: all checks disabled' },
}

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
  { key: 'errors', facet: 'errors', label: 'With errors', test: m => m.errors },
  { key: 'no-errors', facet: 'errors', label: 'Without errors', test: m => !m.errors },
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
    icon: Sparkles,
    title: 'Claude',
    note: 'OWOX Data Marts connector',
    to: 'https://claude.ai/directory/owox-data-marts',
  },
  {
    id: 'x-chatgpt',
    type: 'AI',
    icon: Bot,
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
        <h1 className="dm-page-header-title">Model Canvas</h1>
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
    return model.reports.filter(
      report =>
        (!selectedMart || report.martId === selectedMart) &&
        (!selectedDestination || report.destinationId === selectedDestination) &&
        (needle === '' || reportName(report).toLowerCase().includes(needle)),
    )
  }, [model.reports, selectedMart, selectedDestination, reportSearch])

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
  const revision = `${limit}|${storages}|${flags}|${martSearch}|${types}|${reportSearch}|${reportLimit}|${pinned}|${scope}`
  useWires(canvas, model.wires, model.chains, revision, pinned, onPin)

  const createMart = `/ui/${ctx.projectId}/data-marts/create`
  const apiKeys = `/ui/${ctx.projectId}/me/api-keys`

  return (
    <div id="canvas" ref={canvas} className="dm-canvas">
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

      <Block
        icon={Plug}
        title="Sources"
        count={model.sources.length}
        hint="Input sources behind the connector data marts below. One card per source, badged with how many data marts it feeds."
      >
        {model.sources.map(source => (
          <NodeCard
            key={source.key}
            ctx={ctx}
            id={sourceId(source.key)}
            mark={<Logo name={source.name} logo={source.logo} />}
            title={source.name}
            hint={source.key}
            badge={count(source.marts, 'data mart')}
          />
        ))}
      </Block>

      <Block
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
        {shown.map(mart => (
          <MartCard key={mart.id} ctx={ctx} mart={mart} />
        ))}
        <MoreCard shown={Math.min(limit, marts.length)} total={marts.length} onMore={() => setLimit(limit + PAGE)} />
        <AddCard ctx={ctx} to={createMart} label="New data mart" />
      </Block>

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
        {destinations.map(destination => (
          <NodeCard
            key={destination.id}
            ctx={ctx}
            id={destId(destination.id)}
            mark={<Logo icon={DESTINATION[destination.type]?.icon ?? ArchiveRestore} />}
            title={destination.title}
            badge={count(destination.reports, 'report')}
            link={`/ui/${ctx.projectId}/data-destinations?id=${destination.id}`}
            linkTitle="Open this destination"
          />
        ))}
        {EXITS.filter(exit => types.includes(exit.type)).map(exit => (
          <NodeCard
            key={exit.id}
            ctx={ctx}
            id={exit.id}
            mark={<Logo icon={exit.icon} />}
            title={exit.title}
            note={exit.note}
            link={exit.to || apiKeys}
            linkTitle={`Open ${exit.title}`}
          />
        ))}
        <AddCard ctx={ctx} to={`/ui/${ctx.projectId}/data-destinations`} label="New destination" />
      </Block>

      <Block
        icon={FileText}
        title={selectedTitle ? `Reports · ${selectedTitle}` : 'Reports'}
        count={reports.length}
        hint={`The ${PAGE} most recently run reports. Select a data mart or a destination above and this block narrows to its reports.`}
        toolbar={
          <SearchBox
            value={reportSearch}
            onChange={next => {
              setReportSearch(next)
              setReportLimit(PAGE)
            }}
            label="Search reports"
          />
        }
      >
        {shownReports.map(report => (
          <NodeCard
            key={report.id}
            ctx={ctx}
            id={reportId(report.id)}
            title={reportName(report)}
            link={
              report.martId
                ? `/ui/${ctx.projectId}/data-marts/${report.martId}/reports?reportId=${report.id}`
                : undefined
            }
            linkTitle="Open this report"
          >
            <div className="dm-badges">
              {report.columns > 0 && (
                <span className="dm-badge" title="Columns in the output">
                  <Columns3 size={12} /> {report.columns}
                </span>
              )}
              {report.schedule && (
                <span className="dm-badge" title={scheduleLabel(report.schedule)}>
                  <CalendarClock size={12} />
                </span>
              )}
              {report.preJoin > 0 && (
                <span className="dm-badge" title={`Pre-join filter (slice) — ${count(report.preJoin, 'rule')}`}>
                  <Layers size={12} /> {report.preJoin}
                </span>
              )}
              {report.postJoin > 0 && (
                <span className="dm-badge" title={`Output filter — ${count(report.postJoin, 'rule')}`}>
                  <Filter size={12} /> {report.postJoin}
                </span>
              )}
              {report.aggregations > 0 && (
                <span className="dm-badge" title={count(report.aggregations, 'aggregated column')}>
                  <Sigma size={12} /> {report.aggregations}
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
          onMore={() => setReportLimit(reportLimit + PAGE)}
        />
        {reports.length === 0 && (
          <p className="dm-muted dm-empty">
            {selectedTitle ? 'Nothing here has reports.' : 'No reports in this project yet.'}
          </p>
        )}
      </Block>
    </div>
  )
}

/**
 * A card that is one end of a wire.
 *
 * `link` is the only part of it that is clickable: anywhere else selects the card, because that is
 * what a card on this canvas is for.
 */
function NodeCard({
  ctx,
  id,
  mark,
  title,
  hint,
  badge,
  note,
  link,
  linkTitle,
  children,
}: {
  ctx: PluginContext
  id: string
  mark?: React.ReactNode
  title: string
  hint?: string
  badge?: string
  note?: string
  link?: string
  linkTitle?: string
  children?: React.ReactNode
}) {
  return (
    <article id={id} data-node tabIndex={0} aria-pressed="false" className="dm-node">
      <div className="dm-node-head">
        {mark}
        <span className="dm-node-title" title={hint ?? title}>
          {title}
        </span>
        {link && (
          <AppLink ctx={ctx} to={link} title={linkTitle}>
            <ExternalLink size={14} />
          </AppLink>
        )}
      </div>
      {note && <div className="dm-muted dm-node-sub">{note}</div>}
      {badge && (
        <div className="dm-badges">
          <span className="dm-badge">{badge}</span>
        </div>
      )}
      {children}
    </article>
  )
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

function MartCard({ ctx, mart }: { ctx: PluginContext; mart: Mart }) {
  const kind = mart.kind ? KIND[mart.kind] : undefined
  const KindIcon = kind?.icon
  const quality = mart.quality ? QUALITY[mart.quality] : undefined
  const QualityIcon =
    quality?.tone === 'ok' ? CircleCheck : quality?.tone === 'idle' || !quality ? CircleDashed : CircleAlert

  return (
    <article id={martId(mart.id)} data-node tabIndex={0} aria-pressed="false" className="dm-node">
      <div className="dm-node-head">
        <span className="dm-node-title" title={mart.title}>
          {mart.title}
        </span>
        <AppLink ctx={ctx} to={`/ui/${ctx.projectId}/data-marts/${mart.id}`} title="Open this data mart">
          <ExternalLink size={14} />
        </AppLink>
      </div>
      <div className="dm-badges">
        {kind && (
          <span className="dm-badge">
            {KindIcon && <KindIcon size={12} />} {kind.label}
          </span>
        )}
        {mart.fields !== undefined && <span className="dm-badge">{mart.fields} fields</span>}
        {mart.outbound > 0 && (
          <span className="dm-badge">
            <Waypoints size={12} /> {count(mart.outbound, 'relationship')}
          </span>
        )}
        {mart.draft && <span className="dm-badge dm-badge-draft">draft</span>}
      </div>
      <div className="dm-node-foot">
        <span className={`dm-status dm-${quality?.tone ?? 'idle'}`} title={quality?.label ?? 'Data quality: unknown'}>
          <QualityIcon size={14} />
        </span>
        <span className={`dm-status dm-${freshnessTone(mart)}`} title={freshnessLabel(mart)}>
          <Clock size={14} />
        </span>
      </div>
    </article>
  )
}

/**
 * One block of the canvas, chromed like the panels inside OWOX itself: a light card with an icon
 * tile, its title, and an ⓘ carrying the description that used to sit under it.
 */
function Block({
  icon: Icon,
  title,
  count: total,
  hint,
  toolbar,
  children,
}: {
  icon: Mark
  title: string
  count?: number
  hint: string
  toolbar?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="dm-band">
      <header className="dm-band-head">
        <span className="dm-band-icon">
          <Icon size={18} />
        </span>
        <h2 className="dm-band-title">{title}</h2>
        {total !== undefined && <span className="dm-muted dm-band-count">{total}</span>}
        <span className="dm-hint" tabIndex={0} role="note" aria-label={hint}>
          <Info size={14} />
          <span className="dm-hint-body">{hint}</span>
        </span>
        {toolbar && <div className="dm-band-tools">{toolbar}</div>}
      </header>
      <div className="dm-band-grid">{children}</div>
    </section>
  )
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="dm-search" title={label}>
      <Search size={14} />
      <input
        type="search"
        value={value}
        placeholder={label}
        aria-label={label}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}

/**
 * A checkbox menu on a native `<details>` — no library, and `name` makes the browser close the
 * other one when this opens, so only ever one is down at a time.
 *
 * Every row starts ticked, so "Select all" is a real toggle: unticking it empties the menu and the
 * block goes empty with it, which is what asking for none of them means.
 */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  emptyMeans = 'none',
}: {
  label: string
  options: Array<{ value: string; label: string; group?: string; count?: number; icon?: Mark }>
  selected: string[]
  onChange: (next: string[]) => void
  /** What an empty menu asks for: nothing at all, or nothing in particular. */
  emptyMeans?: 'none' | 'all'
}) {
  if (options.length === 0) return null
  const all = selected.length === options.length
  const groupOf = (value: string) => options.find(option => option.value === value)?.group

  // "only" narrows within a facet and leaves the others alone; in a menu with no facets, that is
  // the whole menu.
  const only = (value: string) =>
    onChange([...selected.filter(other => groupOf(other) !== groupOf(value)), value])

  // Each facet is labelled once, above its first option.
  const headed = new Set<string>()
  const rows = options.map(option => {
    const heading = option.group && !headed.has(option.group) ? option.group : null
    if (option.group) headed.add(option.group)
    return { option, heading }
  })

  return (
    <details className="dm-filter" name="dm-filter">
      <summary>
        {label}
        <span className={all || selected.length === 0 ? 'dm-filter-all' : 'dm-filter-count'}>
          {all || (selected.length === 0 && emptyMeans === 'all') ? 'All' : selected.length === 0 ? 'None' : selected.length}
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="dm-filter-menu">
        <label className="dm-filter-every">
          <input
            type="checkbox"
            checked={all}
            ref={box => {
              if (box) box.indeterminate = !all
            }}
            onChange={e => onChange(e.target.checked ? options.map(option => option.value) : [])}
          />
          Select all
        </label>
        {rows.map(({ option, heading }) => (
          <div key={option.value}>
            {heading && <p className="dm-muted dm-filter-group">{heading}</p>}
            <div className="dm-filter-row">
              <label className={selected.includes(option.value) ? 'dm-on' : undefined}>
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={e =>
                    onChange(
                      e.target.checked
                        ? [...selected, option.value]
                        : selected.filter(value => value !== option.value),
                    )
                  }
                />
                {option.icon && <option.icon size={14} />}
                <span className="dm-filter-label">{option.label}</span>
                {option.count !== undefined && <span className="dm-badge">{option.count}</span>}
              </label>
              <button type="button" className="dm-filter-only" onClick={() => only(option.value)}>
                only
              </button>
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

/** The rest of a capped list. Never a wire endpoint, so no `data-node`. */
function MoreCard({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null
  return (
    <button type="button" className="dm-node dm-add" onClick={onMore}>
      <ChevronDown size={18} />
      <span>Load {Math.min(PAGE, total - shown)} more</span>
      <span className="dm-muted">
        {shown} of {total}
      </span>
    </button>
  )
}

/** A card that adds the thing this block holds. Never a wire endpoint either. */
function AddCard({ ctx, to, label }: { ctx: PluginContext; to: string; label: string }) {
  return (
    <AppLink ctx={ctx} to={to} className="dm-node dm-add" title={label}>
      <Plus size={18} />
      <span>{label}</span>
    </AppLink>
  )
}

/**
 * A link out of this frame, in-app or external.
 *
 * The host does the opening either way: an iframe can neither navigate the app around it nor open
 * a tab of its own. The href stays real so the address is visible, copyable and middle-clickable.
 */
function AppLink({
  ctx,
  to,
  className,
  title,
  children,
}: {
  ctx: PluginContext
  /** An in-app path (`/ui/…`) or an absolute URL. */
  to: string
  className?: string
  title?: string
  children: React.ReactNode
}) {
  const inApp = to.startsWith('/')
  return (
    <a
      href={inApp ? `https://app.owox.com${to}` : to}
      className={className ?? 'dm-link'}
      title={title}
      target={inApp ? undefined : '_blank'}
      rel={inApp ? undefined : 'noreferrer'}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        if (inApp) ctx.ui.navigate(to)
        else void ctx.ui.openExternal(to)
      }}
    >
      {children}
    </a>
  )
}

/** A card's mark: the connector's own logo when OWOX gives a usable one, a glyph, or initials. */
function Logo({ name, logo, icon: Icon }: { name?: string; logo?: string; icon?: Mark }) {
  const usable = logo && /^(https?:|data:)/.test(logo)
  return (
    <span className="dm-logo">
      {usable ? <img src={logo} alt="" width={16} height={16} /> : Icon ? <Icon size={16} /> : initials(name ?? '')}
    </span>
  )
}

const initials = (name: string) =>
  name
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase())
    .join('')

/** The host's own Triggers glyph, so an active refresh reads the same here as it does there. */
const scheduleLabel = (schedule: { cron?: string; nextRun?: string }) =>
  `Scheduled refresh is active${schedule.cron ? ` (${schedule.cron})` : ''}${
    schedule.nextRun ? `, next ${ago(schedule.nextRun)}` : ''
  }`

/**
 * A Looker Studio report is a live connection rather than a document someone titled, so its own
 * name says nothing; the data mart behind it is the useful label.
 */
const reportName = (report: Report) =>
  (report.destinationType === 'LOOKER_STUDIO' ? report.martTitle : undefined) ?? report.title

/** The glyphs the host's own report table uses for a run. */
function RunIcon({ status }: { status?: string }) {
  if (status === 'ERROR') return <XCircle size={14} />
  if (status === 'SUCCESS') return <CircleCheck size={14} />
  if (status === 'RUNNING') return <Loader2 size={14} className="dm-spin" />
  return <CircleDashed size={14} />
}

const runTone = (status?: string) => (status === 'ERROR' ? 'bad' : status === 'SUCCESS' ? 'ok' : 'idle')

function freshnessTone(mart: Mart) {
  const coverage = mart.freshness?.coverage
  if (!mart.freshness?.dataLastUpdatedAt || coverage === 'unavailable') return 'idle'
  return coverage === 'partial' ? 'warn' : 'ok'
}

function freshnessLabel(mart: Mart) {
  const at = mart.freshness?.dataLastUpdatedAt
  if (!at) return 'Freshness: unknown'
  const coverage = mart.freshness?.coverage
  return `Data last updated ${ago(at)}${coverage && coverage !== 'complete' ? ` (${coverage})` : ''}`
}

/** "3 hours ago", from a timestamp — enough for a tooltip, without a date library. */
function ago(iso: string) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000
  if (Number.isNaN(seconds)) return iso
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
    ['year', Infinity],
  ]
  let value = seconds
  for (const [unit, span] of units) {
    if (Math.abs(value) < span) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(value), unit)
    }
    value /= span
  }
  return iso
}
