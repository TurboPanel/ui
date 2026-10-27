import { StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { spacing } from '@/lib/theme'

/** "Showing 26–50 of 3,120" for an offset page; "None" when the list is empty. */
export function pageRangeText(offset: number, shown: number, total: number): string {
  if (total === 0 || shown === 0) return 'None'
  const first = offset + 1
  const last = offset + shown
  return `Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}`
}

/** Previous / Next under a server-paged table, with the range it shows; nothing for an empty list. */
export function HistoryPager({
  offset,
  pageSize,
  shown,
  total,
  onOffsetChange,
}: Readonly<{
  offset: number
  pageSize: number
  shown: number
  total: number
  onOffsetChange: (offset: number) => void
}>) {
  // An empty list says so in the table; a "None" under it would only repeat it.
  if (total === 0 || shown === 0) return null
  return (
    <View style={styles.pager}>
      <Text style={panelStyles.muted}>{pageRangeText(offset, shown, total)}</Text>
      {total > pageSize ? (
        <View style={styles.buttons}>
          <Button
            label="Previous"
            size="sm"
            variant="secondary"
            disabled={offset === 0}
            onPress={() => {
              onOffsetChange(Math.max(0, offset - pageSize))
            }}
          />
          <Button
            label="Next"
            size="sm"
            variant="secondary"
            disabled={offset + pageSize >= total}
            onPress={() => {
              onOffsetChange(offset + pageSize)
            }}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  pager: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
})
