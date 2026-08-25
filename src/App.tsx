import { connect, type PluginContext } from '@owox/plugin-sdk'
import {
  BarChart3,
  CircleAlert,
  CircleCheck,
  ChevronDown,
  CircleDashed,
  Clock,
  Code2,
  ExternalLink,
  Eye,
  Mail,
  MessageSquare,
  MessagesSquare,
  Plug,
  Plus,
  Sheet,
  Table2,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { destId, loadModel, martId, type Mart, type Model, type QualityState } from './owox'
import { useWires } from './wires'

const KIND = {
  CONNECTOR: { icon: Plug, label: 'connector' },
  SQL: { icon: Code2, label: 'sql' },
  VIEW: { icon: Eye, label: 'view' },
  TABLE: { icon: Table2, label: 'table' },
  TABLE_PATTERN: { icon: Table2, label: 'table' },
}

const DESTINATION = {
  GOOGLE_SHEETS: { icon: Sheet, label: 'Google Sheets' },
  LOOKER_STUDIO: { icon: BarChart3, label: 'Looker Studio' },
  EMAIL: { icon: Mail, label: 'Email' },
  SLACK: { icon: MessageSquare, label: 'Slack' },
  MS_TEAMS: { icon: Users, label: 'Microsoft Teams' },
  GOOGLE_CHAT: { icon: MessagesSquare, label: 'Google Chat' },
}

/** How many cards of one type are on screen before the rest wait behind the block's "load more". */
const PAGE = 25

const GROUPS = [
  { key: 'CONNECTOR', title: 'Connector-based Data Marts' },
  { key: 'SQL', title: 'SQL Data Marts' },
  { key: 'VIEW', title: 'View Data Marts' },
  { key: 'TABLE', title: 'Table Data Marts' },
  { key: 'OTHER', title: 'Other Data Marts' },
]

/** TABLE and TABLE_PATTERN are one kind of thing to a reader, and both badge as "table". */
const groupOf = (mart: Mart) =>
  mart.kind === 'TABLE_PATTERN' ? 'TABLE' : (mart.kind && mart.kind in KIND ? mart.kind : 'OTHER')

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
        <p className="dm-muted dm-lede">
          Every source, data mart and destination in this project, and the lines between them. Hover
          a card to isolate what it touches; click to pin it.
        </p>
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
  useWires(canvas, model.wires)

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

      <Band title="Sources" hint="Input sources behind the connector data marts below.">
        {model.sources.map(source => (
          <article key={source.id} id={source.id} data-node tabIndex={0} aria-pressed="false" className="dm-node">
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
        <AddCard ctx={ctx} path={createMart} label="New source" />
      </Band>

      <MartBand ctx={ctx} marts={model.marts} createPath={createMart} />

      <Band title="Destinations" hint="Destination types this project publishes reports to.">
        {model.destinations.map(destination => {
          const kind = DESTINATION[destination.type as keyof typeof DESTINATION]
          const Icon = kind?.icon ?? MessageSquare
          return (
            <article
              key={destination.id}
              id={destId(destination.type)}
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
                  {destination.count} destination{destination.count === 1 ? '' : 's'}
                </span>
              </div>
            </article>
          )
        })}
        <AddCard ctx={ctx} path={`/ui/${ctx.projectId}/data-destinations`} label="New destination" />
      </Band>
    </div>
  )
}

/**
 * Data marts, grouped by definition type — connector-based first, as the sources above feed them.
 *
 * A project with hundreds of marts would otherwise open as a wall of cards nobody reads, so each
 * group shows a page at a time and says how many it is holding back.
 */
function MartBand({ ctx, marts, createPath }: { ctx: PluginContext; marts: Mart[]; createPath: string }) {
  const [limit, setLimit] = useState(PAGE)
  const groups = GROUPS.map(group => ({
    ...group,
    items: marts.filter(mart => groupOf(mart) === group.key),
  })).filter(group => group.items.length > 0)

  const visible = groups.reduce((total, group) => total + Math.min(group.items.length, limit), 0)
  const hidden = marts.length - visible

  return (
    <section className="dm-band">
      <h2 className="dm-band-title">Data Marts</h2>
      <p className="dm-muted dm-band-hint">
        Connector-based first, at most {limit} per type. Quality and freshness sit along the bottom of
        each card.
      </p>
      {groups.map(group => (
        <div key={group.key} className="dm-group">
          <h3 className="dm-group-title">
            {group.title} <span className="dm-muted">{group.items.length}</span>
          </h3>
          <div className="dm-band-grid">
            {group.items.slice(0, limit).map(mart => (
              <MartCard key={mart.id} ctx={ctx} mart={mart} />
            ))}
          </div>
        </div>
      ))}
      {/* One control for the whole block: it lifts the per-type cap everywhere at once. */}
      <div className="dm-band-grid dm-band-foot">
        {hidden > 0 && (
          <button type="button" className="dm-node dm-add" onClick={() => setLimit(limit + PAGE)}>
            <ChevronDown size={18} />
            <span>Load {Math.min(PAGE, hidden)} more</span>
            <span className="dm-muted">
              {visible} of {marts.length}
            </span>
          </button>
        )}
        <AddCard ctx={ctx} path={createPath} label="New data mart" />
      </div>
    </section>
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

function Band({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="dm-band">
      <h2 className="dm-band-title">{title}</h2>
      <p className="dm-muted dm-band-hint">{hint}</p>
      <div className="dm-band-grid">{children}</div>
    </section>
  )
}

/** A card that adds the thing this band holds. Never a wire endpoint, so no `data-node`. */
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
    <span className="dm-logo">
      {usable ? <img src={logo} alt="" width={16} height={16} /> : initials(name)}
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
    if (Math.abs(value) < span) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(value), unit)
    value /= span
  }
  return iso
}
