// The lines between the cards, and the highlight that reads them.
//
// Ported from owox.com's /admin/model canvas: an absolutely positioned SVG under the cards, one
// bezier per wire, redrawn from the live element boxes whenever the grid reflows. Hovering a card
// isolates it and its lines; clicking pins that state so the pointer can leave.
import { useEffect, type RefObject } from 'react'
import type { Wire } from './owox'

const NS = 'http://www.w3.org/2000/svg'

/** A wire is the same wire whichever end you name first. */
const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

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
  useEffect(() => {
    const canvas = canvasRef.current
    const svg = canvas?.querySelector<SVGSVGElement>('#wires')
    if (!canvas || !svg) return

    const paths = wires.map(wire => {
      const path = document.createElementNS(NS, 'path')
      path.setAttribute('class', wire.kind)
      path.setAttribute('marker-end', 'url(#arrowhead)')
      path.dataset.from = wire.from
      path.dataset.to = wire.to
      svg.append(path)
      return path
    })

    const neighbours = new Map<string, Set<string>>()
    const link = (a: string, b: string) => neighbours.set(a, (neighbours.get(a) ?? new Set()).add(b))
    for (const wire of wires) {
      link(wire.from, wire.to)
      link(wire.to, wire.from)
    }

    const layout = () => {
      const origin = canvas.getBoundingClientRect()
      const at = (id?: string): Box | null => {
        const el = id ? canvas.querySelector(`#${CSS.escape(id)}`) : null
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          left: r.left - origin.left,
          right: r.right - origin.left,
          top: r.top - origin.top,
          bottom: r.bottom - origin.top,
          width: r.width,
          height: r.height,
        }
      }
      for (const path of paths) {
        const a = at(path.dataset.from)
        const b = at(path.dataset.to)
        // A card the filter has hidden ends its lines rather than leaving them drawn to a ghost.
        if (a && b) path.setAttribute('d', curve(a, b))
        else path.removeAttribute('d')
      }
    }

    // Fires on first paint, on resize, and again when the webfont lands and the cards reflow.
    const observer = new ResizeObserver(layout)
    observer.observe(canvas)

    const cards = () => canvas.querySelectorAll<HTMLElement>('[data-node]')

    /**
     * What one card lights: its own wires, and every whole chain it sits on — so a report reaches
     * up through its destination and type to the data mart that feeds it, and on to that mart's
     * source, without lighting the other marts hanging off the same destination type.
     */
    const reach = (id: string) => {
      const lit = new Set<string>([id, ...(neighbours.get(id) ?? [])])
      const links = new Set<string>()
      for (const chain of chains) {
        if (!chain.includes(id)) continue
        for (const [i, node] of chain.entries()) {
          lit.add(node)
          if (i > 0) links.add(pair(chain[i - 1], node))
        }
      }
      return { lit, links }
    }

    const focus = (id: string | null) => {
      canvas.classList.toggle('focused', Boolean(id))
      const { lit, links } = id ? reach(id) : { lit: new Set<string>(), links: new Set<string>() }
      for (const el of cards()) {
        el.classList.toggle('lit', lit.has(el.id))
        el.setAttribute('aria-pressed', String(el.id === pinned))
      }
      for (const path of paths) {
        const from = path.dataset.from ?? ''
        const to = path.dataset.to ?? ''
        path.classList.toggle('lit', Boolean(id) && (from === id || to === id || links.has(pair(from, to))))
      }
    }
    focus(pinned)

    // A pinned card outranks the pointer: hovering elsewhere leaves it alone.
    const enter = (e: Event) => {
      if (pinned) return
      focus((e.target as HTMLElement).closest<HTMLElement>('[data-node]')?.id ?? null)
    }
    const leave = () => {
      if (!pinned) focus(null)
    }
    const click = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Links and controls are there to be used, not to move the pin.
      if (target.closest('a, button, summary, input, label')) return
      const card = target.closest<HTMLElement>('[data-node]')
      if (card) onPin(card.id === pinned ? null : card.id)
      // Clicking the page outside any block clears the selection.
      else if (pinned && !target.closest('.dm-band')) onPin(null)
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
      observer.disconnect()
      canvas.removeEventListener('pointerover', enter)
      canvas.removeEventListener('focusin', enter)
      canvas.removeEventListener('pointerleave', leave)
      document.removeEventListener('click', click)
      document.removeEventListener('keydown', keydown)
      canvas.classList.remove('focused')
      for (const path of paths) path.remove()
    }
  }, [canvasRef, wires, chains, revision, pinned, onPin])
}
