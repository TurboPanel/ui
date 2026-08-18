import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { HeaderAccountControls } from '@/components/header-account-controls'
import { useAuth } from '@/lib/auth-context'
import { glass } from '@/lib/glass'
import { colors, spacing } from '@/lib/theme'

/**
 * Native org header — full-bleed fill + bottom hairline only.
 *
 * Owns the top safe-area inset as padding so the background runs edge-to-edge
 * (no left/right SafeArea inset that reads as a side border). Do not use
 * GlassSurface/GlassView — liquid glass paints a system rim on every edge.
 */
export function OrgHeader({
  orgId,
  onMenuPress,
}: Readonly<{
  orgId: string
  onMenuPress?: () => void
}>) {
  const insets = useSafeAreaInsets()
  const { session, signOut } = useAuth()
  const userLabel = session?.email

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <View style={styles.headerMain}>
          <TurboPanelLogo size={28} />
          {onMenuPress ? (
            <Pressable
              style={({ pressed }) => [
                styles.menuButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={onMenuPress}
              accessibilityRole="button"
              accessibilityLabel="Open navigation menu"
            >
              <View style={styles.menuIcon}>
                <View style={styles.menuBar} />
                <View style={styles.menuBar} />
                <View style={styles.menuBarShort} />
              </View>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.headerActions}>
          {session && userLabel ? (
            <HeaderAccountControls
              orgId={orgId}
              email={userLabel}
              onSignOut={signOut}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.hairline} pointerEvents="none" />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    position: 'relative',
    alignSelf: 'stretch',
    width: '100%',
    zIndex: 5,
    backgroundColor: glass.fillStrong,
    borderWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    // Tight band under the status bar — no extra top pad beyond the inset.
    minHeight: 44,
    paddingBottom: 2,
  },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: glass.border,
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
    minWidth: 0,
    flex: 1,
  },
  menuButton: {
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  menuIcon: {
    width: 16,
    gap: 3,
  },
  menuBar: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textChip,
    width: 16,
  },
  menuBarShort: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textChip,
    width: 11,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    flexShrink: 1,
    minWidth: 0,
  },
  buttonPressed: {
    opacity: 0.85,
  },
})
