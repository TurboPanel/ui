import { useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { clampPageOffset } from '@/lib/page-offset'
import { spacing } from '@/lib/theme'

/**
 * "Showing 26–50 of 3,120" for an offset page; "Showing 0 of 30" for a page
 * past the end (it moves back on its own); "None" when the list is empty.
 */
export function pageRangeText(offset: number, shown: number, total: number): string {
  if (total === 0) return 'None'
  if (shown === 0) return `Showing 0 of ${total.toLocaleString()}`
  const first = offset + 1
  const last = offset + shown
  return `Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}`
}

/**
 * Previous / Next under a server-paged table, with the range it shows; nothing
 * for an empty list. A page past the end (a stale `?offset=`, or a list that
 * shrank while it was open) moves back to the last page that has rows.
 */
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
  // Callers pass a fresh arrow each render; only the numbers decide a move.
  const change = useRef(onOffsetChange)
  useEffect(() => {
    change.current = onOffsetChange
  })
  useEffect(() => {
    if (shown > 0) return
    const clamped = clampPageOffset(offset, total, pageSize)
    if (clamped !== offset) change.current(clamped)
  }, [offset, total, pageSize, shown])

  // An empty list says so in the table; a "None" under it would only repeat it.
  if (total === 0) return null
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
