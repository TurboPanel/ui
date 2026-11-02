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
import { breadcrumbStyles, CRUMB_BOX, CRUMB_PADDING } from '@/components/org/breadcrumb-styles'
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
import { colors, spacing, webPointer } from '@/lib/theme'

const isNative = Platform.OS !== 'web'
/** Desktop dropdown width; phones use the full-width top panel instead. */
export const ORG_MENU_WIDTH = 400
/** Footer = divider and padding plus one 40px row per action. */
const COMPACT_FOOTER_PADDING = 30
const COMPACT_FOOTER_ROW = 40
const COMPACT_SEARCH_HEIGHT = 52
const COMPACT_LIST_MIN = 132
const COMPACT_PANEL_MAX = 420

function compactListMaxHeight(
  windowHeight: number,
  isCompact: boolean,
  showSearch: boolean,
  footerRows: number
): number {
  if (!isCompact) {
    return 8 * 40
  }
  const search = showSearch ? COMPACT_SEARCH_HEIGHT : 0
  const footer = COMPACT_FOOTER_PADDING + footerRows * COMPACT_FOOTER_ROW
  // Keep the from-top panel in the upper half so the iOS keyboard does not
  // cover Manage / New (those sit in a sticky footer under the list).
  const panelMax = Math.min(COMPACT_PANEL_MAX, Math.round(windowHeight * 0.5))
  return Math.max(COMPACT_LIST_MIN, panelMax - search - footer)
}

/**
 * `menu` is the standalone header control; `crumb` draws the same button as
 * the first level of the header breadcrumb (same height, text and padding as
 * the other crumbs).
 */
export type OrganizationSwitcherVariant = 'menu' | 'crumb'

type OrganizationSwitcherSegmentProps = Readonly<{
  orgId: string
  variant?: OrganizationSwitcherVariant
  /** As a crumb: no deeper level follows, so the name reads as the current page. */
  current?: boolean
}>

export function OrganizationSwitcherSegment({
  orgId,
  variant = 'menu',
  current = false,
}: OrganizationSwitcherSegmentProps) {
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
  const listMaxHeight = compactListMaxHeight(
    height,
    isCompact,
    showSearch,
    // New organization and Settings always show; Billing and View all do not.
    2 + (billingEnabled ? 1 : 0) + (showViewAll ? 1 : 0)
  )

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
          accessibilityLabel="Organization Settings"
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
      <View
        ref={buttonRef}
        collapsable={false}
        style={[styles.triggerWrap, variant === 'crumb' && styles.crumbWrap]}
      >
        <OrgTrigger
          label={triggerLabel}
          accessibilityName={label}
          open={menuOpen}
          showGlyph={header.showOrgGlyph}
          variant={variant}
          current={current}
          onPress={() => setMenuOpen((wasOpen) => !wasOpen)}
        />
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

/** The org crumb's icon, sized to its 13px text rather than the 16px menu icon. */
const CRUMB_GLYPH_SIZE = 14
const CRUMB_CHEVRON_SIZE = 10
/** The menu trigger's height: the crumb keeps it as its anchor so the menu opens where it always has. */
const MENU_ANCHOR_HEIGHT = 40

function OrgTrigger({
  label,
  accessibilityName,
  open,
  showGlyph,
  variant,
  current,
  onPress,
}: Readonly<{
  label: string
  accessibilityName: string
  open: boolean
  showGlyph: boolean
  variant: OrganizationSwitcherVariant
  current: boolean
  onPress: () => void
}>) {
  const crumb = variant === 'crumb'
  const labelStyle = crumb
    ? [breadcrumbStyles.linkText, current && styles.crumbCurrentLabel]
    : headerMenuGroupStyles.triggerLabel
  return (
    <HeaderMenuTrigger
      open={open}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Organization: ${accessibilityName}`}
      accessibilityState={{ expanded: open }}
      style={crumb ? styles.crumbTrigger : undefined}
    >
      {showGlyph ? (
        <View style={[headerMenuGroupStyles.triggerGlyph, crumb && styles.crumbGlyph]}>
          <OrganizationIcon
            size={crumb ? CRUMB_GLYPH_SIZE : HEADER_TRIGGER_ICON_SIZE}
            color={colors.textDim}
          />
        </View>
      ) : null}
      <View style={headerMenuGroupStyles.triggerCopy}>
        <Text style={labelStyle} numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
      </View>
      <HeaderChevron
        size={crumb ? CRUMB_CHEVRON_SIZE : undefined}
        color={open ? colors.text : colors.textDim}
        open={open}
      />
    </HeaderMenuTrigger>
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
  crumbWrap: {
    minHeight: MENU_ANCHOR_HEIGHT,
    justifyContent: 'center',
  },
  // The menu button as a crumb: the same box as a breadcrumb link, so the
  // organization and the trail read as one bar.
  crumbTrigger: {
    ...CRUMB_BOX,
    // The menu trigger sets the sides one by one, which beats paddingHorizontal.
    paddingLeft: CRUMB_PADDING,
    paddingRight: CRUMB_PADDING,
    minHeight: 0,
    gap: spacing.xs,
  },
  crumbGlyph: {
    width: CRUMB_GLYPH_SIZE,
    height: CRUMB_GLYPH_SIZE,
    marginRight: 0,
  },
  crumbCurrentLabel: {
    color: colors.text,
    fontWeight: '600',
  },
})
