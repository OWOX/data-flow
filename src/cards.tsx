// The cards themselves, and the small pieces they are made of.
import {
  CalendarClock,
  CircleCheck,
  CircleDashed,
  ChevronDown,
  ExternalLink,
  History,
  Loader2,
  Plus,
  Share2,
  Users,
  Waypoints,
  XCircle,
} from 'lucide-react'
import type { PluginContext } from '@owox/plugin-sdk'
import { useLayoutEffect, useRef } from 'react'
import { KIND, type Mark } from './icons'
import {
  count,
  freshnessLines,
  initials,
  num,
  qualityChecks,
  qualityLine,
  qualityVisual,
  sharedFor,
} from './format'
import { martId, qualityTone, type Mart, type Party, type Person, type Tone } from './owox'
import type { DragProps } from './reorder'

/** What the page knows about the selection, which only the page can render without losing it. */
export type CardState = { pinned: string | null; lit: Set<string> | null }

const cardClass = (id: string, state?: CardState, dragged?: string) =>
  ['dm-node', state?.lit?.has(id) ? 'lit' : '', dragged ?? ''].filter(Boolean).join(' ')

export function NodeCard({
  ctx,
  id,
  tone,
  mark,
  title,
  hint,
  badge,
  badges,
  note,
  link,
  linkTitle,
  drag,
  state,
  badgeRow,
  children,
}: {
  ctx: PluginContext
  id: string
  /** Colours the border the card takes when it is pointed at or selected. Absent reads as unknown. */
  tone?: Tone
  drag?: DragProps
  mark?: React.ReactNode
  title: string
  hint?: string
  badge?: string
  badges?: React.ReactNode
  note?: string
  link?: string
  linkTitle?: string
  /** Rendered rather than toggled by hand: a re-render mid-drag must not drop the ring. */
  state?: CardState
  /** Keep the badges on one line, letting the longest one truncate. */
  badgeRow?: boolean
  children?: React.ReactNode
}) {
  /**
   * A card on its way out steps out of the grid and stays where it stood.
   *
   * Left in the flow it keeps its cell for the whole collapse, so everything after it waits, then
   * jumps when it finally goes. Pinned, the grid closes up at once and the card shrinks over the
   * space it used to hold. Measured in a layout effect, in the same commit that marked it leaving,
   * so it is read before the browser has drawn anything.
   */
  const self = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const card = self.current
    if (!card || card.dataset.leaving === undefined) return
    const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = card
    card.style.position = 'absolute'
    card.style.left = `${offsetLeft}px`
    card.style.top = `${offsetTop}px`
    card.style.width = `${offsetWidth}px`
    card.style.height = `${offsetHeight}px`
  }, [drag?.className])

  return (
    <article
      ref={self}
      id={id}
      data-node
      data-tone={tone}
      tabIndex={0}
      aria-pressed={state?.pinned === id}
      {...drag}
      className={cardClass(id, state, drag?.className)}
    >
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
      {(badge || badges) && (
        <div className={`dm-badges${badgeRow ? ' dm-badges-row' : ''}`}>
          {badge && <span className="dm-badge">{badge}</span>}
          {badges}
        </div>
      )}
      {children}
    </article>
  )
}

export function MartCard({
  ctx,
  mart,
  drag,
  state,
}: {
  ctx: PluginContext
  mart: Mart
  drag?: DragProps
  state?: CardState
}) {
  const kind = mart.kind ? KIND[mart.kind] : undefined
  const KindIcon = kind?.icon
  const quality = qualityVisual(mart.quality)
  const QualityIcon = quality.icon
  // A data mart's border is its data quality, the way the host's own Models page paints a block.
  // Staleness reaches it through the quality summary's `data_freshness` check rather than as a
  // second opinion, and run health stays on the cards that have nothing else to say.
  const tone = qualityTone(quality.tone)
  const freshness = freshnessLines(mart)
  const sharing = sharedFor(mart.sharedForMaintenance, mart.sharedForReporting, 'reporting')

  return (
    <NodeCard
      ctx={ctx}
      id={martId(mart.id)}
      tone={tone}
      title={mart.title}
      link={`/ui/${ctx.projectId}/data-marts/${mart.id}`}
      linkTitle="Open this data mart"
      drag={drag}
      state={state}
      badgeRow
      badges={
        <>
          {kind && (
            <span className="dm-badge">
              {KindIcon && <KindIcon size={12} />} {kind.label}
            </span>
          )}
          {mart.fields !== undefined && <span className="dm-badge">{num(mart.fields)} fields</span>}
          {mart.triggers > 0 && (
            <span className="dm-badge dm-badge-shrink" title={count(mart.triggers, 'trigger')}>
              <CalendarClock size={12} /> {count(mart.triggers, 'trigger')}
            </span>
          )}
          {mart.outbound > 0 && (
            <span className="dm-badge dm-badge-shrink" title={count(mart.outbound, 'relationship')}>
              <Waypoints size={12} /> {count(mart.outbound, 'relationship')}
            </span>
          )}
          {mart.draft && <span className="dm-badge dm-badge-draft">draft</span>}
        </>
      }
    >
      <div className="dm-node-foot">
        <Mark
          tone={quality.tone}
          lines={[quality.label, qualityLine(quality.label), ...qualityChecks(mart.quality)]}
          ctx={ctx}
          to={`/ui/${ctx.projectId}/data-marts/${mart.id}/quality`}
        >
          <QualityIcon size={14} className={quality.spin ? 'dm-spin' : undefined} />
        </Mark>
        {/* Only once someone has measured it. The host paints this one grey whatever it finds:
            coverage says how much was measured, never that something is wrong. */}
        {freshness.length > 0 && (
          <Mark tone="idle" lines={freshness}>
            <History size={14} />
          </Mark>
        )}
        {/* What the project may do with it, and whose it is, beside what the project knows about it. */}
        <Shared what={sharing} />
        <People people={mart.people} />
      </div>
    </NodeCard>
  )
}
export function MoreCard({
  shown,
  total,
  page,
  holds,
  onMore,
}: {
  shown: number
  total: number
  page: number
  /** The card-id prefix it stands for: lines to cards this page is hiding end here. */
  holds?: string
  onMore: () => void
}) {
  if (shown >= total) return null
  const left = total - shown
  return (
    <button
      type="button"
      className="dm-node dm-add"
      data-standin={holds === undefined ? undefined : ''}
      data-holds={holds}
      onClick={onMore}
    >
      <ChevronDown size={18} />
      <span>Load {num(Math.min(page, left))} more</span>
      {/* The count of what is still hidden, which the button's own number never repeats: on the
          last page the two would be the same number twice. */}
      {left > page && <span className="dm-muted">{num(left)} left</span>}
    </button>
  )
}

/** A card that adds the thing this block holds. Never a wire endpoint either. */
export function AddCard({ ctx, to, label }: { ctx: PluginContext; to: string; label: string }) {
  return (
    <AppLink ctx={ctx} to={to} className="dm-node dm-add dm-new" title={label}>
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
export function AppLink({
  ctx,
  to,
  className,
  title,
  label,
  children,
}: {
  ctx: PluginContext
  /** An in-app path (`/ui/…`) or an absolute URL. */
  to: string
  className?: string
  title?: string
  label?: string
  children: React.ReactNode
}) {
  const inApp = to.startsWith('/')
  return (
    <a
      href={inApp ? `https://app.owox.com${to}` : to}
      className={className ?? 'dm-link'}
      title={title}
      aria-label={label}
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

/**
 * That a thing is shared, and on the hint what for. Nothing at all when it is shared for neither:
 * the absence of the icon already says that, and a row of "not shared" says nothing worth the room.
 */
export function Shared({ what }: { what?: string }) {
  if (!what) return null
  return (
    <span className="dm-shared" title={what}>
      <Share2 size={12} />
    </span>
  )
}

/** A person's picture when OWOX has one, and their initials when it does not. */
function Face({ who }: { who: Person }) {
  return who.avatar && /^(https?:|data:)/.test(who.avatar) ? (
    <img className="dm-face" src={who.avatar} alt="" width={18} height={18} />
  ) : (
    <span className="dm-face">{initials(who.name)}</span>
  )
}

/**
 * Who a thing belongs to, on hover: whoever made it, then whoever owns it, with faces and names.
 *
 * Nothing at all when the thing records nobody — which is a real state, and an empty bubble is a
 * worse way to say it than no glyph.
 */
export function People({ people }: { people: Party[] }) {
  if (people.length === 0) return null
  const label = people.map(party => `${party.role}: ${party.who.map(who => who.name).join(', ')}`).join('. ')
  return (
    <span className="dm-status dm-mark dm-idle" tabIndex={0} role="note" aria-label={label}>
      <Users size={14} />
      <span className="dm-hint-body dm-people-body">
        {people.map(party => (
          <span className="dm-party" key={party.role}>
            <span className="dm-party-role">{party.role}</span>
            {party.who.map(who => (
              <span className="dm-person" key={who.id || who.name}>
                <Face who={who} />
                {who.name}
              </span>
            ))}
          </span>
        ))}
      </span>
    </span>
  )
}

/** A card's mark: the connector's own logo when OWOX gives a usable one, a glyph, or initials. */
export function Logo({ name, logo, icon: Icon }: { name?: string; logo?: string; icon?: Mark }) {
  const usable = logo && /^(https?:|data:)/.test(logo)
  return (
    <span className="dm-logo">
      {usable ? <img src={logo} alt="" width={16} height={16} /> : Icon ? <Icon size={16} /> : initials(name ?? '')}
    </span>
  )
}

/** A status glyph that says what it means on hover, and does nothing when clicked. */
function Mark({
  tone,
  lines,
  ctx,
  to,
  children,
}: {
  tone: Tone
  lines: string[]
  /** Given both, the mark leads somewhere: the host opens it, and clicking no longer picks the card. */
  ctx?: PluginContext
  to?: string
  children: React.ReactNode
}) {
  const className = `dm-status dm-mark dm-${tone}`
  const label = lines.join('. ')
  const body = (
    <>
      {children}
      <span className="dm-hint-body dm-mark-body">
        {lines.map(line => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </>
  )
  return ctx && to ? (
    <AppLink ctx={ctx} to={to} className={className} label={label}>
      {body}
    </AppLink>
  ) : (
    <span className={className} tabIndex={0} role="note" aria-label={label}>
      {body}
    </span>
  )
}

/** The glyphs the host's own report table uses for a run. */
export function RunIcon({ status }: { status?: string }) {
  if (status === 'ERROR') return <XCircle size={14} />
  if (status === 'SUCCESS') return <CircleCheck size={14} />
  if (status === 'RUNNING') return <Loader2 size={14} className="dm-spin" />
  return <CircleDashed size={14} />
}

