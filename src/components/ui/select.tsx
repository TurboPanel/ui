import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { HeaderChevron } from '@/components/header-chevron'
import { SearchIcon } from '@/components/icons/nav-icons'
import { webPointer } from '@/components/org/org-panel-styles'
import { EmptyState } from '@/components/ui/state-views'
import {
  filterSelectOptions,
  resolveSelectTriggerLabel,
  shouldShowSelectSearch,
  type SelectOption,
} from '@/lib/select-options'
import { chrome, colors, layout, spacing } from '@/lib/theme'

export type { SelectOption }

const LIST_MAX_HEIGHT = 320
const ROW_HEIGHT = 44
const ROW_DETAIL_HEIGHT = 52
const ROW_GAP = 2

/** A row in the open picker; `value: null` is the explicit none option. */
type PickerRow = Readonly<{
  value: string | null
  label: string
  detail?: string | null
}>

function SelectSearchField({
  value,
  placeholder,
  onChange,
}: Readonly<{
  value: string
  placeholder: string
  onChange: (next: string) => void
}>) {
  return (
    <View style={styles.searchWrap}>
      <SearchIcon size={16} color={colors.textDim} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
    </View>
  )
}

function SelectRow({
  row,
  active,
  mono,
  onSelect,
}: Readonly<{
  row: PickerRow
  active: boolean
  mono: boolean
  onSelect: () => void
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={
        row.detail ? `${row.label}, ${row.detail}` : row.label
      }
      style={({ pressed }) => [
        styles.row,
        row.detail != null && styles.rowWithDetail,
        active && styles.rowActive,
        pressed && styles.rowPressed,
        webPointer,
      ]}
      onPress={onSelect}
    >
      <View style={styles.rowText}>
        <Text
          style={[
            styles.rowLabel,
            mono && styles.rowLabelMono,
            active && styles.rowLabelActive,
          ]}
          numberOfLines={1}
        >
          {row.label}
        </Text>
        {row.detail ? (
          <Text style={styles.rowDetail} numberOfLines={1}>
            {row.detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function SelectPickerPanel({
  isCompact,
  anchor,
  rows,
  value,
  mono,
  showSearch,
  searchPlaceholder,
  query,
  onQueryChange,
  onSelect,
  onClose,
}: Readonly<{
  isCompact: boolean
  anchor: { top: number; left: number; width: number }
  rows: readonly PickerRow[]
  value: string | null
  mono: boolean
  showSearch: boolean
  searchPlaceholder: string
  query: string
  onQueryChange: (next: string) => void
  onSelect: (next: string | null) => void
  onClose: () => void
}>) {
  const hasDetail = rows.some((row) => row.detail != null)
  const rowHeight = hasDetail ? ROW_DETAIL_HEIGHT : ROW_HEIGHT
  // Land the open list on the current value instead of making the operator
  // re-scroll a 600-row list to find where they are (timezones).
  const selectedIndex = rows.findIndex((row) => row.value === value)
  const initialScrollIndex =
    query === '' && selectedIndex > 4 ? selectedIndex : undefined

  const card = (
    <View
      style={[
        styles.card,
        isCompact
          ? styles.cardCompact
          : {
              position: 'absolute',
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
            },
      ]}
    >
      {showSearch ? (
        <SelectSearchField
          value={query}
          placeholder={searchPlaceholder}
          onChange={onQueryChange}
        />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="No options match." />
      ) : (
        <FlatList
          data={rows}
          style={styles.list}
          keyExtractor={(row) => row.value ?? '__none__'}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          initialScrollIndex={initialScrollIndex}
          getItemLayout={(_, index) => ({
            length: rowHeight,
            offset: index * (rowHeight + ROW_GAP),
            index,
          })}
          ItemSeparatorComponent={RowGap}
          accessibilityRole="list"
          renderItem={({ item }) => (
            <SelectRow
              row={item}
              active={item.value === value}
              mono={mono}
              onSelect={() => {
                onClose()
                onSelect(item.value)
              }}
            />
          )}
        />
      )}
    </View>
  )

  return (
    <Modal
      visible
      transparent
      animationType={isCompact ? 'slide' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, isCompact && styles.backdropCompact]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss picker"
        />
        {isCompact ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoider}
          >
            {card}
          </KeyboardAvoidingView>
        ) : (
          card
        )}
      </View>
    </Modal>
  )
}

function RowGap() {
  return <View style={styles.rowGap} />
}

/**
 * Searchable single-value picker (MASTER "Selectors that grow"): a trigger
 * reading as the current selection, a bottom sheet on compact widths, a menu
 * anchored to the trigger on desktop, and a filter field once the list is long
 * enough to scan. Use it wherever the option list grows with the fleet or the
 * org — timezones, repositories, servers; a fixed set of ≤5 stays a
 * `SegmentedControl`.
 *
 * Renders identically on web and native — never a platform `<select>` — so
 * long lists stay filterable everywhere. Wrap in {@link FormField} for a
 * label/hint/error.
 */
export function Select({
  value,
  options,
  placeholder,
  disabled = false,
  mono = false,
  noneLabel,
  searchPlaceholder = 'Filter options',
  accessibilityLabel,
  onChange,
}: Readonly<{
  value: string | null
  options: readonly SelectOption[]
  placeholder: string
  disabled?: boolean
  /** Monospace labels — timezone IDs, hostnames, versions. */
  mono?: boolean
  /** When set, prepends an explicit null option (e.g. "Inherit org default"). */
  noneLabel?: string
  searchPlaceholder?: string
  accessibilityLabel: string
  onChange: (value: string | null) => void
}>) {
  const { width, height } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [anchor, setAnchor] = useState({ top: 56, left: 16, width: 280 })
  const triggerRef = useRef<View | null>(null)

  const trigger = resolveSelectTriggerLabel(
    options,
    value,
    placeholder,
    noneLabel,
  )
  const showSearch = shouldShowSelectSearch(
    options.length + (noneLabel != null ? 1 : 0),
  )

  const rows = useMemo<PickerRow[]>(() => {
    const filtered = filterSelectOptions(options, query)
    if (noneLabel == null) return filtered
    // The none row competes on its label like any option while filtering.
    const needle = query.trim().toLowerCase()
    const noneMatches =
      needle === '' || noneLabel.toLowerCase().includes(needle)
    return noneMatches
      ? [{ value: null, label: noneLabel }, ...filtered]
      : filtered
  }, [options, query, noneLabel])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open || isCompact) return
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({
        // Keep the panel on screen when the trigger sits low on the page.
        top: Math.min(y + h + 6, Math.max(12, height - LIST_MAX_HEIGHT - 72)),
        left: x,
        width: w,
      })
    })
  }, [open, isCompact, width, height])

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open, disabled }}
          accessibilityLabel={`${accessibilityLabel}: ${trigger.label}`}
          disabled={disabled}
          style={[
            styles.trigger,
            open && styles.triggerOpen,
            disabled && styles.triggerDisabled,
            webPointer,
          ]}
          onPress={() => setOpen((current) => !current)}
        >
          <Text
            style={[
              styles.triggerLabel,
              mono && styles.triggerLabelMono,
              trigger.isPlaceholder && styles.triggerLabelPlaceholder,
            ]}
            numberOfLines={1}
          >
            {trigger.label}
          </Text>
          <HeaderChevron size={12} color={colors.textMuted} open={open} />
        </Pressable>
      </View>

      {open ? (
        <SelectPickerPanel
          isCompact={isCompact}
          anchor={anchor}
          rows={rows}
          value={value}
          mono={mono}
          showSearch={showSearch}
          searchPlaceholder={searchPlaceholder}
          query={query}
          onQueryChange={setQuery}
          onSelect={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 44,
  },
  triggerOpen: {
    borderColor: chrome.accent,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  triggerLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
  },
  triggerLabelMono: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  triggerLabelPlaceholder: {
    color: colors.textDim,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  backdropCompact: {
    justifyContent: 'flex-end',
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgPanel,
    overflow: 'hidden',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  keyboardAvoider: {
    pointerEvents: 'box-none',
  },
  cardCompact: {
    margin: spacing.md,
    marginBottom: spacing.xl,
    maxHeight: '75%',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    paddingHorizontal: spacing.sm,
    minHeight: 40,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 40,
    paddingVertical: 0,
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: LIST_MAX_HEIGHT,
  },
  rowGap: {
    height: ROW_GAP,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
  },
  rowWithDetail: {
    height: ROW_DETAIL_HEIGHT,
  },
  rowActive: {
    backgroundColor: chrome.bgActive,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowLabel: {
    color: colors.textBody,
    fontSize: 14,
  },
  rowLabelMono: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  rowLabelActive: {
    color: chrome.accent,
    fontWeight: '600',
  },
  rowDetail: {
    color: colors.textMuted,
    fontSize: 11,
  },
})
