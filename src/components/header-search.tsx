import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputHandle,
  type ViewStyle,
} from 'react-native'
import { useRouter, type Href } from 'expo-router'
import {
  BillingNavIcon,
  GearIcon,
  GitNavIcon,
  ManagedNavIcon,
  OrgAreaIcon,
  PlusIcon,
  SearchIcon,
} from '@/components/icons/nav-icons'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { useSearchItems } from '@/components/use-search-items'
import { isSearchShortcut, moveSearchIndex, splitHighlight } from '@/lib/header-search'
import {
  rankSearchItems,
  searchStatusChip,
  type SearchItem,
  type SearchItemIcon,
} from '@/lib/search-index'
import { colors, spacing, webPointer } from '@/lib/theme'

const isWeb = Platform.OS === 'web'
const LIST_ID = 'header-search-list'
const HEADING_ID = 'header-search-heading'
/** React Native's role type omits `listbox`; React Native Web passes it through. */
const LISTBOX_ROLE = { role: 'listbox' } as object
/** Keeps focus in the input when the pointer goes down inside the popover. */
const KEEP_FOCUS = {
  onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
} as object
/** Presses on the field's padding or icon must not blur the input (which would close the overlay). */
const FIELD_KEEP_FOCUS = {
  onMouseDown: (event: { target: EventTarget | null; preventDefault: () => void }) => {
    if (!targetIsTextField(event.target)) event.preventDefault()
  },
} as object
const optionId = (id: string) => `header-search-option-${id}`

function targetIsTextField(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element?.tagName) return false
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.isContentEditable === true
  )
}

/** True when `/` should be left alone: a select or button has focus, or a dialog is open. */
function slashIsBlocked(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (element?.closest?.('select, button, [role="button"]')) return true
  return (
    document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') !== null
  )
}

/** Cmd/Ctrl+K and `/` call `onTrigger` (web only). */
export function useHeaderSearchShortcut(onTrigger: () => void, enabled = true) {
  const latest = useRef(onTrigger)
  useEffect(() => {
    latest.current = onTrigger
  })
  useEffect(() => {
    if (!isWeb || !enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && slashIsBlocked(event.target)) return
      if (
        isSearchShortcut({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          targetIsTextField: targetIsTextField(event.target),
        })
      ) {
        event.preventDefault()
        latest.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

function DestinationIcon({ icon, color }: Readonly<{ icon: SearchItemIcon; color: string }>) {
  switch (icon) {
    case 'server':
      return <OrgAreaIcon areaId="servers" size={14} color={color} />
    case 'database':
      return <OrgAreaIcon areaId="managed" size={14} color={color} />
    case 'action-add':
      return <PlusIcon size={14} color={color} />
    case 'action':
      return <Text style={{ color, fontSize: 14, fontWeight: '700' }}>{'›'}</Text>
    case 'git-sources':
      return <GitNavIcon size={14} color={color} />
    case 'repositories':
      return <ManagedNavIcon size={14} color={color} />
    case 'project-settings':
    case 'org-settings':
      return <GearIcon size={14} color={color} />
    case 'billing':
      return <BillingNavIcon size={14} color={color} />
    default:
      return <OrgAreaIcon areaId={icon} size={14} color={color} />
  }
}

function SearchRow({
  item,
  query,
  selected,
  onHover,
  onPick,
}: Readonly<{
  item: SearchItem
  query: string
  selected: boolean
  onHover: () => void
  onPick: () => void
}>) {
  const { before, match, after } = splitHighlight(item.name, query)
  const chip = searchStatusChip(item)
  return (
    <Pressable
      id={optionId(item.id)}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      style={[styles.row, selected && styles.rowSelected, webPointer]}
      onHoverIn={onHover}
      onPress={onPick}
    >
      <View style={[styles.rowIcon, selected && styles.rowIconSelected]}>
        <DestinationIcon icon={item.icon} color={selected ? colors.link : colors.textDim} />
      </View>
      <Text style={styles.rowName} numberOfLines={1}>
        {before}
        {match ? <Text style={styles.rowMatch}>{match}</Text> : null}
        {after}
      </Text>
      {chip ? <StatusChip status={chip.key} label={chip.label} size="sm" /> : null}
      <Text style={styles.rowType}>{item.danger ? 'Asks first' : item.type}</Text>
    </Pressable>
  )
}

const groupHeadingId = (group: string) => `header-search-group-${group}`

/** The rows split into their consecutive groups, keeping each row's position in the whole list. */
function groupRows(shown: readonly SearchItem[]) {
  const groups: { group: string; rows: { item: SearchItem; position: number }[] }[] = []
  shown.forEach((item, position) => {
    const last = groups[groups.length - 1]
    if (last?.group === item.group) last.rows.push({ item, position })
    else groups.push({ group: item.group, rows: [{ item, position }] })
  })
  return groups
}

/** The grouped result rows, shared by the header popover and the phone Search screen. */
export function SearchResultList({
  shown,
  activeId,
  query,
  onHover,
  onPick,
  labelledBy,
}: Readonly<{
  shown: readonly SearchItem[]
  activeId: string | undefined
  query: string
  onHover: (position: number) => void
  onPick: (item: SearchItem) => void
  labelledBy: string
}>) {
  return (
    <View id={LIST_ID} {...LISTBOX_ROLE} aria-labelledby={labelledBy} style={styles.list}>
      {groupRows(shown).map(({ group, rows }) => (
        <View key={group} role="group" aria-labelledby={groupHeadingId(group)}>
          <Text id={groupHeadingId(group)} style={styles.groupHeading}>
            {group}
          </Text>
          {rows.map(({ item, position }) => (
            <SearchRow
              key={item.id}
              item={item}
              query={query}
              selected={item.id === activeId}
              onHover={() => onHover(position)}
              onPick={() => onPick(item)}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

/** The question a dangerous row asks before it opens anything. */
export function SearchConfirm({
  item,
  onConfirm,
  onCancel,
}: Readonly<{ item: SearchItem; onConfirm: () => void; onCancel: () => void }>) {
  return (
    <View role="alertdialog" aria-label="Confirm" style={styles.confirm}>
      <Text style={styles.confirmText}>{item.confirm}</Text>
      <View style={styles.confirmButtons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={[styles.confirmButton, webPointer]}
          onPress={onCancel}
        >
          <Text style={styles.confirmButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open"
          style={[styles.confirmButton, styles.confirmButtonPrimary, webPointer]}
          onPress={onConfirm}
        >
          <Text style={styles.confirmButtonText}>Open</Text>
        </Pressable>
      </View>
    </View>
  )
}

/** The icon that opens the search across the header on narrow widths. */
export function HeaderSearchButton({ onPress }: Readonly<{ onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Search"
      style={(state) => [
        styles.iconButton,
        (state as { hovered?: boolean }).hovered === true && styles.iconButtonHover,
        webPointer,
      ]}
      onPress={onPress}
    >
      <SearchIcon size={18} color={colors.textDim} />
    </Pressable>
  )
}

function useScrollActiveIntoView(popoverOpen: boolean, activeId: string | undefined) {
  useEffect(() => {
    if (!isWeb || !popoverOpen || !activeId) return
    const row = document.getElementById(optionId(activeId))
    if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
  }, [popoverOpen, activeId])
}

const detectMac = () => isWeb && /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? '')

type SearchKeyEvent = {
  nativeEvent: { key: string; repeat?: boolean }
  preventDefault: () => void
  stopPropagation?: () => void
}

type SearchKeyActions = {
  move: (direction: 'down' | 'up') => void
  pickActive: () => void
  close: () => void
}

function handleSearchKey(event: SearchKeyEvent, actions: SearchKeyActions) {
  const { key } = event.nativeEvent
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    event.preventDefault()
    actions.move(key === 'ArrowDown' ? 'down' : 'up')
  } else if (key === 'Enter') {
    event.preventDefault()
    // A held Enter must not select a row and confirm its question in one go.
    if (!event.nativeEvent.repeat) actions.pickActive()
  } else if (key === 'Escape') {
    event.stopPropagation?.()
    actions.close()
  }
}

/** The shortcut badge (wide header) or close button (narrow header) at the end of the field. */
function FieldAdornments({
  collapsed,
  focused,
  isMac,
  onClose,
}: Readonly<{ collapsed: boolean; focused: boolean; isMac: boolean; onClose: () => void }>) {
  if (collapsed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close search"
        style={[styles.closeButton, webPointer]}
        onPress={onClose}
      >
        <Text style={styles.closeGlyph}>{'✕'}</Text>
      </Pressable>
    )
  }
  if (focused) return null
  return (
    <View style={styles.kbd} aria-hidden>
      <Text style={styles.kbdLabel}>{isMac ? '⌘K' : 'Ctrl K'}</Text>
    </View>
  )
}

function SearchFoot() {
  return (
    <View style={styles.foot}>
      <Text style={styles.footText}>
        <Text style={styles.footKey}>{'↑↓'}</Text> to move
      </Text>
      <Text style={styles.footText}>
        <Text style={styles.footKey}>Enter</Text> to open
      </Text>
      <Text style={styles.footText}>
        <Text style={styles.footKey}>Esc</Text> to close
      </Text>
    </View>
  )
}

function SearchPopover({
  shown,
  activeId,
  query,
  collapsed,
  pending,
  onHover,
  onPick,
  onConfirm,
  onCancel,
}: Readonly<{
  shown: readonly SearchItem[]
  activeId: string | undefined
  query: string
  collapsed: boolean
  pending: SearchItem | null
  onHover: (position: number) => void
  onPick: (item: SearchItem) => void
  onConfirm: () => void
  onCancel: () => void
}>) {
  const trimmed = query.trim()
  return (
    <View style={styles.popover} {...KEEP_FOCUS}>
      {pending ? (
        <SearchConfirm item={pending} onConfirm={onConfirm} onCancel={onCancel} />
      ) : (
        <>
          <Text id={HEADING_ID} style={styles.heading}>
            {trimmed ? 'Results' : 'Jump to'}
          </Text>
          {shown.length > 0 ? (
            <>
              <SearchResultList
                shown={shown}
                activeId={activeId}
                query={query}
                onHover={onHover}
                onPick={onPick}
                labelledBy={HEADING_ID}
              />
              {collapsed ? null : <SearchFoot />}
            </>
          ) : (
            <Text style={styles.none}>
              {`Nothing matches “${trimmed}”. Try a server name, or an action like “Add server”.`}
            </Text>
          )}
          <Text role="status" style={styles.srOnly}>
            {`${shown.length} results`}
          </Text>
        </>
      )}
    </View>
  )
}

/**
 * Header search: finds servers, projects, databases, datacenters and pages,
 * and offers actions. Rows only ever open a page; a dangerous action asks
 * first. The lists come from queries the pages already use (read once the
 * field is focused).
 */
export function HeaderSearch({
  orgId,
  collapsed = false,
  onClose,
}: Readonly<{
  orgId: string
  /** Fills the header (narrow widths) with a close button and no shortcut badge. */
  collapsed?: boolean
  onClose?: () => void
}>) {
  const router = useRouter()
  const inputRef = useRef<TextInputHandle>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [index, setIndex] = useState(0)
  const [pending, setPending] = useState<SearchItem | null>(null)

  const items = useSearchItems(orgId, open && focused)
  const shown = useMemo(() => rankSearchItems(items, query), [items, query])
  const active = shown[Math.min(index, shown.length - 1)]
  const popoverOpen = open && focused
  const activeId = active?.id

  useScrollActiveIntoView(popoverOpen, activeId)
  const isMac = detectMac()

  useEffect(() => {
    if (collapsed) inputRef.current?.focus()
  }, [collapsed])

  useHeaderSearchShortcut(() => inputRef.current?.focus(), !collapsed)

  if (!isWeb) return null

  const close = (keepFocus = false) => {
    setQuery('')
    setIndex(0)
    setPending(null)
    setOpen(false)
    if (!keepFocus) inputRef.current?.blur()
    onClose?.()
  }
  const go = (item: SearchItem) => {
    close()
    router.push(item.href as Href)
  }
  const pick = (item: SearchItem | undefined) => {
    if (!item) return
    if (item.danger) setPending(item)
    else go(item)
  }

  const onKeyPress = (event: SearchKeyEvent) =>
    handleSearchKey(event, {
      move: (direction) => {
        if (pending) return
        setOpen(true)
        setIndex(moveSearchIndex(index, shown.length, direction))
      },
      pickActive: () => (pending ? go(pending) : pick(active)),
      close: () => (pending ? setPending(null) : close(true)),
    })

  // Pointer presses inside the popover never move focus (see KEEP_FOCUS), so a
  // blur is always focus really leaving the field and can safely close it.
  const onBlur = () => {
    setFocused(false)
    setOpen(false)
    setPending(null)
    if (collapsed) onClose?.()
  }

  return (
    <View accessibilityRole="search" style={collapsed ? styles.wrapCollapsed : styles.wrap}>
      <Pressable
        style={[styles.field, focused && styles.fieldFocused]}
        onPress={() => inputRef.current?.focus()}
        accessible={false}
        tabIndex={-1}
        {...FIELD_KEEP_FOCUS}
      >
        <SearchIcon size={16} color={focused ? colors.link : colors.textDim} />
        <TextInput
          ref={inputRef}
          value={query}
          placeholder="Search or run an action"
          placeholderTextColor={colors.textDim}
          accessibilityLabel="Search"
          role="combobox"
          aria-expanded={popoverOpen}
          aria-controls={popoverOpen && shown.length > 0 ? LIST_ID : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            popoverOpen && active && !pending ? optionId(active.id) : undefined
          }
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
          style={styles.input}
          onChangeText={(text) => {
            setQuery(text)
            setIndex(0)
            setPending(null)
            setOpen(true)
          }}
          onFocus={() => {
            setFocused(true)
            setOpen(true)
          }}
          onBlur={onBlur}
          onKeyPress={onKeyPress}
        />
        <FieldAdornments collapsed={collapsed} focused={focused} isMac={isMac} onClose={close} />
      </Pressable>

      {popoverOpen ? (
        <SearchPopover
          shown={shown}
          activeId={activeId}
          query={query}
          collapsed={collapsed}
          pending={pending}
          onHover={setIndex}
          onPick={pick}
          onConfirm={() => pending && go(pending)}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </View>
  )
}

const focusRing = (isWeb ? { outlineStyle: 'none' } : {}) as unknown as ViewStyle

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: spacing.md,
  },
  wrapCollapsed: {
    flex: 1,
    minWidth: 0,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 40,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.sepStrong,
    backgroundColor: colors.field,
  },
  fieldFocused: {
    borderColor: colors.accent,
    boxShadow: `0 0 0 3px ${colors.accentSoft}`,
  } as ViewStyle,
  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    color: colors.text,
    fontSize: 14,
    ...focusRing,
  },
  kbd: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.sepStrong,
    backgroundColor: colors.surface2,
  },
  kbdLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: { color: colors.textDim, fontSize: 12 },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonHover: { backgroundColor: colors.surface3 },
  popover: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    zIndex: 20,
    padding: spacing.sm,
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.menuFill,
    boxShadow: colors.shadowPop,
  } as ViewStyle,
  heading: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: 6,
  },
  // Only the web popover scrolls its own list; the phone screen scrolls the page.
  list: (isWeb ? { gap: 2, maxHeight: 320, overflowY: 'auto' } : { gap: 2 }) as ViewStyle,
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: isWeb ? 38 : 48,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  groupHeading: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: 4,
  },
  confirm: { gap: spacing.sm, padding: spacing.sm },
  confirmText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  confirmButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  confirmButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.sepStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonPrimary: { borderColor: colors.accent },
  confirmButtonText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
  rowSelected: { backgroundColor: colors.surface3 },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.sep,
  },
  rowIconSelected: { borderColor: colors.baseLine },
  rowName: {
    flex: 1,
    minWidth: 0,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  rowMatch: { color: colors.link, fontWeight: '700' },
  rowType: { color: colors.textDim, fontSize: 11, fontWeight: '500' },
  none: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
  },
  foot: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: colors.sep,
  },
  footText: { color: colors.textDim, fontSize: 11 },
  footKey: { color: colors.textMuted, fontWeight: '600' },
})
