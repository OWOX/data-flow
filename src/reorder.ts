// Cards a reader can drag into their own order.
import { useMemo, useRef, useState } from 'react'

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

export function useReorder<T>(items: T[], idOf: (item: T) => string): Cards<T> {
  const [order, setOrder] = useState<string[]>([])
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null)
  const dragged = useRef<string | null>(null)

  const ordered = useMemo(() => {
    if (order.length === 0) return items
    const rank = new Map(order.map((id, i) => [id, i]))
    return [...items].sort((a, b) => (rank.get(idOf(a)) ?? Infinity) - (rank.get(idOf(b)) ?? Infinity))
  }, [items, order, idOf])

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
      className: marker,
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
