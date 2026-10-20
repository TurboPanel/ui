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
  HEADER_TRIGGER_ICON_SIZE,
  headerMenuGroupStyles,
} from '@/components/header-menu-group-styles'
import { HeaderMenuOverlay } from '@/components/header-menu-overlay'
import { HeaderMenuTrigger } from '@/components/header-menu-trigger'
import { BillingNavIcon, GearIcon, OrganizationIcon, PlusIcon } from '@/components/icons/nav-icons'
import { OrganizationSwitcherList } from '@/components/org/organization-switcher-list'
import { dropdownLeft, headerLayoutFor } from '@/lib/header-layout'
import { truncateDisplayName } from '@/lib/display-name'
import {
  organizationLabel,
  shouldShowOrgSwitcherSearch,
  shouldShowViewAllOrganizations,
} from '@/lib/organization-switcher'
import { setActiveOrganizationId } from '@/lib/org-context'
import { useAuth } from '@/lib/auth-context'
import {
  defaultOrgDashboardHref,
  orgBillingHref,
  orgManageHref,
  organizationsHref,
  replaceOrganization,
} from '@/lib/org-navigation'
import { useCreateOrganization, useOrganizationsQuery } from '@/lib/queries/auth'
import { colors, webPointer } from '@/lib/theme'

const isNative = Platform.OS !== 'web'
/** Desktop dropdown width; phones use the full-width top panel instead. */
export const ORG_MENU_WIDTH = 400
const COMPACT_FOOTER_HEIGHT = 150
const COMPACT_SEARCH_HEIGHT = 52
const COMPACT_LIST_MIN = 132
const COMPACT_PANEL_MAX = 420

function compactListMaxHeight(
  windowHeight: number,
  isCompact: boolean,
  showSearch: boolean,
): number {
  if (!isCompact) {
    return 8 * 40
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
  const header = headerLayoutFor(width, isNative)
  const isCompact = header.compact
  const orgsQuery = useOrganizationsQuery()
  const createOrganization = useCreateOrganization()
  // Billing lives here, behind the organization menu, rather than in the
  // sidebar: hosted only, and reached on purpose rather than glanced at.
  const { billingEnabled } = useAuth()
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
      // The trigger sits at the left of the header, so the menu opens flush
      // with its left edge (and is kept on screen).
      setMenuPosition({
        top: y + h + 6,
        left: dropdownLeft({
          x,
          triggerWidth: w,
          menuWidth: Math.min(ORG_MENU_WIDTH, width - 24),
          windowWidth: width,
          align: 'start',
        }),
      })
    })
  }, [menuOpen, isCompact, width])

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
  const showSearch = shouldShowOrgSwitcherSearch(organizations.length)
  const showViewAll = shouldShowViewAllOrganizations(organizations.length)
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

  const openBilling = () => {
    closeMenu()
    const billingHref = orgBillingHref(orgId)
    if (pathname === billingHref) {
      return
    }
    router.push(billingHref as Href)
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

        <MenuAction
          label="New organization"
          accessibilityLabel="Create organization"
          onPress={openCreate}
          strong
          icon={<PlusIcon size={14} color={colors.link} />}
        />
        <MenuAction
          label="Settings"
          accessibilityLabel="Organization settings"
          onPress={openSettings}
          icon={<GearIcon size={14} color={colors.textDim} />}
        />
        {billingEnabled ? (
          <MenuAction
            label="Billing"
            accessibilityLabel="Organization billing and licenses"
            onPress={openBilling}
            icon={<BillingNavIcon size={14} color={colors.textDim} />}
          />
        ) : null}
        {showViewAll ? (
          <MenuAction
            label="View all organizations"
            accessibilityLabel="View all organizations"
            onPress={openAllOrganizations}
          />
        ) : null}
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
          {header.showOrgGlyph ? (
            <View style={headerMenuGroupStyles.triggerGlyph}>
              <OrganizationIcon size={HEADER_TRIGGER_ICON_SIZE} color={colors.textDim} />
            </View>
          ) : null}
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
        menuWidth={Math.min(ORG_MENU_WIDTH, width - 24)}
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

function MenuAction({
  label,
  accessibilityLabel,
  onPress,
  icon,
  strong = false,
}: Readonly<{
  label: string
  accessibilityLabel: string
  onPress: () => void
  icon?: ReactNode
  strong?: boolean
}>) {
  return (
    <Pressable
      style={({ pressed }) => [
        headerMenuGroupStyles.menuItem,
        styles.action,
        pressed && headerMenuGroupStyles.itemPressed,
        webPointer,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={headerMenuGroupStyles.menuItemMark}>{icon}</View>
      <Text
        style={[
          headerMenuGroupStyles.menuItemLabel,
          strong ? headerMenuGroupStyles.menuItemLabelActive : null,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
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
  action: {
    paddingVertical: 0,
    minHeight: 40,
  },
})
