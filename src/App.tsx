import { connect, type PluginContext } from '@owox/plugin-sdk'
import {
  ArchiveRestore,
  Bot,
  Box,
  BrainCircuit,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  Database,
  ExternalLink,
  FileText,
  Info,
  KeyRound,
  Layers,
  Plug,
  Plus,
  Sparkles,
  Waypoints,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  destId,
  loadModel,
  martId,
  reportId,
  sourceId,
  typeId,
  type Mart,
  type Model,
  type QualityState,
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
  const [storages, setStorages] = useState<string[]>([])
  const [flags, setFlags] = useState<string[]>([])
  const onPin = useCallback((id: string | null) => setPinned(id), [])

  const marts = useMemo(() => {
    const chosen = FLAGS.filter(flag => flags.includes(flag.key))
    const facets = [...new Set(chosen.map(flag => flag.facet))]
    return model.marts.filter(
      mart =>
        (storages.length === 0 || storages.includes(mart.storage)) &&
        facets.every(facet => chosen.some(flag => flag.facet === facet && flag.test(mart))),
    )
  }, [model.marts, storages, flags])

  const shown = marts.slice(0, limit)
  const hidden = marts.length - shown.length

  // Selecting a data mart turns the Reports block into that mart's reports.
  const selected = pinned?.startsWith('dm-') ? pinned.slice(3) : null
  const reports = selected ? model.reports.filter(report => report.martId === selected) : model.reports
  const selectedTitle = model.marts.find(mart => mart.id === selected)?.title

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

  const revision = `${limit}|${storages}|${flags}|${selected}`
  useWires(canvas, model.wires, model.chains, revision, pinned, onPin)

  const createMart = `/ui/${ctx.projectId}/data-marts/create`

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
          <article
            key={source.id}
            id={sourceId(source.key)}
            data-node
            tabIndex={0}
            aria-pressed="false"
            className="dm-node"
          >
            <div className="dm-node-head">
              <Logo name={source.name} logo={source.logo} />
              <span className="dm-node-title" title={source.key}>
                {source.name}
              </span>
            </div>
            <div className="dm-badges">
              <span className="dm-badge">
                {source.marts} data mart{source.marts === 1 ? '' : 's'}
              </span>
            </div>
          </article>
        ))}
      </Block>

      <Block
        icon={Box}
        title="Data Marts"
        count={marts.length}
        hint={`Published before draft, connector-based before the rest, then ordered by how much depends on them: joins in, joins out, reports. ${PAGE} at a time. Quality and freshness sit along the bottom of each card.`}
        toolbar={
          <>
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
              selected={flags}
              onChange={next => {
                setFlags(next)
                setLimit(PAGE)
              }}
            />
          </>
        }
        footer={
          <div className="dm-band-grid dm-band-foot">
            {hidden > 0 && (
              <button type="button" className="dm-node dm-add" onClick={() => setLimit(limit + PAGE)}>
                <ChevronDown size={18} />
                <span>Load {Math.min(PAGE, hidden)} more</span>
                <span className="dm-muted">
                  {shown.length} of {marts.length}
                </span>
              </button>
            )}
            <AddCard ctx={ctx} path={createMart} label="New data mart" />
          </div>
        }
      >
        {shown.map(mart => (
          <MartCard key={mart.id} ctx={ctx} mart={mart} />
        ))}
        {shown.length === 0 && <p className="dm-muted dm-empty">No data mart matches this filter.</p>}
      </Block>

      <Block
        icon={Layers}
        title="Destination Types"
        count={model.destinationTypes.length}
        hint="The kinds of destination this project publishes to. Only types with a destination behind them appear."
      >
        {model.destinationTypes.map(destination => {
          const kind = DESTINATION[destination.type]
          const Icon = kind?.icon ?? ArchiveRestore
          return (
            <article
              key={destination.id}
              id={typeId(destination.type)}
              data-node
              tabIndex={0}
              aria-pressed="false"
              className="dm-node"
            >
              <div className="dm-node-head">
                <span className="dm-logo">
                  <Icon size={16} />
                </span>
                <span className="dm-node-title">{kind?.label ?? destination.type}</span>
              </div>
              <div className="dm-badges">
                <span className="dm-badge">
                  {destination.destinations} destination{destination.destinations === 1 ? '' : 's'}
                </span>
              </div>
            </article>
          )
        })}
        <LinkCard
          icon={BrainCircuit}
          title="AI"
          note="Ask this project's data questions"
          href={`https://app.owox.com/ui/${ctx.projectId}/me/api-keys`}
          onOpen={() => ctx.ui.navigate(`/ui/${ctx.projectId}/me/api-keys`)}
        />
        <LinkCard
          icon={KeyRound}
          title="API"
          note="Read the marts over HTTP"
          href={`https://app.owox.com/ui/${ctx.projectId}/me/api-keys`}
          onOpen={() => ctx.ui.navigate(`/ui/${ctx.projectId}/me/api-keys`)}
        />
      </Block>

      <Block
        icon={ArchiveRestore}
        title="Destinations"
        count={model.destinations.length}
        hint="The destinations themselves, each wired to its type and badged with the reports that write to it."
        footer={
          <div className="dm-band-grid dm-band-foot">
            <AddCard ctx={ctx} path={`/ui/${ctx.projectId}/data-destinations`} label="New destination" />
          </div>
        }
      >
        {model.destinations.map(destination => {
          const kind = DESTINATION[destination.type]
          const Icon = kind?.icon ?? ArchiveRestore
          return (
            <article
              key={destination.id}
              id={destId(destination.id)}
              data-node
              tabIndex={0}
              aria-pressed="false"
              className="dm-node"
            >
              <div className="dm-node-head">
                <span className="dm-logo">
                  <Icon size={16} />
                </span>
                <span className="dm-node-title" title={destination.title}>
                  {destination.title}
                </span>
              </div>
              <div className="dm-badges">
                <span className="dm-badge">
                  {destination.reports} report{destination.reports === 1 ? '' : 's'}
                </span>
              </div>
            </article>
          )
        })}
        <LinkCard
          icon={Sparkles}
          title="Claude"
          note="OWOX Data Marts connector"
          href="https://claude.ai/directory/owox-data-marts"
          onOpen={() => ctx.ui.openExternal('https://claude.ai/directory/owox-data-marts')}
        />
        <LinkCard
          icon={Bot}
          title="ChatGPT"
          note="OWOX Data Marts app"
          href="https://chatgpt.com/plugins/plugin_asdk_app_6a3e81be8f8481918e1e2cd1d7ea09c4"
          onOpen={() =>
            ctx.ui.openExternal('https://chatgpt.com/plugins/plugin_asdk_app_6a3e81be8f8481918e1e2cd1d7ea09c4')
          }
        />
      </Block>

      <Block
        icon={FileText}
        title={selectedTitle ? `Reports · ${selectedTitle}` : 'Reports'}
        count={reports.length}
        hint={`The ${PAGE} most recently run reports. Select a data mart above and this block narrows to that mart's reports.`}
      >
        {reports.slice(0, PAGE).map(report => (
          <article
            key={report.id}
            id={reportId(report.id)}
            data-node
            tabIndex={0}
            aria-pressed="false"
            className="dm-node"
          >
            <div className="dm-node-head">
              <span className="dm-node-title" title={report.title}>
                {report.title}
              </span>
            </div>
            <div className="dm-muted dm-node-sub">{report.martTitle ?? 'Unknown data mart'}</div>
            <div className="dm-node-foot">
              <span className={`dm-status dm-${runTone(report.lastRunStatus)}`}>
                {report.lastRunStatus === 'ERROR' ? <CircleAlert size={14} /> : <CircleCheck size={14} />}
              </span>
              <span className="dm-muted dm-run">{report.lastRunAt ? ago(report.lastRunAt) : 'never run'}</span>
            </div>
          </article>
        ))}
        {reports.length === 0 && (
          <p className="dm-muted dm-empty">
            {selectedTitle ? 'This data mart has no reports.' : 'No reports in this project yet.'}
          </p>
        )}
      </Block>
    </div>
  )
}

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
        <AppLink ctx={ctx} path={`/ui/${ctx.projectId}/data-marts/${mart.id}`} title="Open this data mart">
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
            <Waypoints size={12} /> {mart.outbound} relationship{mart.outbound === 1 ? '' : 's'}
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
  count,
  hint,
  toolbar,
  footer,
  children,
}: {
  icon: Mark
  title: string
  count?: number
  hint: string
  toolbar?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="dm-band">
      <header className="dm-band-head">
        <span className="dm-band-icon">
          <Icon size={18} />
        </span>
        <h2 className="dm-band-title">{title}</h2>
        {count !== undefined && <span className="dm-muted dm-band-count">{count}</span>}
        <span className="dm-hint" tabIndex={0} role="note" aria-label={hint}>
          <Info size={14} />
          <span className="dm-hint-body">{hint}</span>
        </span>
        {toolbar && <div className="dm-band-tools">{toolbar}</div>}
      </header>
      <div className="dm-band-grid">{children}</div>
      {footer}
    </section>
  )
}

/**
 * A checkbox menu on a native `<details>` — no library, and `name` makes the browser close the
 * other one when this opens, so only ever one is down at a time.
 *
 * Nothing selected filters nothing, which is the same result as everything selected: both say
 * "All" rather than leaving the reader to work out that an empty menu means no filter.
 */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: Array<{ value: string; label: string; group?: string; count?: number; icon?: Mark }>
  selected: string[]
  onChange: (next: string[]) => void
}) {
  if (options.length === 0) return null
  const all = selected.length === 0 || selected.length === options.length

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
        <span className={all ? 'dm-filter-all' : 'dm-filter-count'}>{all ? 'All' : selected.length}</span>
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
            // Unchecking it would ask for "none", which filters to nothing anyone wants to see.
            onChange={e => e.target.checked && onChange(options.map(option => option.value))}
          />
          Select all
        </label>
        {rows.map(({ option, heading }) => (
          <div key={option.value}>
            {heading && <p className="dm-muted dm-filter-group">{heading}</p>}
            <label className={all || selected.includes(option.value) ? 'dm-on' : undefined}>
              <input
                type="checkbox"
                // Everything is included when nothing is picked, so every row reads that way too.
                checked={all || selected.includes(option.value)}
                onChange={e =>
                  onChange(
                    e.target.checked
                      ? [...selected, option.value]
                      : // Dropping one out of "all" leaves the others behind, not an empty menu.
                        (all ? options.map(o => o.value) : selected).filter(
                          value => value !== option.value,
                        ),
                  )
                }
              />
              {option.icon && <option.icon size={14} />}
              <span className="dm-filter-label">{option.label}</span>
              {option.count !== undefined && <span className="dm-badge">{option.count}</span>}
            </label>
          </div>
        ))}
        {selected.length > 0 && (
          <button type="button" className="dm-filter-clear" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
    </details>
  )
}

/**
 * A card that is a way out rather than a thing OWOX stores — the API keys page, Claude, ChatGPT.
 *
 * The href is real so the address is visible and copyable, but the host does the opening: this
 * frame can neither navigate the app around it nor open a tab on its own.
 */
function LinkCard({
  icon: Icon,
  title,
  note,
  href,
  onOpen,
}: {
  icon: Mark
  title: string
  note: string
  href: string
  onOpen: () => void
}) {
  return (
    <a
      className="dm-node dm-linkcard"
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        onOpen()
      }}
    >
      <div className="dm-node-head">
        <span className="dm-logo">
          <Icon size={16} />
        </span>
        <span className="dm-node-title">{title}</span>
        <ExternalLink size={14} className="dm-link" />
      </div>
      <div className="dm-muted dm-node-sub">{note}</div>
    </a>
  )
}

/** A card that adds the thing this block holds. Never a wire endpoint, so no `data-node`. */
function AddCard({ ctx, path, label }: { ctx: PluginContext; path: string; label: string }) {
  return (
    <AppLink ctx={ctx} path={path} className="dm-node dm-add" title={label}>
      <Plus size={18} />
      <span>{label}</span>
    </AppLink>
  )
}

/**
 * A link into OWOX itself.
 *
 * `ctx.ui.navigate` is what actually moves the host — this frame cannot navigate the app around it.
 * The href stays real so the address is visible, copyable and middle-clickable.
 */
function AppLink({
  ctx,
  path,
  className,
  title,
  children,
}: {
  ctx: PluginContext
  path: string
  className?: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={`https://app.owox.com${path}`}
      className={className ?? 'dm-link'}
      title={title}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        ctx.ui.navigate(path)
      }}
    >
      {children}
    </a>
  )
}

/** The connector's own logo when OWOX gives a usable one, otherwise its initials. */
function Logo({ name, logo }: { name: string; logo?: string }) {
  const usable = logo && /^(https?:|data:)/.test(logo)
  return (
    <span className="dm-logo">{usable ? <img src={logo} alt="" width={16} height={16} /> : initials(name)}</span>
  )
}

const initials = (name: string) =>
  name
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase())
    .join('')

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
