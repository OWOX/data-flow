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
import type { Mart, QualitySummary, Report, Tone } from './owox'

/**
 * The data quality status icon, straight out of the host's `getDataQualityStatusVisual` — same
 * shields, same labels, same tone per state, so a mart reads the same here as on its own canvas.
 */
export function qualityVisual(summary?: QualitySummary): { icon: Mark; tone: Tone; label: string; spin: boolean } {
  if (!summary) return { icon: Shield, tone: 'idle', label: 'Unknown', spin: false }
  const severity =
    (summary.errorFindings ?? 0) > 0 || summary.highestSeverity === 'error'
      ? 'bad'
      : (summary.warningFindings ?? 0) > 0 || summary.highestSeverity === 'warning'
        ? 'warn'
        : (summary.noticeFindings ?? 0) > 0 || summary.highestSeverity === 'notice'
          ? 'notice'
          : null

  const visual = (icon: Mark, tone: Tone, label: string, spin = false) => ({ icon, tone, label, spin })

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

/**
 * Every number the page shows, grouped by the reader's own locale.
 *
 * A project with four figures of data marts reads as a year otherwise, and the separator is not
 * a comma everywhere.
 */
export const num = (n: number) => n.toLocaleString()

export const count = (n: number, noun: string) => `${num(n)} ${noun}${n === 1 ? '' : 's'}`

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


/**
 * What each coverage means, in the host's own words.
 *
 * Coverage says how much of the mart could be measured, never whether anything is wrong — which is
 * why the host paints this clock one fixed grey and lets the tooltip do the talking.
 */
const COVERAGE: Record<string, string> = {
  complete: 'All source tables were checked.',
  partial: 'Some source tables could not be checked — the actual time can only be more recent.',
  unavailable: 'The storage did not report when the source tables last changed.',
}

/**
 * The Data Last Updated tooltip, line by line — and empty when there is nothing to tell.
 *
 * It is a measurement someone has to ask for rather than something every mart carries, so an
 * unmeasured mart has no mark at all: an icon whose only word is "not checked yet" is a row of
 * identical glyphs saying nothing.
 */
export function freshnessLines(mart: Mart): string[] {
  const { dataLastUpdatedAt, coverage, computedAt, sources } = mart.freshness ?? {}
  if (!computedAt && !dataLastUpdatedAt) return []
  return [
    dataLastUpdatedAt
      ? `Source tables last changed: ${ago(dataLastUpdatedAt)}`
      : 'The storage did not report a modification time.',
    ...(computedAt ? [`Checked ${ago(computedAt)}`] : []),
    ...(coverage && COVERAGE[coverage] ? [COVERAGE[coverage]] : []),
    ...(sources ?? []).map(
      source => `${source.table} — ${source.dataLastUpdatedAt ? ago(source.dataLastUpdatedAt) : (source.note ?? 'unknown')}`,
    ),
    'Reflects when source tables were written to, not which period the data covers.',
  ]
}

/** The host's own sentence for each quality state, keyed by the label its icon already carries. */
const QUALITY: Record<string, string> = {
  'Never run': 'Data Quality has not been checked yet',
  'All checks disabled': 'Data Quality checks are disabled',
  'No applicable checks': 'No applicable Data Quality checks',
  Queued: 'Data Quality check queued',
  Running: 'Data Quality check running',
  Passed: 'Data Quality checks passed',
  'Issues found': 'Data Quality issues found',
  'Run failed': 'Data Quality check failed',
  Restricted: 'Data Quality run restricted',
  Cancelled: 'Data Quality check cancelled',
  Unknown: 'Data Quality could not be read',
}

export const qualityLine = (label: string) => QUALITY[label] ?? label

/**
 * What a thing is shared for, in OWOX's own words.
 *
 * Two independent grants everywhere, and the second one is named differently by what holds it: a
 * data mart is shared for reporting, a storage and a destination for use. Shared for neither says
 * nothing rather than "not shared" — the absence of a badge is already that.
 */
export const sharedFor = (maintenance: boolean, granted: boolean, name: string) =>
  maintenance && granted
    ? `Shared for ${name} & maintenance`
    : maintenance
      ? 'Shared for maintenance'
      : granted
        ? `Shared for ${name}`
        : undefined

/** How many of the mart's checks came back clean, when it has run enough to know. */
export function qualityChecks(summary?: QualitySummary) {
  const total = summary?.totalChecks ?? 0
  if (total === 0 || summary?.passedChecks === undefined) return []
  return [`${summary.passedChecks} of ${count(total, 'check')} passed`]
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

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
      return RELATIVE.format(Math.round(value), unit)
    }
    value /= span
  }
  return iso
}
