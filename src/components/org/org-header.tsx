import { useState } from 'react'
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderAccountControls } from '@/components/header-account-controls'
import { HeaderMenuButton } from '@/components/header-menu-button'
import { HeaderBreadcrumb } from '@/components/org/header-breadcrumb'
import { useHeaderBreadcrumb } from '@/components/org/use-header-breadcrumb'
import { OrganizationSwitcherSegment } from '@/components/organization-switcher'
import {
  HeaderSearch,
  HeaderSearchButton,
  useHeaderSearchShortcut,
} from '@/components/header-search'
import { useAuth } from '@/lib/auth-context'
import { showsBreadcrumb } from '@/lib/header-breadcrumb'
import { headerLayoutFor } from '@/lib/header-layout'
import { HEADER_SEARCH_COLLAPSE_WIDTH } from '@/lib/header-search'
import { spacing } from '@/lib/theme'

export function OrgHeader({
  orgId,
  onMenuPress,
  style,
}: Readonly<{
  orgId: string
  onMenuPress?: () => void
  style?: StyleProp<ViewStyle>
}>) {
  const { session, signOut } = useAuth()
  const userLabel = session?.email
  const { width } = useWindowDimensions()
  const header = headerLayoutFor(width, false)
  const searchCollapsed = width < HEADER_SEARCH_COLLAPSE_WIDTH
  const [searchOpen, setSearchOpen] = useState(false)
  const crumb = useHeaderBreadcrumb(orgId)
  const showCrumb = crumb !== null && showsBreadcrumb(width)
  useHeaderSearchShortcut(() => setSearchOpen(true), searchCollapsed)

  return (
    <GlassSurface
      style={[styles.header, header.compact && styles.headerCompact, style]}
      intensity="strong"
      rim="bottom"
    >
      <View style={styles.headerMain}>
        {onMenuPress ? <HeaderMenuButton onPress={onMenuPress} /> : null}
        {header.showLogo ? <TurboPanelLogo size={28} /> : null}
        <View style={styles.orgSlot}>
          <OrganizationSwitcherSegment orgId={orgId} />
        </View>
        {showCrumb ? (
          <View style={styles.crumbSlot}>
            <HeaderBreadcrumb crumb={crumb} />
          </View>
        ) : null}
        {searchCollapsed ? null : <HeaderSearch orgId={orgId} keepWidth={showCrumb} />}
      </View>

      <View style={styles.headerActions}>
        {searchCollapsed ? (
          <HeaderSearchButton onPress={() => setSearchOpen(true)} />
        ) : null}
        {session && userLabel ? (
          <HeaderAccountControls email={userLabel} onSignOut={signOut} />
        ) : null}
      </View>

      {searchCollapsed && searchOpen ? (
        <View style={styles.searchOverlay}>
          <HeaderSearch orgId={orgId} collapsed onClose={() => setSearchOpen(false)} />
        </View>
      ) : null}
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  header: {
    borderRadius: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
    zIndex: 5,
    // The search results list hangs below the header.
    overflow: 'visible',
  },
  searchOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    bottom: spacing.md,
    zIndex: 5,
  },
  headerCompact: {
    paddingHorizontal: spacing.md,
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
    minWidth: 0,
    flex: 1,
  },
  orgSlot: {
    flexShrink: 1,
    minWidth: 0,
  },
  // Takes what the search leaves and shrinks (with an ellipsis) before the search does.
  crumbSlot: {
    flexShrink: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
})
