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
  held: 'Storage → data mart: the storage this mart lives in — the block itself when that storage is not one you can see',
  relationship: 'Relationship: a join between two data marts',
  report: 'Route: a report runs this data mart into that destination',
  dormant: 'Route never run: the report exists, but has never carried data',
  run: 'Destination → report: a report that writes to it — the block itself when that destination is not one you can see',
  exit: 'Every data mart in the project is readable here',
}

/** A wire is the same wire whichever end you name first. */
const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * What stands in for a card that is not on the page, and which cards each stands for.
 *
 * A folded block, for the cards it has put away, and a block's "load more" card, for the ones its
 * page has not reached. Nothing stands in for a card a filter excluded: that card is not hidden,
 * it is unwanted. One definition, because both drawing a line to a stand-in and lighting it have
 * to agree about which it is.
 */
const standIns = (canvas: HTMLElement) =>
  [
    ...canvas.querySelectorAll<HTMLElement>('[data-band][data-holds].folded, [data-standin][data-holds]'),
  ].flatMap(el => (el.dataset.holds ?? '').split(',').map(prefix => [prefix, el] as const))

/**
 * Everything on the page a wire can end at, by id.
 *
 * Cards, and the blocks themselves — a block is one end of the exit wires, which is how Claude,
 * ChatGPT and the API reach every data mart at once with a single line each. Looking cards up by
 * `querySelector` used to find those too, being a search of the whole page; a map built from
 * `[data-node]` alone quietly lost them.
 */
const onPage = (canvas: HTMLElement) => {
  const found = new Map<string, HTMLElement>()
  for (const el of canvas.querySelectorAll<HTMLElement>('[data-node], [data-band]')) found.set(el.id, el)
  return found
}

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
  /**
   * Which path actually carries each wire's line.
   *
   * Thousands of wires collapse onto a handful of lines — a storage holding a thousand data marts
   * has one wire to each, and with twenty-five of them on the page the rest all end at the block,
   * so 1,091 wires resolve to 26 curves. Drawing every one of them meant a thousand identical
   * strokes stacked on the same pixels, each with its own arrowhead and its own opacity
   * transition, all fading in together the moment the pointer crossed the card. That is what made
   * the canvas blink.
   *
   * So one path per pair of boxes is drawn and the rest carry no `d` at all, and every wire is
   * mapped to the one that stands for it. Lighting follows the map, which is what keeps this from
   * being the old "first wire claims the pair" — that dropped the rest instead of pointing them
   * somewhere, and a wire lit by its own ends had no line to light.
   */
  const leads = useRef(new Map<SVGPathElement, SVGPathElement>())
  /**
   * Light again, now that the lines have moved.
   *
   * Which path carries a wire is decided by measuring, and measuring happens in a
   * `ResizeObserver` callback — after the effect below has already lit what it thought was there.
   * On the first pass that map is empty and every wire resolves to nothing, so a selection drew no
   * lines at all; on a later pass a path that had been lit can hand its line to another one. Both
   * are the same fault: lighting has to happen after the measuring, not before it, so measuring
   * asks for it rather than assuming it already happened. Only opacity and stroke width change, so
   * this cannot bring the observer back round.
   */
  const relight = useRef(() => {})

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
      const bands = standIns(canvas)
      const standIn = (id: string) => bands.find(([prefix]) => id.startsWith(prefix))?.[1] ?? null

      // Asked for once: a `querySelector` per endpoint was thousands of walks over the same
      // document to find the hundred or so elements actually there.
      const cards = onPage(canvas)

      /** And measured once. Thousands of wires end at the same stand-in; its box does not move. */
      const boxes = new Map<Element, Box>()
      const boxOf = (el: Element) => {
        const known = boxes.get(el)
        if (known) return known
        const r = el.getBoundingClientRect()
        const box = {
          left: r.left - origin.left,
          right: r.right - origin.left,
          top: r.top - origin.top,
          bottom: r.bottom - origin.top,
          width: r.width,
          height: r.height,
        }
        boxes.set(el, box)
        return box
      }

      const at = (id?: string): { el: Element; box: Box } | null => {
        const el = id ? (cards.get(id) ?? standIn(id)) : null
        return el ? { el, box: boxOf(el) } : null
      }
      /**
       * One curve per pair of things on the page, given to every wire that runs between them.
       *
       * Thousands of wires can end at the same stand-in — every data mart a storage holds, every
       * report past the page — and they are all the same curve between the same two boxes, so it
       * is worked out once and shared.
       *
       * Shared, not skipped. Letting the first wire claim the pair and dropping the rest looked
       * identical while nothing was selected and was wrong the moment something was: a wire is lit
       * by its own ends, so hovering a data mart lit its own wire to the "load more" card while the
       * one actually carrying the curve belonged to some other report and stayed dark. No line at
       * all, for a link that exists.
       */
      const lead = leads.current
      lead.clear()
      const carrier = new Map<string, SVGPathElement>()
      const seat = new Map<Element, number>()
      const numbered = (el: Element) => seat.get(el) ?? (seat.set(el, seat.size), seat.size - 1)
      /** Nothing to draw any more, so nothing left lit either. */
      const blank = (path: SVGPathElement) => {
        path.removeAttribute('d')
        path.classList.remove('lit', 'outbound', 'inbound')
      }
      for (const path of paths) {
        const a = at(path.dataset.from)
        const b = at(path.dataset.to)
        // A card the filter has hidden ends its lines rather than leaving them drawn to a ghost,
        // and a line whose ends have folded into the same block would be a loop on one box.
        if (!a || !b || a.el === b.el) {
          blank(path)
          continue
        }
        // Which way round matters: the arrowhead is on one end.
        const key = `${numbered(a.el)}>${numbered(b.el)}`
        const held = carrier.get(key)
        if (held) {
          blank(path)
          lead.set(path, held)
        } else {
          path.setAttribute('d', curve(a.box, b.box))
          carrier.set(key, path)
          lead.set(path, path)
        }
      }
      relight.current()
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

  /**
   * Lighting and input, over the lines the effect above drew.
   *
   * `revision` is in the dependencies and read nowhere in the body, which reads like something to
   * delete. It is not: `drawn.current` is captured here, and the effect above replaces that array
   * whenever `revision` changes. Without it this effect would go on lighting paths that had been
   * removed from the page.
   */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const paths = drawn.current

    const cards = () => canvas.querySelectorAll<HTMLElement>('[data-node], [data-band], [data-standin]')

    /**
     * Which paths a card lights, and which a chain lights, worked out once for the whole effect.
     *
     * There is one path per wire, and a project can have thousands — a storage alone has one to
     * every data mart it holds. Asking each of them "is it me?" on every pointer move, and writing
     * three classes on it either way, was tens of thousands of style invalidations a second while
     * the pointer crossed a row of storages. Chrome falls behind that and starts dropping the
     * tiles it has already rastered, which is a page that goes white below wherever it gave up
     * while the cards under it still answer the mouse.
     */
    const byId = new Map<string, SVGPathElement[]>()
    const byPair = new Map<string, SVGPathElement[]>()
    const file = (index: Map<string, SVGPathElement[]>, key: string, path: SVGPathElement) => {
      const kept = index.get(key)
      if (kept) kept.push(path)
      else index.set(key, [path])
    }
    for (const path of paths) {
      const from = path.dataset.from ?? ''
      const to = path.dataset.to ?? ''
      file(byId, from, path)
      file(byId, to, path)
      file(byPair, pair(from, to), path)
    }
    /** The paths currently carrying the classes, so putting them out costs their own number. */
    let alight: SVGPathElement[] = []

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
      // What is on the page, asked once rather than once per stand-in per lit id.
      const here = onPage(canvas)
      const stands = standIns(canvas)
      const missing = [...lit].filter(node => !here.has(node))
      for (const el of cards()) {
        // Whatever stands in for a lit card takes the border that card would have taken, so the
        // line ends somewhere visible and says where: a folded block, or the page's own
        // "load more" card.
        const standsFor = stands.some(
          ([prefix, standIn]) => standIn === el && missing.some(node => node.startsWith(prefix)),
        )
        el.classList.toggle('lit', lit.has(el.id) || standsFor)
      }
      for (const path of alight) path.classList.remove('lit', 'outbound', 'inbound')
      alight = []
      if (id === null) return
      const lead = leads.current
      // A thousand wires between the same two boxes light the one line that stands for them all.
      const on = new Set<SVGPathElement>()
      // Direction is read from the card in hand: a line that leaves it is solid, one that arrives
      // at it is dashed. A line lit through a chain touches neither end, and stays solid.
      for (const path of byId.get(id) ?? []) {
        const line = lead.get(path)
        if (!line || on.has(line)) continue
        on.add(line)
        line.classList.add('lit', path.dataset.from === id ? 'outbound' : 'inbound')
        alight.push(line)
      }
      for (const key of links) {
        for (const path of byPair.get(key) ?? []) {
          const line = lead.get(path)
          // A line can be both an end of the pinned card and a link on its chain; already on.
          if (!line || on.has(line)) continue
          on.add(line)
          line.classList.add('lit')
          alight.push(line)
        }
      }
    }

    /**
     * One update a frame.
     *
     * `pointerover` fires per card crossed, so sweeping a row of storages asks for a dozen
     * relightings inside one frame and only the last one is ever seen. Coalescing them is what
     * keeps a fast pointer from being more work than a slow one.
     */
    let wanted: string | null = null
    let queued = 0
    const relight = (id: string | null) => {
      wanted = id
      queued ||= requestAnimationFrame(() => {
        queued = 0
        focus(wanted)
      })
    }
    relight.current = () => focus(hovered.current ?? pinned)
    focus(hovered.current ?? pinned)

    // The pointer outranks the selection while it rests on a card, and hands it straight back when
    // it moves off one: a selection that made every other card unreadable was answering a question
    // nobody asked twice.
    const enter = (e: Event) => {
      hovered.current = (e.target as HTMLElement).closest<HTMLElement>('[data-node]')?.id ?? null
      relight(hovered.current ?? pinned)
    }
    const leave = () => {
      hovered.current = null
      relight(pinned)
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
      cancelAnimationFrame(queued)
      relight.current = () => {}
      canvas.removeEventListener('pointerover', enter)
      canvas.removeEventListener('focusin', enter)
      canvas.removeEventListener('pointerleave', leave)
      document.removeEventListener('click', click)
      document.removeEventListener('keydown', keydown)
      canvas.classList.remove('focused')
    }
  }, [canvasRef, wires, chains, revision, pinned, onPin])
}
