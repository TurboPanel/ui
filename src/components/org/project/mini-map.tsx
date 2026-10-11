import { Text, View } from 'react-native'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import type { MiniMapColumn } from '@/lib/v4/project-home'
import { RADIUS } from '@/lib/v4/ui-scale'

const styles = themedStyles((p) => ({
  map: {
    flexDirection: 'row',
    gap: 16,
    padding: 12,
    borderRadius: RADIUS.row,
    borderWidth: 1,
    borderColor: p.sep,
    backgroundColor: p.surface2,
  },
  column: { flex: 1, minWidth: 0, gap: 4 },
  label: {
    ...typeStyle('bodySemibold', 'caption'),
    color: p.text3,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  name: { ...typeStyle('body', 'footnote'), color: p.text2, flexShrink: 1 },
  changed: { ...typeStyle('bodySemibold', 'footnote'), color: p.base },
  empty: { ...typeStyle('body', 'footnote'), color: p.text3 },
}))

/**
 * The environment in three short lists: who visits, the apps, the data they
 * use. A card's picture of what it runs; the environment page draws the full
 * map. An app that the environment changes is blue; an app that has been
 * deployed carries its status mark.
 */
export function MiniMap({
  columns,
  accessibilityLabel,
}: Readonly<{ columns: readonly MiniMapColumn[]; accessibilityLabel: string }>) {
  const s = styles(usePalette())
  return (
    <View accessibilityRole="summary" accessibilityLabel={accessibilityLabel} style={s.map}>
      {columns.map((column) => (
        <View key={column.key} style={s.column}>
          <Text style={s.label}>{column.label}</Text>
          {column.items.length === 0 ? (
            <Text style={s.empty}>{column.emptyText}</Text>
          ) : (
            column.items.map((item) => (
              <View key={item.name} style={s.item}>
                {item.status ? <StatusChip status={item.status} size="dot" /> : null}
                <Text style={item.changed ? s.changed : s.name} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
            ))
          )}
        </View>
      ))}
    </View>
  )
}
