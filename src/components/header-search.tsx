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
  SearchIcon,
} from '@/components/icons/nav-icons'
import { useAuth } from '@/lib/auth-context'
import {
  filterSearchDestinations,
  isSearchShortcut,
  moveSearchIndex,
  searchDestinations,
  splitHighlight,
  type SearchDestination,
  type SearchIconId,
} from '@/lib/header-search'
import { colors, spacing, webPointer } from '@/lib/theme'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'

const isWeb = Platform.OS === 'web'
const LIST_ID = 'header-search-list'
const HEADING_ID = 'header-search-heading'
/** React Native's role type omits `listbox`; React Native Web passes it through. */
const LISTBOX_ROLE = { role: 'listbox' } as object
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

/** Cmd/Ctrl+K and `/` call `onTrigger` (web only). */
export function useHeaderSearchShortcut(onTrigger: () => void, enabled = true) {
  const latest = useRef(onTrigger)
  useEffect(() => {
    latest.current = onTrigger
  })
  useEffect(() => {
    if (!isWeb || !enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
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

function DestinationIcon({
  icon,
  color,
}: Readonly<{ icon: SearchIconId; color: string }>) {
  switch (icon) {
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
  item: SearchDestination
  query: string
  selected: boolean
  onHover: () => void
  onPick: () => void
}>) {
  const { before, match, after } = splitHighlight(item.name, query)
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
        <DestinationIcon
          icon={item.icon}
          color={selected ? colors.link : colors.textDim}
        />
      </View>
      <Text style={styles.rowName} numberOfLines={1}>
        {before}
        {match ? <Text style={styles.rowMatch}>{match}</Text> : null}
        {after}
      </Text>
      <Text style={styles.rowType}>{item.type}</Text>
    </Pressable>
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

/**
 * Header search: jumps to the organization's own pages. Nothing here calls the
 * API; the destinations come from the navigation registry.
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
  const { billingEnabled } = useAuth()
  const scopeId = useOptionalWorkspaceScope()?.scopeId ?? ALL_WORKSPACES_SCOPE
  const inputRef = useRef<TextInputHandle>(null)
  const wrapRef = useRef<View>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [index, setIndex] = useState(0)

  const shown = useMemo(
    () =>
      filterSearchDestinations(
        searchDestinations(orgId, { billingEnabled, projectsScopeId: scopeId }),
        query,
      ),
    [orgId, billingEnabled, scopeId, query],
  )
  const active = shown[Math.min(index, shown.length - 1)]
  const trimmed = query.trim()
  const isMac = isWeb && /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? '')

  useEffect(() => {
    if (collapsed) inputRef.current?.focus()
  }, [collapsed])

  useHeaderSearchShortcut(() => inputRef.current?.focus(), !collapsed)

  if (!isWeb) return null

  const close = () => {
    setQuery('')
    setIndex(0)
    setOpen(false)
    inputRef.current?.blur()
    onClose?.()
  }
  const pick = (item: SearchDestination | undefined) => {
    if (!item) return
    close()
    router.push(item.href as Href)
  }

  const onKeyPress = (event: {
    nativeEvent: { key: string }
    preventDefault: () => void
  }) => {
    const { key } = event.nativeEvent
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setIndex(moveSearchIndex(index, shown.length, key === 'ArrowDown' ? 'down' : 'up'))
    } else if (key === 'Enter') {
      event.preventDefault()
      pick(active)
    } else if (key === 'Escape') {
      close()
    }
  }

  const onBlur = (blurEvent: unknown) => {
    const event = blurEvent as { relatedTarget?: unknown }
    const wrap = wrapRef.current as unknown as HTMLElement | null
    const next = event.relatedTarget as Node | null
    // Clicking a result moves focus to the row first; keep the list open for it.
    if (next && wrap?.contains(next)) return
    setFocused(false)
    setOpen(false)
    if (collapsed) onClose?.()
  }

  const popoverOpen = open && focused

  return (
    <View
      ref={wrapRef}
      accessibilityRole="search"
      style={collapsed ? styles.wrapCollapsed : styles.wrap}
    >
      <Pressable
        style={[styles.field, focused && styles.fieldFocused]}
        onPress={() => inputRef.current?.focus()}
        accessible={false}
        tabIndex={-1}
      >
        <SearchIcon size={16} color={focused ? colors.link : colors.textDim} />
        <TextInput
          ref={inputRef}
          value={query}
          placeholder="Search projects, servers and settings"
          placeholderTextColor={colors.textDim}
          accessibilityLabel="Search"
          role="combobox"
          aria-expanded={popoverOpen}
          aria-controls={LIST_ID}
          aria-autocomplete="list"
          aria-activedescendant={popoverOpen && active ? optionId(active.id) : undefined}
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
          style={styles.input}
          onChangeText={(text) => {
            setQuery(text)
            setIndex(0)
            setOpen(true)
          }}
          onFocus={() => {
            setFocused(true)
            setOpen(true)
          }}
          onBlur={onBlur}
          onKeyPress={onKeyPress}
        />
        {!collapsed && !focused ? (
          <View style={styles.kbd} aria-hidden>
            <Text style={styles.kbdLabel}>{isMac ? '⌘K' : 'Ctrl K'}</Text>
          </View>
        ) : null}
        {collapsed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close search"
            style={[styles.closeButton, webPointer]}
            onPress={close}
          >
            <Text style={styles.closeGlyph}>{'✕'}</Text>
          </Pressable>
        ) : null}
      </Pressable>

      {popoverOpen ? (
        <View style={styles.popover} tabIndex={-1}>
          <Text id={HEADING_ID} style={styles.heading}>
            {trimmed ? 'Results' : 'Jump to'}
          </Text>
          {shown.length > 0 ? (
            <>
              <View
                id={LIST_ID}
                {...LISTBOX_ROLE}
                aria-labelledby={HEADING_ID}
                style={styles.list}
              >
                {shown.map((item, position) => (
                  <SearchRow
                    key={item.id}
                    item={item}
                    query={query}
                    selected={item.id === active?.id}
                    onHover={() => setIndex(position)}
                    onPick={() => pick(item)}
                  />
                ))}
              </View>
              {collapsed ? null : (
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
              )}
            </>
          ) : (
            <Text id={LIST_ID} style={styles.none}>
              {`No matches for “${trimmed}”.`}
            </Text>
          )}
        </View>
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
  list: { gap: 2, maxHeight: 320 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
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
