import { Link, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { StatusDot } from '@/components/ui'
import { serviceStatusTone } from '@/lib/container-status'
import { appTagLabel } from '@/lib/compose/app-facts'
import type { StackRow } from '@/lib/compose/stack-rows'
import type { ContainerRecord, ServiceRecord } from '@/lib/instance-api'
import { projectServiceHref } from '@/lib/project-navigation'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

/**
 * Phone Overview: the stack as a vertical list, one card per service, in place
 * of the diagram. Each card opens the service when the control plane knows it.
 */
export function ComposeStackList({
  rows,
  orgId,
  projectId,
  services,
  containersByService,
  showServiceStatus,
}: Readonly<{
  rows: readonly StackRow[]
  orgId: string
  projectId: string
  services: readonly ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  showServiceStatus: boolean
}>) {
  const serviceByName = new Map(services.map((service) => [service.composeServiceName, service]))
  return (
    <View style={styles.list} accessibilityLabel="Stack">
      <Text style={styles.heading}>Stack</Text>
      {rows.map((row) => {
        const service = serviceByName.get(row.name)
        const tone =
          showServiceStatus && service
            ? serviceStatusTone(containersByService[service.id] ?? [])
            : null
        const card = (
          <View style={styles.card}>
            <View style={styles.titleRow}>
              {tone ? <StatusDot size="sm" color={tone.color} /> : null}
              <Text style={styles.name} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={styles.kind}>{appTagLabel(service?.app) ?? row.kind}</Text>
            </View>
            {row.source ? (
              <Text style={styles.muted} numberOfLines={1}>
                {row.source}
              </Text>
            ) : null}
            {row.reach ? (
              <Text style={styles.muted} numberOfLines={1}>
                {row.reach}
              </Text>
            ) : null}
            {row.database ? (
              <Text style={styles.database} numberOfLines={1}>
                {row.database}
              </Text>
            ) : null}
          </View>
        )
        if (!service) return <View key={row.name}>{card}</View>
        return (
          <Link
            key={row.name}
            href={projectServiceHref(orgId, projectId, service.id) as Href}
            asChild
          >
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={tone ? `${row.name}, ${tone.label}` : row.name}
              style={webPointer}
            >
              {card}
            </Pressable>
          </Link>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  heading: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  card: {
    gap: 2,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderLeftWidth: 3,
    borderLeftColor: chrome.accent,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  kind: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  muted: { color: colors.textMuted, fontSize: 12 },
  database: { color: colors.ok, fontSize: 11, fontWeight: '600' },
})
