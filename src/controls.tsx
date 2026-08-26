// The controls a block carries: its chrome, its search box, its filter menus.
import { ChevronDown, Info, Search } from 'lucide-react'
import type { Mark } from './icons'

export function Block({
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
