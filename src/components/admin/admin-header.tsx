import { usePathname } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderUserAccountControl } from '@/components/header-account-controls'
import { useAuth } from '@/lib/auth-context'
import { adminAreaFromPathname } from '@/lib/admin-navigation'
import { colors, spacing } from '@/lib/theme'

export function AdminHeader({
  onMenuPress,
}: Readonly<{ onMenuPress?: () => void }>) {
  const pathname = usePathname()
  const { session, signOut } = useAuth()
  const match = adminAreaFromPathname(pathname)

  const title = match ? match.area.label : 'Admin'
  const userLabel = session?.email ?? session?.username

  return (
    <GlassSurface style={styles.header} intensity="strong">
      <View style={styles.headerMain}>
        {onMenuPress ? (
          <Pressable style={styles.menuButton} onPress={onMenuPress}>
            <Text style={styles.menuButtonText}>Menu</Text>
          </Pressable>
        ) : null}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {match?.area.hint ? (
            <Text style={styles.hint}>{match.area.hint}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.headerActions}>
        {session && userLabel ? (
          <HeaderUserAccountControl email={userLabel} onSignOut={signOut} />
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
  },
  menuButton: {
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuButtonText: {
    color: colors.textChip,
    fontSize: 14,
    fontWeight: '600',
  },
  titleBlock: {
    gap: spacing.xs,
    flexShrink: 1,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  hint: {
    color: colors.textDim,
    fontSize: 13,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
})
