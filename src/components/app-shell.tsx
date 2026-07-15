import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth-context'
import { colors, spacing } from '@/lib/theme'

type AppShellProps = Readonly<{
  title: string
  children: ReactNode
}>

export function AppShell({ title, children }: AppShellProps) {
  const { session, signOut } = useAuth()

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.brand}>TurboPanel</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.headerActions}>
          {session ? (
            <Pressable
              style={styles.linkButton}
              onPress={() => {
                signOut().catch(() => {
                  // Sign-out failures are non-blocking in the shell.
                })
              }}
            >
              <Text style={styles.linkButtonText}>Sign out</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
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
    gap: spacing.xs,
    flexShrink: 1,
  },
  brand: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
})
