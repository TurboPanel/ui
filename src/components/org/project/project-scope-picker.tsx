import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { BreadcrumbChevron } from '@/components/header-chevron'
import { SearchIcon } from '@/components/icons/nav-icons'
import { webPointer } from '@/components/org/org-panel-styles'
import { EmptyState } from '@/components/ui'
import {
  filterProjectScopeOptions,
  resolveScopeTriggerOption,
  shouldShowScopeSearch,
  type ProjectScopeOption,
} from '@/lib/project-scope'
import { chrome, colors, layout, spacing } from '@/lib/theme'

const PICKER_WIDTH = 320
const PICKER_MAX_LIST_HEIGHT = 320

function ScopeSearchField({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (next: string) => void }>) {
  return (
    <View style={styles.searchWrap}>
      <SearchIcon size={16} color={colors.textDim} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Filter environments"
        placeholderTextColor={colors.textDim}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="search"
        accessibilityLabel="Filter environments"
      />
    </View>
  )
}

function ScopeRow({
  option,
  active,
  statusColor,
  onSelect,
}: Readonly<{
  option: ProjectScopeOption
  active: boolean
  statusColor?: string
  onSelect: () => void
}>) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={
        option.detail ? `${option.label}, ${option.detail}` : option.label
      }
      style={[styles.row, active && styles.rowActive, webPointer]}
      onPress={onSelect}
    >
      {statusColor ? (
        <View
          style={[styles.statusDot, { backgroundColor: statusColor }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : (
        <View style={styles.statusSpacer} />
      )}
      <View style={styles.rowText}>
        <Text
          style={[styles.rowLabel, active && styles.rowLabelActive]}
          numberOfLines={1}
        >
          {option.label}
        </Text>
        {option.detail ? (
          <Text style={styles.rowDetail} numberOfLines={1}>
            {option.detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

/** Always-visible trigger: the active environment, or the first one, unhighlighted. */
function ScopeTrigger({
  option,
  optionCount,
  selected,
  open,
  statusColor,
  onPress,
}: Readonly<{
  option: ProjectScopeOption
  optionCount: number
  selected: boolean
  open: boolean
  statusColor?: string
  onPress: () => void
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open, selected }}
      accessibilityLabel={
        selected
          ? `Environment: ${option.label}. Change environment`
          : `Switch to an environment. ${String(optionCount)} available`
      }
      style={[
        styles.trigger,
        selected && styles.triggerSelected,
        open && styles.triggerOpen,
        webPointer,
      ]}
      onPress={onPress}
    >
      {statusColor ? (
        <View
          style={[styles.statusDot, { backgroundColor: statusColor }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text
        style={[styles.triggerLabel, selected && styles.triggerLabelSelected]}
        numberOfLines={1}
      >
        {option.label}
      </Text>
      <BreadcrumbChevron
        size={12}
        color={selected ? chrome.accent : colors.textMuted}
      />
    </Pressable>
  )
}

/** The open list: a sheet on compact widths, a popover anchored to the trigger otherwise. */
function ScopePickerPanel({
  isCompact,
  anchor,
  showSearch,
  query,
  onQueryChange,
  visible,
  activeEnvironmentId,
  statusColorFor,
  onSelect,
  onClose,
}: Readonly<{
  isCompact: boolean
  anchor: { top: number; left: number }
  showSearch: boolean
  query: string
  onQueryChange: (next: string) => void
  visible: readonly ProjectScopeOption[]
  activeEnvironmentId: string | null
  statusColorFor?: (option: ProjectScopeOption) => string | undefined
  onSelect: (option: ProjectScopeOption) => void
  onClose: () => void
}>) {
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
          accessibilityLabel="Dismiss scope picker"
        />
        <View
          style={[
            styles.card,
            isCompact
              ? styles.cardCompact
              : {
                  position: 'absolute',
                  top: anchor.top,
                  left: anchor.left,
                  width: PICKER_WIDTH,
                },
          ]}
        >
          {showSearch ? (
            <ScopeSearchField value={query} onChange={onQueryChange} />
          ) : null}
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            accessibilityRole="tablist"
            accessibilityLabel="Environments"
          >
            {visible.length === 0 ? (
              <EmptyState title="No environments match." />
            ) : (
              visible.map((option) => (
                <ScopeRow
                  key={option.environmentId}
                  option={option}
                  active={option.environmentId === activeEnvironmentId}
                  statusColor={statusColorFor?.(option)}
                  onSelect={() => {
                    onClose()
                    onSelect(option)
                  }}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

/**
 * Environment switcher for projects with more environments than fit a chip
 * strip — one environment per server means the list grows with the fleet.
 *
 * Sits to the right of the always-visible **Project** button. The trigger names
 * the active environment, or — on Project scope — the first environment,
 * rendered unhighlighted so it reads as "what is over here" rather than "what
 * you are looking at".
 */
export function ProjectScopePicker({
  options,
  activeEnvironmentId,
  statusColorFor,
  onSelect,
}: Readonly<{
  options: readonly ProjectScopeOption[]
  /** null while the Project scope is selected. */
  activeEnvironmentId: string | null
  statusColorFor?: (option: ProjectScopeOption) => string | undefined
  onSelect: (option: ProjectScopeOption) => void
}>) {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [anchor, setAnchor] = useState({ top: 56, left: 16 })
  const triggerRef = useRef<View | null>(null)

  const shown = resolveScopeTriggerOption(options, activeEnvironmentId)
  const selected = activeEnvironmentId != null
  const visible = filterProjectScopeOptions(options, query)
  const showSearch = shouldShowScopeSearch(options.length)

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open || isCompact) return
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({
        top: y + h + 6,
        left: Math.min(
          Math.max(12, x + w - PICKER_WIDTH),
          Math.max(12, width - PICKER_WIDTH - 12),
        ),
      })
    })
  }, [open, isCompact, width])

  if (!shown) return null

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <ScopeTrigger
          option={shown}
          optionCount={options.length}
          selected={selected}
          open={open}
          statusColor={statusColorFor?.(shown)}
          onPress={() => setOpen((current) => !current)}
        />
      </View>

      {open ? (
        <ScopePickerPanel
          isCompact={isCompact}
          anchor={anchor}
          showSearch={showSearch}
          query={query}
          onQueryChange={setQuery}
          visible={visible}
          activeEnvironmentId={activeEnvironmentId}
          statusColorFor={statusColorFor}
          onSelect={onSelect}
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
    gap: 6,
    minHeight: 32,
    maxWidth: 240,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  triggerSelected: {
    backgroundColor: chrome.bgActive,
    borderWidth: 1,
    borderColor: chrome.accent,
  },
  triggerOpen: {
    borderWidth: 1,
    borderColor: colors.borderChip,
  },
  triggerLabel: {
    flexShrink: 1,
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  triggerLabelSelected: {
    color: chrome.accent,
    fontWeight: '700',
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
    maxHeight: PICKER_MAX_LIST_HEIGHT,
  },
  listContent: {
    gap: 2,
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
  },
  rowActive: {
    backgroundColor: chrome.bgActive,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowLabel: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
  },
  rowLabelActive: {
    color: chrome.accent,
  },
  rowDetail: {
    color: colors.textMuted,
    fontSize: 11,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  statusSpacer: {
    width: 6,
    flexShrink: 0,
  },
})
