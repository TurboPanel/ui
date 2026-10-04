import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderAccountControls } from '@/components/header-account-controls'
import { HeaderMenuButton } from '@/components/header-menu-button'
import { ReturnToInstanceSegment } from '@/components/return-to-instance'
import { useAuth } from '@/lib/auth-context'
import { headerLayoutFor } from '@/lib/header-layout'
import { spacing } from '@/lib/theme'

export function AdminHeader({
  onMenuPress,
}: Readonly<{ onMenuPress?: () => void }>) {
  const { session, signOut } = useAuth()
  const userLabel = session?.email
  const { width } = useWindowDimensions()
  const header = headerLayoutFor(width, false)

  return (
    <GlassSurface
      style={[styles.header, header.compact && styles.headerCompact]}
      intensity="strong"
      rim="bottom"
    >
      <View style={styles.headerMain}>
        {onMenuPress ? <HeaderMenuButton onPress={onMenuPress} /> : null}
        {header.showLogo ? <TurboPanelLogo size={28} /> : null}
        <View style={styles.backSlot}>
          <ReturnToInstanceSegment />
        </View>
      </View>

      <View style={styles.headerActions}>
        {session && userLabel ? (
          <HeaderAccountControls email={userLabel} onSignOut={signOut} />
        ) : null}
      </View>
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
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
    minWidth: 0,
    flex: 1,
  },
  headerCompact: {
    paddingHorizontal: spacing.md,
  },
  backSlot: {
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
