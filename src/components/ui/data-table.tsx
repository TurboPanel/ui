import { useState, type ReactNode } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

/**
 * One column's shared geometry. Define the array once per screen and hand the
 * same object to the header and every body cell — that is what keeps a column
 * and its heading the same width, instead of two `colName`-style entries that
 * drift apart the first time one is edited.
 */
export type DataTableColumn = {
  key: string
  header: string
  /** Proportional width. Defaults to 1; ignored when `width` is set. */
  flex?: number
  /** Floor before the table starts scrolling horizontally. */
  minWidth?: number
  /** Fixed width that never flexes — checkbox and action columns. */
  width?: number
  align?: 'start' | 'center' | 'end'
  /** Vertical gap when a cell stacks a label over a sub-line. */
  gap?: number
}

const ALIGNMENT = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
} as const

function columnStyle(column: DataTableColumn): ViewStyle {
  const base: ViewStyle = {
    alignItems: ALIGNMENT[column.align ?? 'start'],
    gap: column.gap,
  }
  if (column.width != null) {
    return { ...base, width: column.width, flexGrow: 0, flexShrink: 0 }
  }
  return { ...base, flex: column.flex ?? 1, minWidth: column.minWidth ?? 0 }
}

/**
 * Dense scannable table (MASTER → Tables / lists).
 *
 * Owns the one piece every console table needs and no screen should restate:
 * a horizontal scroller wrapping a `minWidth` body, so a wide table scrolls
 * sideways inside its panel on a phone instead of crushing its columns. The
 * sticky header is web-only and applied here, so screens never hand-roll the
 * `position: 'sticky'` cast that React Native's `ViewStyle` has no type for.
 *
 * Rows stay `children` rather than a `data` prop: console rows expand in place,
 * confirm deletes, and hold their own state, and a render-prop table would just
 * push all of that back out through props.
 */
export function DataTable({
  columns,
  minWidth,
  bordered = false,
  renderHeaderCell,
  children,
}: Readonly<{
  columns: readonly DataTableColumn[]
  /** Width below which the table scrolls horizontally. */
  minWidth: number
  /** Outer hairline + radius. Off for tables already inside a panel body. */
  bordered?: boolean
  /**
   * Replace one heading with a control — the select-all checkbox of a
   * batch-action table. Return `undefined` for the columns that keep their
   * ordinary text heading.
   */
  renderHeaderCell?: (column: DataTableColumn) => ReactNode | undefined
  children: ReactNode
}>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      nestedScrollEnabled
    >
      <View style={[styles.table, bordered && styles.tableBordered, { minWidth }]}>
        <View style={[styles.row, styles.headerRow]}>
          {columns.map((column) => (
            <View key={column.key} style={[styles.cell, columnStyle(column)]}>
              {renderHeaderCell?.(column) ?? (
                <Text style={styles.headerText} numberOfLines={1}>
                  {column.header}
                </Text>
              )}
            </View>
          ))}
        </View>
        {children}
      </View>
    </ScrollView>
  )
}

/** One body row. Pass `onPress` for expand-in-place / navigate rows. */
export function DataTableRow({
  onPress,
  expanded,
  accessibilityLabel,
  last = false,
  alt = false,
  selected = false,
  children,
}: Readonly<{
  onPress?: () => void
  /** Reported to assistive tech when the row toggles detail in place. */
  expanded?: boolean
  accessibilityLabel?: string
  /** Drops the bottom hairline on the final row. */
  last?: boolean
  /** Zebra shading for the odd rows of a long table. */
  alt?: boolean
  /** Checked in a batch-action table (MASTER: checkbox batch actions). */
  selected?: boolean
  children: ReactNode
}>) {
  const [hovered, setHovered] = useState(false)
  const rowStyle = [
    styles.row,
    alt && styles.rowAlt,
    selected && styles.rowSelected,
    last && styles.rowLast,
  ]
  if (!onPress) return <View style={rowStyle}>{children}</View>
  return (
    <Pressable
      onPress={onPress}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{
        expanded,
        selected: selected || undefined,
      }}
      style={({ pressed }) => [
        ...rowStyle,
        webPointer,
        hovered && styles.rowHovered,
        pressed && styles.rowPressed,
      ]}
    >
      {children}
    </Pressable>
  )
}

/** One body cell, sized from the same column object as its heading. */
export function DataTableCell({
  column,
  children,
}: Readonly<{
  column: DataTableColumn
  children: ReactNode
}>) {
  return <View style={[styles.cell, columnStyle(column)]}>{children}</View>
}

/** Full-width row for the empty / error state beneath the header. */
export function DataTableEmpty({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <View style={[styles.row, styles.rowLast]}>
      <Text style={styles.emptyText}>{children}</Text>
    </View>
  )
}

const stickyHeader =
  Platform.OS === 'web'
    ? ({ position: 'sticky', top: 0, zIndex: 2 } as unknown as ViewStyle)
    : null

const styles = StyleSheet.create({
  scroll: {
    width: '100%',
    alignSelf: 'stretch',
  },
  scrollContent: {
    flexGrow: 1,
    minWidth: '100%',
  },
  table: {
    flexGrow: 1,
    width: '100%',
  },
  tableBordered: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    minHeight: 44,
  },
  rowAlt: {
    backgroundColor: colors.bgInset,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowSelected: {
    backgroundColor: chrome.bgActive,
  },
  rowHovered: {
    backgroundColor: colors.bgSecondary,
  },
  rowPressed: {
    opacity: 0.88,
  },
  headerRow: {
    backgroundColor: colors.bgSecondary,
    paddingVertical: spacing.xs,
    minHeight: 32,
    ...stickyHeader,
  },
  cell: {
    justifyContent: 'center',
    minWidth: 0,
  },
  headerText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emptyText: {
    color: colors.textFaint,
    fontSize: 13,
  },
})
