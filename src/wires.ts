// The lines between the cards, and the highlight that reads them.
//
// Ported from owox.com's /admin/model canvas: an absolutely positioned SVG under the cards, one
// bezier per wire, redrawn from the live element boxes whenever the grid reflows. Hovering a card
// isolates it and its lines; clicking pins that state so the pointer can leave.
import { useEffect, useRef, type RefObject } from 'react'
import type { Wire } from './owox'

const NS = 'http://www.w3.org/2000/svg'

/** What each line is, for the tooltip it carries — lines pass under cards, so they must say. */
const MEANING: Record<Wire['kind'], string> = {
  source: 'Source → storage: the connector pulls into it',
  held: 'Storage → data mart: the storage this mart lives in',
  relationship: 'Relationship: a join between two data marts',
  report: 'Route: a report runs this data mart into that destination',
  dormant: 'Route never run: the report exists, but has never carried data',
  run: 'Destination → report: a report that writes to it',
  direct: 'Data mart → report: where it writes is not visible from here',
  exit: 'Every data mart in the project is readable here',
}

/** A wire is the same wire whichever end you name first. */
const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * What one card lights: its own wires, and every whole chain it sits on — so a report reaches up
 * through its destination to the data mart that feeds it, and on to that mart's source, without
 * lighting every other mart hanging off the same destination.
 */
/**
 * Which wires and chains touch each id, built once per model.
 *
 * `reach` runs on every hover, and scanning four thousand chains and four thousand wires each time
 * is four thousand comparisons to find the handful that matter. The model's arrays are stable, so
 * the index is keyed on them and outlives the hover.
 */
const indexed = new WeakMap<object, { by: Map<string, string[]>; chains: Map<string, string[][]> }>()

function indexOf(wires: Wire[], chains: string[][]) {
  let index = indexed.get(chains)
  if (!index) {
    const by = new Map<string, string[]>()
    const add = (key: string, value: string) => by.set(key, [...(by.get(key) ?? []), value])
    for (const wire of wires) {
      add(wire.from, wire.to)
      add(wire.to, wire.from)
    }
    const byChain = new Map<string, string[][]>()
    for (const chain of chains) {
      for (const node of new Set(chain)) byChain.set(node, [...(byChain.get(node) ?? []), chain])
    }
    index = { by, chains: byChain }
    indexed.set(chains, index)
  }
  return index
}

export function reach(wires: Wire[], chains: string[][], id: string) {
  const index = indexOf(wires, chains)
  const lit = new Set<string>([id])
  const links = new Set<string>()
  for (const other of index.by.get(id) ?? []) lit.add(other)
  for (const chain of index.chains.get(id) ?? []) {
    for (const [i, node] of chain.entries()) {
      lit.add(node)
      if (i > 0) links.add(pair(chain[i - 1], node))
    }
  }
  return { lit, links }
}

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number }

/** Leave each box from the side that faces the other one: down/up across bands, sideways within one. */
function curve(a: Box, b: Box) {
  if (b.top - a.bottom > 8 || a.top - b.bottom > 8) {
    const down = b.top > a.bottom
    const x1 = a.left + a.width / 2
    const y1 = down ? a.bottom : a.top
    const x2 = b.left + b.width / 2
    const y2 = down ? b.top : b.bottom
    const pull = Math.min(70, Math.abs(y2 - y1) / 2 + 12)
    return `M${x1} ${y1} C${x1} ${down ? y1 + pull : y1 - pull} ${x2} ${down ? y2 - pull : y2 + pull} ${x2} ${y2}`
  }
  const right = b.left + b.width / 2 > a.left + a.width / 2
  const x1 = right ? a.right : a.left
  const x2 = right ? b.left : b.right
  const y1 = a.top + a.height / 2
  const y2 = b.top + b.height / 2
  const pull = Math.max(30, Math.abs(x2 - x1) / 2)
  return `M${x1} ${y1} C${right ? x1 + pull : x1 - pull} ${y1} ${right ? x2 - pull : x2 + pull} ${y2} ${x2} ${y2}`
}

/**
 * @param revision changes whenever the visible set of cards does — a filter, a "load more". The
 *   paths are rebuilt and re-measured from scratch, which is what keeps a line from a card that has
 *   just been filtered away from hanging in mid-air.
 * @param pinned id of the pinned card, owned by React because the page reads it too.
 */
export function useWires(
  canvasRef: RefObject<HTMLDivElement | null>,
  wires: Wire[],
  chains: string[][],
  revision: unknown,
  pinned: string | null,
  onPin: (id: string | null) => void,
) {
  // Survives the effect being rebuilt, so unpinning hands the highlight back to whatever the
  // pointer is still resting on rather than going dark until it moves.
  const hovered = useRef<string | null>(null)
  /**
   * The drawn lines, kept across a selection change.
   *
   * Building them belongs to the set of cards on the page; lighting them belongs to what is
   * chosen. Those were one effect, so every click destroyed and rebuilt every path — four and a
   * half thousand elements on a large project, before anything could be drawn.
   */
  const drawn = useRef<SVGPathElement[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const svg = canvas?.querySelector<SVGSVGElement>('#wires')
    if (!canvas || !svg) return

    const paths = (drawn.current = wires.map(wire => {
      const path = document.createElementNS(NS, 'path')
      path.setAttribute('class', wire.kind)
      path.setAttribute('marker-end', 'url(#arrowhead)')
      path.dataset.from = wire.from
      path.dataset.to = wire.to
      const title = document.createElementNS(NS, 'title')
      title.textContent = MEANING[wire.kind]
      path.append(title)
      svg.append(path)
      return path
    }))

    const neighbours = new Map<string, Set<string>>()
    const link = (a: string, b: string) => neighbours.set(a, (neighbours.get(a) ?? new Set()).add(b))
    for (const wire of wires) {
      link(wire.from, wire.to)
      link(wire.to, wire.from)
    }

    const layout = () => {
      const origin = canvas.getBoundingClientRect()
      /**
       * Which block stands in for a card that is not on the page.
       *
       * A folded block still holds its cards, so a line to one of them ends at the block rather
       * than disappearing — the canvas stays connected, and folding hides detail without hiding
       * the shape. Read from the DOM each layout, since folding changes it.
       */
      /**
       * What stands in for a card that is not on the page.
       *
       * A folded block, for the cards it has put away — and a block's "load more" card, for the
       * ones its page has not reached. Nothing stands in for a card a filter excluded: that card
       * is not hidden, it is not wanted.
       */
      const bands = [
        ...canvas.querySelectorAll<HTMLElement>('[data-band][data-holds].folded, [data-standin][data-holds]'),
      ].flatMap(band => (band.dataset.holds ?? '').split(',').map(prefix => [prefix, band] as const))
      const standIn = (id: string) => bands.find(([prefix]) => id.startsWith(prefix))?.[1] ?? null

      const at = (id?: string): { el: Element; box: Box } | null => {
        const el = id ? (canvas.querySelector(`#${CSS.escape(id)}`) ?? standIn(id)) : null
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          el,
          box: {
            left: r.left - origin.left,
            right: r.right - origin.left,
            top: r.top - origin.top,
            bottom: r.bottom - origin.top,
            width: r.width,
            height: r.height,
          },
        }
      }
      /**
       * One line per pair of things actually on the page.
       *
       * Thousands of wires can end at the same stand-in — every data mart a storage holds, every
       * one past the page — and drawn separately they are thousands of identical curves between
       * the same two boxes. The first claims the pair; the rest say the same thing and are left
       * undrawn, which costs nothing and looks no different.
       */
      const drawnPairs = new Set<string>()
      const seat = new Map<Element, number>()
      const numbered = (el: Element) => seat.get(el) ?? (seat.set(el, seat.size), seat.size - 1)
      for (const path of paths) {
        const a = at(path.dataset.from)
        const b = at(path.dataset.to)
        // A card the filter has hidden ends its lines rather than leaving them drawn to a ghost,
        // and a line whose ends have folded into the same block would be a loop on one box.
        const pairKey = a && b ? `${numbered(a.el)}>${numbered(b.el)}` : null
        if (a && b && a.el !== b.el && pairKey !== null && !drawnPairs.has(pairKey)) {
          drawnPairs.add(pairKey)
          path.setAttribute('d', curve(a.box, b.box))
        } else path.removeAttribute('d')
      }
    }

    // Fires on first paint, on resize, and again when the webfont lands and the cards reflow.
    const observer = new ResizeObserver(layout)
    observer.observe(canvas)

    /**
     * A card growing back out of a point never changes the layout, so nothing above would fire.
     *
     * `getBoundingClientRect` reports the transformed box, so a line drawn mid-animation ends at
     * the point the card is scaled to — right while it moves, wrong once it stops. One pass after
     * the last card settles, folded into a frame so twenty-five endings cost one.
     */
    let queued = false
    const settle = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        layout()
      })
    }
    canvas.addEventListener('animationend', settle)

    // A whole block can be one end of a wire, so it lights like a card — but it is not one, and
    // the click handler still only ever selects `[data-node]`.
    return () => {
      observer.disconnect()
      canvas.removeEventListener('animationend', settle)
      for (const path of paths) path.remove()
    }
  }, [canvasRef, wires, revision])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const paths = drawn.current

    const cards = () => canvas.querySelectorAll<HTMLElement>('[data-node], [data-band]')

    /**
     * Hover lighting only.
     *
     * A pinned card's lighting is rendered by the page: React rewrites `className` and
     * `aria-pressed` on every re-render, so anything written here by hand would be wiped the next
     * time a filter, a search or a drag re-rendered the block.
     */
    const focus = (id: string | null) => {
      canvas.classList.toggle('focused', Boolean(id))
      const { lit, links } = id
        ? reach(wires, chains, id)
        : { lit: new Set<string>(), links: new Set<string>() }
      // What is actually on the page, asked once rather than once per band per lit id.
      const onPage = new Set([...canvas.querySelectorAll<HTMLElement>('[data-node]')].map(el => el.id))
      for (const el of cards()) {
        // A folded block stands in for the cards it holds, so it takes the border those cards
        // would have taken: the line ends somewhere visible, and says where.
        const holds = el.classList.contains('folded') ? el.dataset.holds?.split(',') : undefined
        const standsIn =
          holds !== undefined &&
          [...lit].some(node => !onPage.has(node) && holds.some(prefix => node.startsWith(prefix)))
        el.classList.toggle('lit', lit.has(el.id) || standsIn)
      }
      for (const path of paths) {
        const from = path.dataset.from ?? ''
        const to = path.dataset.to ?? ''
        const on = Boolean(id) && (from === id || to === id || links.has(pair(from, to)))
        path.classList.toggle('lit', on)
        // Direction is read from the card in hand: a line that leaves it is solid, one that
        // arrives at it is dashed. A line lit through a chain touches neither end, and stays solid.
        path.classList.toggle('outbound', on && from === id)
        path.classList.toggle('inbound', on && to === id)
      }
    }
    focus(pinned ?? hovered.current)

    // A pinned card outranks the pointer: hovering elsewhere leaves it alone.
    const enter = (e: Event) => {
      hovered.current = (e.target as HTMLElement).closest<HTMLElement>('[data-node]')?.id ?? null
      if (pinned) return
      focus(hovered.current)
    }
    const leave = () => {
      hovered.current = null
      if (!pinned) focus(null)
    }
    const click = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Links and controls are there to be used, not to move the pin — and a block header is one
      // of them now, since its empty space folds the block. Putting cards away is not a reason to
      // forget which one was chosen: unfolding hands the selection back exactly as it was.
      if (target.closest('a, button, summary, input, label, .dm-band-head')) return
      const card = target.closest<HTMLElement>('[data-node]')
      if (card) onPin(card.id === pinned ? null : card.id)
      // Anything that is not a card clears the selection: the gaps between them, a block's own
      // empty space, the page around them all.
      else if (pinned) onPin(null)
    }
    const keydown = (e: KeyboardEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-node]')
      if (e.key === 'Escape' && pinned) return onPin(null)
      if (e.key !== 'Enter' && e.key !== ' ') return
      if (!card || e.target !== card) return
      e.preventDefault() // Space would scroll the canvas out from under the pin.
      onPin(card.id === pinned ? null : card.id)
    }

    canvas.addEventListener('pointerover', enter)
    canvas.addEventListener('focusin', enter)
    canvas.addEventListener('pointerleave', leave)
    document.addEventListener('click', click)
    document.addEventListener('keydown', keydown)

    return () => {
      canvas.removeEventListener('pointerover', enter)
      canvas.removeEventListener('focusin', enter)
      canvas.removeEventListener('pointerleave', leave)
      document.removeEventListener('click', click)
      document.removeEventListener('keydown', keydown)
      canvas.classList.remove('focused')
    }
  }, [canvasRef, wires, chains, revision, pinned, onPin])
}
