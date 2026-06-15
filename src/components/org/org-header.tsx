import { usePathname } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth-context'
import { orgAreaFromPathname } from '@/lib/org-navigation'
import { colors, spacing } from '@/lib/theme'

export function OrgHeader({ onMenuPress }: { onMenuPress?: () => void }) {
  const pathname = usePathname()
  const { session, signOut } = useAuth()
  const match = orgAreaFromPathname(pathname)

  const title = match
    ? match.subRoute
      ? `${match.area.label} · ${match.subRoute.label}`
      : match.area.label
    : 'Dashboard'

  return (
    <View style={styles.header}>
      <View style={styles.headerMain}>
        {onMenuPress ? (
          <Pressable style={styles.menuButton} onPress={onMenuPress}>
            <Text style={styles.menuButtonText}>Menu</Text>
          </Pressable>
        ) : null}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {match?.subRoute?.hint || match?.area.hint ? (
            <Text style={styles.hint}>
              {match.subRoute?.hint ?? match.area.hint}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.headerActions}>
        {session?.email || session?.username ? (
          <Text style={styles.userLabel}>
            {session.email ?? session.username}
          </Text>
        ) : null}
        {session ? (
          <Pressable
            style={styles.linkButton}
            onPress={() => void signOut()}
          >
            <Text style={styles.linkButtonText}>Sign out</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
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
  userLabel: {
    color: colors.textMuted,
    fontSize: 13,
    maxWidth: 180,
  },
  linkButton: {
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  linkButtonText: {
    color: colors.textChip,
    fontSize: 14,
    fontWeight: '600',
  },
})
