import { usePathname, useRouter, type Href } from 'expo-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { CreateOrganizationModal } from '@/components/create-organization-modal'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderChevron } from '@/components/header-chevron'
import {
  HEADER_MENU_WIDTH,
  HEADER_TRIGGER_ICON_SIZE,
  headerMenuGroupStyles,
} from '@/components/header-menu-group-styles'
import { HeaderMenuOverlay } from '@/components/header-menu-overlay'
import { HeaderMenuTrigger } from '@/components/header-menu-trigger'
import { GearIcon, OrganizationIcon, PlusIcon } from '@/components/icons/nav-icons'
import { OrganizationSwitcherList } from '@/components/org/organization-switcher-list'
import { truncateDisplayName } from '@/lib/display-name'
import { organizationLabel, shouldShowOrgSwitcherSearch } from '@/lib/organization-switcher'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  defaultOrgDashboardHref,
  orgManageHref,
  organizationsHref,
  replaceOrganization,
} from '@/lib/org-navigation'
import { useCreateOrganization, useOrganizationsQuery } from '@/lib/queries/auth'
import { chrome, colors, layout, spacing, webPointer } from '@/lib/theme'

const isNative = Platform.OS !== 'web'
const COMPACT_FOOTER_HEIGHT = 108
const COMPACT_SEARCH_HEIGHT = 52
const COMPACT_LIST_MIN = 132
const COMPACT_PANEL_MAX = 420

function compactListMaxHeight(
  windowHeight: number,
  isCompact: boolean,
  showSearch: boolean,
): number {
  if (!isCompact) {
    return 280
  }
  const search = showSearch ? COMPACT_SEARCH_HEIGHT : 0
  // Keep the from-top panel in the upper half so the iOS keyboard does not
  // cover Manage / New (those sit in a sticky footer under the list).
  const panelMax = Math.min(COMPACT_PANEL_MAX, Math.round(windowHeight * 0.5))
  return Math.max(COMPACT_LIST_MIN, panelMax - search - COMPACT_FOOTER_HEIGHT)
}

type OrganizationSwitcherSegmentProps = Readonly<{
  orgId: string
}>

export function OrganizationSwitcherSegment({ orgId }: OrganizationSwitcherSegmentProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { width, height } = useWindowDimensions()
  const isCompact = Platform.OS !== 'web' || width < layout.desktopBreakpoint
  const orgsQuery = useOrganizationsQuery()
  const createOrganization = useCreateOrganization()
  const organizations = orgsQuery.data?.organizations ?? []
  const currentOrg = organizations.find((org) => org.id === orgId)

  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [query, setQuery] = useState('')
  const buttonRef = useRef<View>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 56, left: 16 })

  useEffect(() => {
    if (!menuOpen || isCompact) {
      return
    }
    buttonRef.current?.measureInWindow((x, y, w, h) => {
      setMenuPosition({
        top: y + h + 6,
        left: Math.max(12, x + w - HEADER_MENU_WIDTH),
      })
    })
  }, [menuOpen, isCompact])

  const closeMenu = () => {
    setMenuOpen(false)
    setQuery('')
  }

  let label = orgId
  if (currentOrg) {
    label = organizationLabel(currentOrg)
  } else if (orgsQuery.isLoading) {
    label = 'Loading…'
  }
  const triggerLabel = isNative ? truncateDisplayName(label) : label
  const showSearch = shouldShowOrgSwitcherSearch(organizations.length, false)
  const listMaxHeight = compactListMaxHeight(height, isCompact, showSearch)

  const switchTo = (nextOrgId: string) => {
    if (nextOrgId === orgId) {
      closeMenu()
      return
    }
    setActiveOrganizationId(nextOrgId)
    closeMenu()
    replaceOrganization(router, defaultOrgDashboardHref(nextOrgId) as Href)
  }

  const openCreate = () => {
    closeMenu()
    setCreateOpen(true)
  }

  const openSettings = () => {
    closeMenu()
    const settingsHref = orgManageHref(orgId)
    if (pathname === settingsHref) {
      return
    }
    router.push(settingsHref as Href)
  }

  const openAllOrganizations = () => {
    closeMenu()
    const href = organizationsHref()
    if (pathname === href || pathname === '/welcome') {
      return
    }
    router.push(href as Href)
  }

  const handleCreate = async (name: string) => {
    const result = await createOrganization.run({ name })
    if (!result.ok) {
      return { ok: false, error: result.error ?? 'Could not create organization.' }
    }
    const nextOrgId = result.value?.id
    if (!nextOrgId) {
      return { ok: false, error: 'Could not create organization.' }
    }
    setActiveOrganizationId(nextOrgId)
    replaceOrganization(router, defaultOrgDashboardHref(nextOrgId) as Href)
    return { ok: true }
  }

  const menuBody = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={isCompact ? styles.compactPanel : undefined}
    >
      <GlassSurface
        style={[headerMenuGroupStyles.menu, isCompact && styles.topPanel]}
        intensity="strong"
      >
        {organizations.length > 0 ? (
          <OrganizationSwitcherList
            organizations={organizations}
            query={query}
            onQueryChange={setQuery}
            currentOrgId={orgId}
            onSelect={switchTo}
            showSearch={showSearch}
            autoFocusSearch={!isCompact}
            listMaxHeight={listMaxHeight}
            density="compact"
          />
        ) : null}

        <View style={headerMenuGroupStyles.menuDivider} />

        <View style={styles.footerRow}>
          <FooterAction
            label="Manage"
            accessibilityLabel="Manage Organization"
            onPress={openSettings}
            icon={<GearIcon size={14} color={colors.textChip} />}
          />
          <FooterAction
            label="New"
            accessibilityLabel="Create organization"
            onPress={openCreate}
            icon={<PlusIcon size={14} color={colors.textChip} />}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.viewAll,
            pressed && headerMenuGroupStyles.itemPressed,
            webPointer,
          ]}
          onPress={openAllOrganizations}
          accessibilityRole="button"
          accessibilityLabel="View all organizations"
        >
          <Text style={styles.viewAllLabel}>View all organizations</Text>
        </Pressable>
      </GlassSurface>
    </KeyboardAvoidingView>
  )

  return (
    <>
      <View ref={buttonRef} collapsable={false} style={styles.triggerWrap}>
        <HeaderMenuTrigger
          open={menuOpen}
          onPress={() => setMenuOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={`Organization: ${label}`}
          accessibilityState={{ expanded: menuOpen }}
        >
          <View style={headerMenuGroupStyles.triggerGlyph}>
            <OrganizationIcon size={HEADER_TRIGGER_ICON_SIZE} color={colors.textDim} />
          </View>
          <View style={headerMenuGroupStyles.triggerCopy}>
            <Text
              style={headerMenuGroupStyles.triggerLabel}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {triggerLabel}
            </Text>
          </View>
          <HeaderChevron
            color={menuOpen ? colors.text : colors.textDim}
            open={menuOpen}
          />
        </HeaderMenuTrigger>
      </View>

      <HeaderMenuOverlay
        open={menuOpen}
        onClose={closeMenu}
        closeAccessibilityLabel="Close organization menu"
        presentation={isCompact ? 'fromTop' : 'dropdown'}
        dropdownPosition={menuPosition}
      >
        {menuBody}
      </HeaderMenuOverlay>

      <CreateOrganizationModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </>
  )
}

function FooterAction({
  label,
  accessibilityLabel,
  onPress,
  icon,
}: Readonly<{
  label: string
  accessibilityLabel: string
  onPress: () => void
  icon: ReactNode
}>) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.footerBtn,
        pressed && headerMenuGroupStyles.itemPressed,
        webPointer,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {icon}
      <Text style={styles.footerBtnLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  triggerWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  compactPanel: {
    maxHeight: '100%',
  },
  topPanel: {
    maxHeight: '100%',
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  footerBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  footerBtnLabel: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
  },
  viewAll: {
    minHeight: 44,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  viewAllLabel: {
    color: chrome.accent,
    fontSize: 13,
    fontWeight: '600',
  },
})
