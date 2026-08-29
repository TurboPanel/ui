import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderAccountControls } from '@/components/header-account-controls'
import { useAuth } from '@/lib/auth-context'
import { colors, spacing, webPointer } from '@/lib/theme'

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

  return (
    <GlassSurface
      style={[styles.header, style]}
      intensity="strong"
      rim="bottom"
    >
      <View style={styles.headerMain}>
        {onMenuPress ? (
          <Pressable
            style={({ pressed }) => [
              styles.menuButton,
              pressed && styles.buttonPressed,
              webPointer,
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
        ) : (
          <View style={styles.headerSpacer} />
        )}
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
  headerSpacer: {
    flex: 1,
  },
  menuButton: {
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
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
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  buttonPressed: {
    opacity: 0.85,
  },
})
