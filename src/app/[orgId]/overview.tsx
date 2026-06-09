import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { AppShell } from '@/components/app-shell'
import { dashboardHref, useAuth } from '@/lib/auth-context'
import { colors, spacing } from '@/lib/theme'

export default function OrganizationOverviewScreen() {
  const { session, needsInstall } = useAuth()
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  if (needsInstall) {
    return <Redirect href={'/install' as Href} />
  }

  if (session?.organizationId && orgId !== session.organizationId) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  return (
    <AppShell title="Overview">
      <View style={styles.panel}>
        <Text style={styles.heading}>Organization overview</Text>
        <Text style={styles.copy}>
          Signed in
          {session?.username
            ? ` as ${session.username}`
            : session?.email
              ? ` as ${session.email}`
              : ''}
          . This is the landing dashboard for your organization.
        </Text>
        {orgId ? (
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Organization ID</Text>
            <Text style={styles.metaValue}>{orgId}</Text>
          </View>
        ) : null}
      </View>
    </AppShell>
  )
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    maxWidth: 720,
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  metaBox: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.bgPanel,
  },
  metaLabel: {
    color: colors.textLabel,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metaValue: {
    color: colors.textBody,
    fontSize: 14,
    fontFamily: 'monospace',
  },
})
