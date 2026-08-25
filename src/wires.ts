// The lines between the cards, and the highlight that reads them.
//
// Ported from owox.com's /admin/model canvas: an absolutely positioned SVG under the cards, one
// bezier per wire, redrawn from the live element boxes whenever the grid reflows. Hovering a card
// isolates it and its lines; clicking pins that state so the pointer can leave.
import { useEffect, type RefObject } from 'react'
import type { Wire } from './owox'

const NS = 'http://www.w3.org/2000/svg'

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

export function useWires(canvasRef: RefObject<HTMLDivElement | null>, wires: Wire[]) {
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
        if (a && b) path.setAttribute('d', curve(a, b))
      }
    }

    // Fires on first paint, on resize, and again when the webfont lands and the cards reflow.
    const observer = new ResizeObserver(layout)
    observer.observe(canvas)

    // Queried on demand, not once: "load more" adds cards after this effect has run, and they must
    // light and dim with the rest.
    const cards = () => canvas.querySelectorAll<HTMLElement>('[data-node]')
    const focus = (card: HTMLElement | null) => {
      canvas.classList.toggle('focused', Boolean(card))
      const near = neighbours.get(card?.id ?? '') ?? new Set<string>()
      for (const el of cards()) el.classList.toggle('lit', Boolean(card) && (el === card || near.has(el.id)))
      for (const path of paths) {
        const on = Boolean(card) && (path.dataset.from === card?.id || path.dataset.to === card?.id)
        path.classList.toggle('lit', on)
      }
    }

    // A pinned card outranks the pointer: hovering elsewhere leaves it alone. Clicking it again,
    // or clicking another card, is the only thing that moves the pin.
    let pinned: HTMLElement | null = null
    const pin = (card: HTMLElement) => {
      pinned = pinned === card ? null : card
      for (const el of cards()) el.setAttribute('aria-pressed', String(el === pinned))
      focus(pinned ?? card)
    }

    const enter = (e: Event) => {
      if (pinned) return
      focus((e.target as HTMLElement).closest<HTMLElement>('[data-node]'))
    }
    const leave = () => pinned || focus(null)
    const click = (e: MouseEvent) => {
      // The card's own link is there to be followed, not to pin the card.
      if ((e.target as HTMLElement).closest('a')) return
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-node]')
      if (card) pin(card)
    }
    const keydown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-node]')
      if (!card || e.target !== card) return
      e.preventDefault() // Space would scroll the canvas out from under the pin.
      pin(card)
    }

    canvas.addEventListener('pointerover', enter)
    canvas.addEventListener('focusin', enter)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('click', click)
    canvas.addEventListener('keydown', keydown)

    return () => {
      observer.disconnect()
      canvas.removeEventListener('pointerover', enter)
      canvas.removeEventListener('focusin', enter)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('click', click)
      canvas.removeEventListener('keydown', keydown)
      canvas.classList.remove('focused')
      for (const path of paths) path.remove()
    }
  }, [canvasRef, wires])
}
