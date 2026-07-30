import { usePathname } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import { orgAreaFromPathname } from '@/lib/org-navigation'
import { colors, spacing } from '@/lib/theme'

export function OrgHeader({
  onMenuPress,
}: Readonly<{
  onMenuPress?: () => void
}>) {
  const pathname = usePathname()
  const { session, signOut } = useAuth()
  const match = orgAreaFromPathname(pathname)

  let title = 'Dashboard'
  let eyebrow: string | null = null
  if (match?.subRoute) {
    eyebrow = match.area.label
    title = match.subRoute.label
  } else if (match) {
    title = match.area.label
  } else if (pathname.includes('/workspaces')) {
    title = 'Workspaces'
  }

  const hint = match?.subRoute?.hint ?? match?.area.hint
  const userLabel = session?.email ?? session?.username

  return (
    <GlassSurface style={styles.header} intensity="strong">
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
        ) : null}
        <View style={styles.titleBlock}>
          {eyebrow ? (
            <Text style={orgPanelStyles.pageEyebrow}>{eyebrow}</Text>
          ) : null}
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {hint ? (
            <Text style={styles.hint} numberOfLines={2}>
              {hint}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.headerActions}>
        {userLabel ? (
          <View style={orgPanelStyles.userChip}>
            <Text style={orgPanelStyles.userChipText} numberOfLines={1}>
              {userLabel}
            </Text>
          </View>
        ) : null}
        {session ? (
          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.buttonPressed,
              webPointer,
            ]}
            onPress={() => {
              signOut().catch(() => {
                // Sign-out failures are non-blocking in the header.
              })
            }}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        ) : null}
      </View>
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  header: {
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: 1,
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
  titleBlock: {
    gap: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  hint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  signOutButton: {
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.bgInput,
  },
  signOutText: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.85,
  },
})
