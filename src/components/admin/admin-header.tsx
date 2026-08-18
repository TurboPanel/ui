import { Pressable, StyleSheet, View } from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderAdminAccountControls } from '@/components/header-account-controls'
import { webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import { colors, spacing } from '@/lib/theme'

export function AdminHeader({
  onMenuPress,
}: Readonly<{ onMenuPress?: () => void }>) {
  const { session, signOut } = useAuth()
  const userLabel = session?.email

  return (
    <GlassSurface style={styles.header} intensity="strong" rim="bottom">
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
          <HeaderAdminAccountControls email={userLabel} onSignOut={signOut} />
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
  buttonPressed: {
    opacity: 0.85,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
})
