// Turning what the API says into what a card shows: a tone, a glyph, a sentence.
import {
  LoaderCircle,
  Shield,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  ShieldMinus,
  ShieldOff,
  ShieldX,
} from 'lucide-react'
import type { Mark } from './icons'
import type { Mart, QualitySummary, Report } from './owox'

/**
 * The data quality status icon, straight out of the host's `getDataQualityStatusVisual` — same
 * shields, same labels, same tone per state, so a mart reads the same here as on its own canvas.
 */
export function qualityVisual(summary?: QualitySummary) {
  if (!summary) return { icon: Shield, tone: 'idle', label: 'Data quality: unknown', spin: false }
  const severity =
    (summary.errorFindings ?? 0) > 0 || summary.highestSeverity === 'error'
      ? 'bad'
      : (summary.warningFindings ?? 0) > 0 || summary.highestSeverity === 'warning'
        ? 'warn'
        : (summary.noticeFindings ?? 0) > 0 || summary.highestSeverity === 'notice'
          ? 'notice'
          : null

  const visual = (icon: Mark, tone: string, label: string, spin = false) => ({ icon, tone, label, spin })

  if (summary.state === 'CANCELLED') return visual(ShieldBan, 'idle', 'Cancelled')
  if ((summary.totalChecks ?? 0) > 0 && summary.notApplicableChecks === summary.totalChecks) {
    return visual(ShieldMinus, 'idle', 'No applicable checks')
  }
  switch (summary.state) {
    case 'NEVER_RUN':
      return visual(Shield, 'idle', 'Never run')
    case 'ALL_DISABLED':
      return visual(ShieldOff, 'idle', 'All checks disabled')
    case 'QUEUED':
      return visual(LoaderCircle, 'progress', 'Queued', true)
    case 'RUNNING':
      return visual(LoaderCircle, 'progress', 'Running', true)
    case 'PASSED':
      return visual(ShieldCheck, 'ok', 'Passed')
    case 'EXECUTION_FAILED':
      return visual(ShieldX, 'bad', 'Run failed')
    case 'RESTRICTED':
      return visual(ShieldBan, 'warn', 'Restricted')
    case 'ISSUES':
      return visual(ShieldAlert, severity ?? 'warn', 'Issues found')
  }
}

export const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

export const initials = (name: string) =>
  name
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase())
    .join('')

/** The host's own Triggers glyph, so an active refresh reads the same here as it does there. */
export const scheduleLabel = (schedule: { total: number; active: number; cron?: string; nextRun?: string }) =>
  schedule.active === 0
    ? `${count(schedule.total, 'scheduled trigger')}, none of them active`
    : `${count(schedule.total, 'scheduled trigger')}, ${schedule.active} active${
        schedule.cron ? ` (${schedule.cron})` : ''
      }${schedule.nextRun ? `, next ${ago(schedule.nextRun)}` : ''}`

/**
 * A Looker Studio report is a live connection rather than a document someone titled, so its own
 * name says nothing; the data mart behind it is the useful label.
 */
export const reportName = (report: Report) =>
  (report.destinationType === 'LOOKER_STUDIO' ? report.martTitle : undefined) ?? report.title

export const runTone = (status?: string) => (status === 'ERROR' ? 'bad' : status === 'SUCCESS' ? 'ok' : 'idle')

export function freshnessTone(mart: Mart) {
  const coverage = mart.freshness?.coverage
  if (!mart.freshness?.dataLastUpdatedAt || coverage === 'unavailable') return 'idle'
  return coverage === 'partial' ? 'warn' : 'ok'
}

export function freshnessLabel(mart: Mart) {
  const at = mart.freshness?.dataLastUpdatedAt
  if (!at) return 'Freshness: unknown'
  const coverage = mart.freshness?.coverage
  return `Data last updated ${ago(at)}${coverage && coverage !== 'complete' ? ` (${coverage})` : ''}`
}

/** "3 hours ago", from a timestamp — enough for a tooltip, without a date library. */
export function ago(iso: string) {
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
