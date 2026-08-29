// Cards a reader can drag into their own order.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

export type DragProps = {
  draggable: true
  className?: string
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent) => void
}

/**
 * Cards a reader can put in their own order, within their own block.
 *
 * The order lives for the session only: the plugin declares no collections and the sandbox has no
 * storage, so there is nowhere to keep it. Until the first drop a block keeps the order it was
 * given; after that, cards it gains later — a "load more", a widened filter — fall in at the end
 * rather than landing in the middle of someone's arrangement.
 */
/** What a block hands to its cards: the items in order, and how to drag one. */
export type Cards<T> = { items: T[]; dragProps: (item: T) => DragProps; key: string }

/** Long enough to read as motion, short enough that nobody waits for it. */
const LEAVING_MS = 250

export function useReorder<T>(items: T[], idOf: (item: T) => string): Cards<T> {
  const [order, setOrder] = useState<string[]>([])
  /**
   * Cards on their way out.
   *
   * A card cannot collapse once it has been unmounted, so one that stops matching keeps its place
   * for as long as the animation lasts and then goes. It stays a real card while it shrinks — the
   * wires still find it, and `getBoundingClientRect` reports the box it is scaled to, so its lines
   * follow it into the point rather than snapping away before it has left.
   */
  /**
   * What the list is doing between one set of cards and the next.
   *
   * `leaving` shrinks away and holds its cell until it has; `entering` grows out of a point;
   * `turning` arrived into a cell another card has just vacated, and turns over in place instead —
   * a replacement is one event, not a departure and an arrival stacked on each other.
   */
  const [leaving, setLeaving] = useState<Array<{ item: T; at: number }>>([])
  const [entering, setEntering] = useState<Set<string>>(new Set())
  const [turning, setTurning] = useState<Set<string>>(new Set())
  /**
   * The cards that were here last time, and the timer that ends the transition.
   *
   * Both outlive the effect on purpose. Every caller passes `idOf` inline, so it is a new function
   * each render and the effect re-runs on every one — including the renders these very `set` calls
   * cause. An effect-scoped timer was cleaned up by that re-run, which then found nothing newly
   * gone and scheduled no replacement, so the cards stayed collapsed and kept their cells for good.
   */
  const was = useRef<T[]>(items)
  const settling = useRef<ReturnType<typeof setTimeout>>(undefined)

  /**
   * A layout effect, so the classes are on the elements before the browser paints. An ordinary one
   * lands a frame late and a card flashes at full size before it collapses to begin.
   *
   * Arrival is measured against the ids that were here before rather than against mounting:
   * folding a block unmounts every card and unfolding mounts them all again, and none of them
   * joined anything.
   */
  useLayoutEffect(() => {
    const before = was.current
    const here = items.map(idOf)
    const present = new Set(here)
    was.current = items

    const fresh = new Set(here.filter(id => !before.some(item => idOf(item) === id)))
    const gone = before.map((item, at) => ({ item, at })).filter(({ item }) => !present.has(idOf(item)))
    // A cell whose card left and whose index now holds a newly arrived one is a replacement.
    const swapped = new Map(
      gone
        .map(({ item, at }) => [here[at], item] as const)
        .filter(([taker]) => taker !== undefined && fresh.has(taker)),
    )
    const replaced = new Set([...swapped.values()].map(idOf))

    if (fresh.size === 0 && gone.length === 0) return
    setTurning(new Set(swapped.keys()))
    setEntering(new Set([...fresh].filter(id => !swapped.has(id))))
    setLeaving(gone.filter(({ item }) => !replaced.has(idOf(item))))
    clearTimeout(settling.current)
    settling.current = setTimeout(() => {
      setTurning(new Set())
      setEntering(new Set())
      setLeaving([])
    }, LEAVING_MS)
  }, [items, idOf])

  useEffect(() => () => clearTimeout(settling.current), [])

  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null)
  const dragged = useRef<string | null>(null)

  const ordered = useMemo(() => {
    const rank = new Map(order.map((id, i) => [id, i]))
    const live =
      order.length === 0
        ? items
        : [...items].sort((a, b) => (rank.get(idOf(a)) ?? Infinity) - (rank.get(idOf(b)) ?? Infinity))
    if (leaving.length === 0) return live
    // A card on its way out shrinks where it stood, rather than jumping to the end to do it.
    const here = new Set(items.map(idOf))
    const withLeaving = [...live]
    for (const { item, at } of leaving) {
      if (!here.has(idOf(item))) withLeaving.splice(Math.min(at, withLeaving.length), 0, item)
    }
    return withLeaving
  }, [items, leaving, order, idOf])

  const side = (e: React.DragEvent) => {
    const box = e.currentTarget.getBoundingClientRect()
    return e.clientX > box.left + box.width / 2
  }

  const move = (from: string, to: string, after: boolean) => {
    if (from === to) return
    setOrder(previous => {
      const ids = previous.length > 0 ? [...previous] : ordered.map(idOf)
      const rest = ids.filter(id => id !== from)
      const at = rest.indexOf(to)
      if (at < 0) return previous
      rest.splice(after ? at + 1 : at, 0, from)
      return rest
    })
  }

  const dragProps = (item: T): DragProps => {
    const id = idOf(item)
    const going = leaving.some(other => idOf(other.item) === id) ? 'dm-leaving' : ''
    const arriving = entering.has(id) ? 'dm-entering' : turning.has(id) ? 'dm-turning' : ''
    const marker =
      dragged.current === id
        ? 'dm-dragging'
        : drop?.id === id
          ? drop.after
            ? 'dm-drop-after'
            : 'dm-drop-before'
          : undefined
    return {
      draggable: true,
      className: [marker, going, arriving].filter(Boolean).join(' ') || undefined,
      onDragStart: e => {
        dragged.current = id
        e.dataTransfer.effectAllowed = 'move'
        // Firefox starts no drag at all unless the transfer carries something.
        e.dataTransfer.setData('text/plain', id)
      },
      onDragOver: e => {
        if (!dragged.current || dragged.current === id) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDrop({ id, after: side(e) })
      },
      onDragEnd: () => {
        dragged.current = null
        setDrop(null)
      },
      onDrop: e => {
        e.preventDefault()
        if (dragged.current) move(dragged.current, id, side(e))
        dragged.current = null
        setDrop(null)
      },
    }
  }

  // What the block is showing, in the order it is showing it: the wires redraw when this changes.
  return { items: ordered, dragProps, key: ordered.map(idOf).join(',') }
}
