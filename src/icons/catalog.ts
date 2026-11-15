// Every lucide icon, keyed by the `lucide:<name>` value OWOX stores. It pulls the whole library,
// so it is only ever imported lazily, from `picked.tsx`, never statically.
import * as lucide from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** `ShoppingCart` → `shopping-cart`, `Package2` → `package-2`, `AArrowDown` → `a-arrow-down`: lucide.dev's own spelling. */
function kebab(componentName: string): string {
  return componentName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/(?<![0-9])([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase()
}

const BY_VALUE = new Map<string, LucideIcon>()
for (const [name, icon] of Object.entries(lucide.icons)) BY_VALUE.set(`lucide:${kebab(name)}`, icon)
// A renamed icon lives on only as an alias export. Resolve those too, so a value saved under an
// old name still draws after a lucide upgrade, as it does in the host.
const CURRENT = new Set<unknown>(BY_VALUE.values())
for (const [name, icon] of Object.entries(lucide)) {
  if (!CURRENT.has(icon) || name.startsWith('Lucide') || name.endsWith('Icon')) continue
  const value = `lucide:${kebab(name)}`
  if (!BY_VALUE.has(value)) BY_VALUE.set(value, icon as LucideIcon)
}

export const getLucideIcon = (value: string): LucideIcon | undefined => BY_VALUE.get(value)
