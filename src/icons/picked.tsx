// The icon a person picked for a data mart or a context in OWOX, drawn the way the host draws it
// (owox-data-marts/apps/web/src/features/data-marts/shared/components/DataMartIcon). A value is a
// recommended key or `lucide:<name>`; none, or one this library does not know, draws the default.
import { createElement, useEffect, useState } from 'react'
import {
  Activity, BadgeCheck, BadgeDollarSign, BellRing, Blocks, Braces, Building2, Calendar,
  ChartColumn, ChartNoAxesCombined, ChartPie, Cloud, Coins, CreditCard, Database, DatabaseZap, Eye,
  FileCode, FileSpreadsheet, FileText, Filter, Fingerprint, Flag, FlaskConical, Gauge, Globe, Goal,
  Handshake, Image, Layers, LayoutDashboard, LayoutTemplate, LifeBuoy, Mail, MapPin, Megaphone, Merge,
  MessageCircle, MousePointerClick, Newspaper, Package, Phone, PiggyBank, Radio, Receipt, Repeat, Route,
  ScanEye, ScrollText, Search, Server, Sheet, ShoppingBag, ShoppingCart, Sigma, Smartphone, Star, Store,
  Table, Tag, Tags, Target, TicketPercent, TrendingUp, Truck, Undo2, User, UserPlus, Users, Video,
  Wallet, Warehouse, Webhook, Workflow, type LucideIcon,
} from 'lucide-react'

/** The host's recommended keys, each with the glyph its picker shows. */
const RECOMMENDED = new Map<string, LucideIcon>(Object.entries({
  purchases: ShoppingCart, orders: Receipt, products: Package, inventory: Warehouse, revenue: TrendingUp,
  finance: Wallet, 'ad-spend': BadgeDollarSign, campaigns: Target, 'traffic-sources': Megaphone,
  sessions: MousePointerClick, pageviews: Eye, events: Activity, conversions: Flag, customers: Users,
  users: User, leads: UserPlus, countries: MapPin, devices: Smartphone, email: Mail, keywords: Search,
  social: MessageCircle, subscriptions: Repeat, calendar: Calendar, support: LifeBuoy, database: Database,
  table: Table, payments: CreditCard, invoices: FileText, refunds: Undo2, carts: ShoppingBag,
  shipping: Truck, promotions: TicketPercent, stores: Store, 'exchange-rates': Coins, creatives: Image,
  video: Video, websites: Globe, 'landing-pages': LayoutTemplate, content: Newspaper, deals: Handshake,
  companies: Building2, calls: Phone, reviews: Star, funnels: Filter, segments: ChartPie,
  experiments: FlaskConical, kpis: Gauge, forecasts: ChartNoAxesCombined, 'data-sources': DatabaseZap,
  pipelines: Workflow, sql: FileCode, api: Webhook, cloud: Cloud, servers: Server,
  reports: FileSpreadsheet, spreadsheets: Sheet, dashboards: LayoutDashboard, charts: ChartColumn,
  joins: Merge, schemas: Braces, dimensions: Layers, metrics: Sigma, 'data-quality': BadgeCheck,
  history: ScrollText, utm: Tag, attribution: Route, channels: Radio, budgets: PiggyBank, goals: Goal,
  identities: Fingerprint, cohorts: Blocks, alerts: BellRing, impressions: ScanEye,
}))

/** The host's default for a context with no icon picked. */
export const DEFAULT_CONTEXT_ICON: LucideIcon = Tags

type Catalog = typeof import('./catalog')
let catalog: Catalog | undefined
let pending: Promise<Catalog> | undefined
/** Loaded once, on the first `lucide:` value; a failed load is tried again on the next one. */
function loadCatalog() {
  pending ??= import('./catalog').then(
    loaded => (catalog = loaded),
    error => {
      pending = undefined
      throw error
    },
  )
  return pending
}

/**
 * A picked icon, or `fallback`. With no fallback, an icon that is not set, or one this library does
 * not know, draws nothing at all. A library icon waits for the catalogue with an empty box of the
 * same size, so the title beside it does not shift when it arrives. `wrap` is a class for a box
 * around the glyph, drawn only when there is a glyph to put in it.
 */
export function PickedIcon({
  icon,
  fallback,
  size = 16,
  wrap,
}: {
  icon?: string
  fallback?: LucideIcon
  size?: number
  wrap?: string
}) {
  const library = icon?.startsWith('lucide:') === true
  const [, loaded] = useState(0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!library || catalog) return
    let live = true
    loadCatalog().then(
      () => live && loaded(n => n + 1),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [library])

  const waiting = library && !catalog && !failed
  const glyph = waiting
    ? undefined
    : ((library ? catalog?.getLucideIcon(icon!) : icon ? RECOMMENDED.get(icon) : undefined) ?? fallback)
  if (!waiting && !glyph) return null
  const drawn = glyph
    ? createElement(glyph, { size })
    : <span style={{ display: 'inline-block', width: size, height: size }} />
  return wrap ? <span className={wrap}>{drawn}</span> : drawn
}
