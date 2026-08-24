import { StatTiles, type StatTileIcon, type StatTileItem } from '@/components/ui'

export type InventoryStripItem = {
  key: string
  value: number
  icon: StatTileIcon
  /** Singular noun, e.g. "server" — pluralized automatically. */
  noun: string
  /** Override the plural form when it isn't just `${noun}s`. */
  pluralNoun?: string
}

function pluralize(item: InventoryStripItem): string {
  if (item.value === 1) return item.noun
  return item.pluralNoun ?? `${item.noun}s`
}

/**
 * Icon count tiles for the compose Overview rollup (environments / servers /
 * services / networks / volumes / storage / bindings at the active scope).
 * Renders the shared {@link StatTiles} so the tile language matches the rest
 * of the console.
 */
export function ComposeInventoryStrip({
  items,
}: Readonly<{ items: InventoryStripItem[] }>) {
  if (items.length === 0) return null

  const tiles: StatTileItem[] = items.map((item) => {
    const noun = pluralize(item)
    return {
      key: item.key,
      icon: item.icon,
      value: item.value,
      label: noun,
      accessibilityLabel: `${item.value} ${noun}`,
    }
  })

  return (
    <StatTiles
      items={tiles}
      accessibilityLabel={tiles
        .map((tile) => tile.accessibilityLabel)
        .join(', ')}
    />
  )
}
