// The controls a block carries: its chrome, its search box, its filter menus.
import { ChevronDown, Info, Search } from 'lucide-react'
import { num } from './format'
import type { Mark } from './icons'

export function Block({
  icon: Icon,
  title,
  count: total,
  hint,
  toolbar,
  action,
  loading,
  folded,
  onFold,
  id,
  lit,
  children,
}: {
  icon: Mark
  title: string
  count?: number
  hint: string
  toolbar?: React.ReactNode
  /** Sits beside the count: something to do to everything the block holds. */
  action?: React.ReactNode
  /** 0–1 while the project is still being read: the block stays folded and shows a bar instead. */
  loading?: number | null
  /** Folded by the reader rather than by the load: header only, and its controls go with the cards. */
  folded?: boolean
  onFold?: () => void
  /** Set when the block itself is one end of a wire, as the Data Marts block is for the exits. */
  id?: string
  lit?: boolean
  children: React.ReactNode
}) {
  return (
    <section id={id} data-band={id === undefined ? undefined : ''} className={`dm-band${lit ? ' lit' : ''}`}>
      <header className="dm-band-head">
        <span className="dm-band-icon">
          <Icon size={18} />
        </span>
        <h2 className="dm-band-title">{title}</h2>
        {total !== undefined && <span className="dm-badge dm-band-count">{num(total)}</span>}
        {action}
        <span className="dm-hint" tabIndex={0} role="note" aria-label={hint}>
          <Info size={14} />
          <span className="dm-hint-body">{hint}</span>
        </span>
        {/* Filtering what you cannot see answers nothing, so the controls fold with the cards. */}
        {toolbar && !folded && <div className="dm-band-tools">{toolbar}</div>}
        {onFold && (
          <button
            type="button"
            className={`dm-band-fold${toolbar && !folded ? '' : ' dm-band-fold-alone'}`}
            onClick={onFold}
            aria-expanded={!folded}
            aria-label={folded ? `Show ${title}` : `Hide ${title}`}
            title={folded ? `Show ${title}` : `Hide ${title}`}
          >
            <ChevronDown size={16} className={folded ? undefined : 'dm-band-fold-open'} />
          </button>
        )}
      </header>
      {folded ? null : loading === null || loading === undefined ? (
        <div className="dm-band-grid">{children}</div>
      ) : (
        <div
          className={`dm-loadbar${loading >= 1 ? ' dm-loadbar-done' : ''}`}
          role="progressbar"
          aria-label="Reading the project"
          aria-valuenow={Math.round(loading * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${Math.round(loading * 100)}%` }} />
        </div>
      )}
    </section>
  )
}

export function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
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
export function MultiSelect({
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
  const all = selected.length === options.length
  // An empty menu asks for nothing, and says so.
  const summary = all ? 'All' : selected.length === 0 ? 'None' : selected.length
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
        <span className={typeof summary === 'string' ? 'dm-filter-all' : 'dm-filter-count'}>{summary}</span>
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
                {option.count !== undefined && <span className="dm-badge">{num(option.count)}</span>}
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
