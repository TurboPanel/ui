import { memo } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { HeaderCheck } from '@/components/header-check'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { GearIcon, SearchIcon } from '@/components/icons/nav-icons'
import { webPointer } from '@/components/org/org-panel-styles'
import { EmptyState } from '@/components/ui'
import type { OrganizationRecord } from '@/lib/instance-api'
import {
  organizationLabel,
  visibleOrganizations,
} from '@/lib/organization-switcher'
import { chrome, colors, spacing } from '@/lib/theme'

export type OrganizationSwitcherDensity = 'compact' | 'page'

type OrganizationSwitcherListProps = Readonly<{
  organizations: readonly OrganizationRecord[]
  query: string
  onQueryChange: (query: string) => void
  currentOrgId: string | null
  onSelect: (orgId: string) => void
  onManage?: (orgId: string) => void
  showSearch: boolean
  autoFocusSearch?: boolean
  listMaxHeight?: number
  density: OrganizationSwitcherDensity
  style?: StyleProp<ViewStyle>
}>

function OrganizationSearchField({
  value,
  onChange,
  autoFocus,
}: Readonly<{
  value: string
  onChange: (query: string) => void
  autoFocus: boolean
}>) {
  return (
    <View style={styles.searchWrap}>
      <SearchIcon size={16} color={colors.textDim} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Filter organizations"
        placeholderTextColor={colors.textDim}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        autoFocus={autoFocus}
        returnKeyType="search"
        accessibilityLabel="Filter organizations"
      />
    </View>
  )
}

function rowShellStyle(compactWeb: boolean, active: boolean) {
  if (compactWeb) {
    return [
      headerMenuGroupStyles.menuItem,
      active ? headerMenuGroupStyles.menuItemActive : null,
    ]
  }
  return [styles.pageRow, active ? styles.pageRowActive : null]
}

function rowLabelStyle(compactWeb: boolean, active: boolean) {
  if (compactWeb) {
    return [
      headerMenuGroupStyles.menuItemLabel,
      active ? headerMenuGroupStyles.menuItemLabelActive : null,
    ]
  }
  return [styles.pageRowLabel, active ? styles.pageRowLabelActive : null]
}

const OrganizationSwitcherRow = memo(function OrganizationSwitcherRow({
  name,
  active,
  density,
  onPress,
  onManage,
}: Readonly<{
  name: string
  active: boolean
  density: OrganizationSwitcherDensity
  onPress: () => void
  onManage?: () => void
}>) {
  const compactWeb = density === 'compact' && Platform.OS === 'web'

  return (
    <View style={[styles.row, rowShellStyle(compactWeb, active)]}>
      <Pressable
        style={({ pressed }) => [
          styles.rowMain,
          pressed && headerMenuGroupStyles.itemPressed,
          webPointer,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          active ? `${name}, current organization` : `Switch to ${name}`
        }
        accessibilityState={{ selected: active }}
      >
        <View style={headerMenuGroupStyles.menuItemMark}>
          {active ? <HeaderCheck color={chrome.accent} /> : null}
        </View>
        <Text
          style={rowLabelStyle(compactWeb, active)}
          numberOfLines={1}
        >
          {name}
        </Text>
        {active ? <Text style={styles.currentBadge}>Current</Text> : null}
      </Pressable>
      {onManage ? (
        <Pressable
          style={({ pressed }) => [
            styles.gearBtn,
            pressed && headerMenuGroupStyles.itemPressed,
            webPointer,
          ]}
          onPress={onManage}
          accessibilityRole="button"
          accessibilityLabel={`Manage ${name}`}
          hitSlop={8}
        >
          <GearIcon size={16} color={colors.textDim} />
        </Pressable>
      ) : null}
    </View>
  )
})

export function OrganizationSwitcherList({
  organizations,
  query,
  onQueryChange,
  currentOrgId,
  onSelect,
  onManage,
  showSearch,
  autoFocusSearch = false,
  listMaxHeight,
  density,
  style,
}: OrganizationSwitcherListProps) {
  const visible = visibleOrganizations(organizations, query, currentOrgId)
  const trimmedQuery = query.trim()
  const autoFocus = autoFocusSearch && Platform.OS === 'web'

  let listBody
  if (visible.length === 0 && trimmedQuery) {
    listBody = (
      <View style={styles.emptyHint}>
        <EmptyState title={`No organizations match “${trimmedQuery}”.`} />
      </View>
    )
  } else {
    listBody = visible.map((org) => {
      const name = organizationLabel(org)
      return (
        <OrganizationSwitcherRow
          key={org.id}
          name={name}
          active={org.id === currentOrgId}
          density={density}
          onPress={() => onSelect(org.id)}
          onManage={onManage ? () => onManage(org.id) : undefined}
        />
      )
    })
  }

  return (
    <View
      style={[
        styles.root,
        density === 'page' ? styles.rootFill : null,
        style,
      ]}
    >
      {showSearch ? (
        <OrganizationSearchField
          value={query}
          onChange={onQueryChange}
          autoFocus={autoFocus}
        />
      ) : null}
      <ScrollView
        style={
          listMaxHeight == null ? styles.flexList : { maxHeight: listMaxHeight }
        }
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {listBody}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
    minHeight: 0,
  },
  rootFill: {
    flex: 1,
  },
  flexList: {
    flex: 1,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  pageRow: {
    borderRadius: 8,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    minHeight: 44,
  },
  pageRowActive: {
    backgroundColor: chrome.bgActive,
  },
  pageRowLabel: {
    color: colors.textBody,
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
    minWidth: 0,
  },
  pageRowLabelActive: {
    color: colors.text,
    fontWeight: '600',
  },
  currentBadge: {
    color: chrome.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  gearBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emptyHint: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
})
