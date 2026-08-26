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
  Waypoints,
  XCircle,
} from 'lucide-react'
import type { PluginContext } from '@owox/plugin-sdk'
import { KIND, type Mark } from './icons'
import { count, freshnessLabel, freshnessTone, initials, qualityVisual } from './format'
import { martId, type Mart } from './owox'
import type { DragProps } from './reorder'

export function NodeCard({
  ctx,
  id,
  mark,
  title,
  hint,
  badge,
  badges,
  note,
  link,
  linkTitle,
  drag,
  children,
}: {
  ctx: PluginContext
  id: string
  drag?: DragProps
  mark?: React.ReactNode
  title: string
  hint?: string
  badge?: string
  badges?: React.ReactNode
  note?: string
  link?: string
  linkTitle?: string
  children?: React.ReactNode
}) {
  return (
    <article
      id={id}
      data-node
      tabIndex={0}
      aria-pressed="false"
      {...drag}
      className={`dm-node${drag?.className ? ` ${drag.className}` : ''}`}
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
        <div className="dm-badges">
          {badge && <span className="dm-badge">{badge}</span>}
          {badges}
        </div>
      )}
      {children}
    </article>
  )
}

export function MartCard({ ctx, mart, drag }: { ctx: PluginContext; mart: Mart; drag?: DragProps }) {
  const kind = mart.kind ? KIND[mart.kind] : undefined
  const KindIcon = kind?.icon
  const quality = qualityVisual(mart.quality)
  const QualityIcon = quality.icon

  return (
    <NodeCard
      ctx={ctx}
      id={martId(mart.id)}
      title={mart.title}
      link={`/ui/${ctx.projectId}/data-marts/${mart.id}`}
      linkTitle="Open this data mart"
      drag={drag}
      badges={
        <>
          {kind && (
            <span className="dm-badge">
              {KindIcon && <KindIcon size={12} />} {kind.label}
            </span>
          )}
          {mart.fields !== undefined && <span className="dm-badge">{mart.fields} fields</span>}
          {mart.triggers > 0 && (
            <span className="dm-badge" title={count(mart.triggers, 'trigger')}>
              <CalendarClock size={12} /> {mart.triggers}
            </span>
          )}
          {mart.outbound > 0 && (
            <span className="dm-badge">
              <Waypoints size={12} /> {count(mart.outbound, 'relationship')}
            </span>
          )}
          {mart.draft && <span className="dm-badge dm-badge-draft">draft</span>}
        </>
      }
    >
      <div className="dm-node-foot">
        <span className={`dm-status dm-${quality.tone}`} title={`Data quality: ${quality.label}`}>
          <QualityIcon size={14} className={quality.spin ? 'dm-spin' : undefined} />
        </span>
        <span className={`dm-status dm-${freshnessTone(mart)}`} title={freshnessLabel(mart)}>
          <History size={14} />
        </span>
      </div>
    </NodeCard>
  )
}
export function MoreCard({
  shown,
  total,
  page,
  onMore,
}: {
  shown: number
  total: number
  page: number
  onMore: () => void
}) {
  if (shown >= total) return null
  return (
    <button type="button" className="dm-node dm-add" onClick={onMore}>
      <ChevronDown size={18} />
      <span>Load {Math.min(page, total - shown)} more</span>
      <span className="dm-muted">
        {shown} of {total}
      </span>
    </button>
  )
}

/** A card that adds the thing this block holds. Never a wire endpoint either. */
export function AddCard({ ctx, to, label }: { ctx: PluginContext; to: string; label: string }) {
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
export function AppLink({
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
export function Logo({ name, logo, icon: Icon }: { name?: string; logo?: string; icon?: Mark }) {
  const usable = logo && /^(https?:|data:)/.test(logo)
  return (
    <span className="dm-logo">
      {usable ? <img src={logo} alt="" width={16} height={16} /> : Icon ? <Icon size={16} /> : initials(name ?? '')}
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

