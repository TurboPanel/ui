import { useRouter, type Href } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchManagedServices,
  isForbiddenError,
  type ManagedServiceRecord,
} from '@/lib/instance-api'
import {
  MANAGED_SERVICE_CATALOG,
  type ManagedServiceCatalogEntry,
  type ManagedServiceStatus,
} from '@/lib/managed-services'
import { orgRouteHref } from '@/lib/org-navigation'
import { colors, spacing } from '@/lib/theme'

function statusLabel(status: ManagedServiceStatus): string {
  switch (status) {
    case 'available':
      return 'Ready to provision'
    case 'coming-soon':
      return 'Coming soon'
    case 'provisioning':
      return 'Provisioning'
    case 'ready':
      return 'Running'
    case 'failed':
      return 'Failed'
  }
}

function EngineCard({
  entry,
  onPress,
}: Readonly<{
  entry: ManagedServiceCatalogEntry
  onPress?: () => void
}>) {
  const selectable = entry.status === 'available'
  return (
    <Pressable
      style={[styles.engineCard, !selectable && styles.engineCardDisabled]}
      disabled={!selectable}
      onPress={onPress}
    >
      <View style={styles.engineHeader}>
        <Text style={styles.engineLabel}>{entry.label}</Text>
        <View
          style={[
            styles.statusPill,
            entry.status === 'available' && styles.statusPillLive,
            entry.status === 'coming-soon' && styles.statusPillMuted,
          ]}
        >
          <Text
            style={[
              styles.statusPillText,
              entry.status === 'available' && styles.statusPillTextLive,
            ]}
          >
            {statusLabel(entry.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.engineDescription}>{entry.description}</Text>
      <Text style={orgPanelStyles.muted}>Default port {entry.defaultPort}</Text>
    </Pressable>
  )
}

function ProvisionedRow({
  row,
  onPress,
}: Readonly<{ row: ManagedServiceRecord; onPress: () => void }>) {
  const engineLabel =
    MANAGED_SERVICE_CATALOG.find((entry) => entry.engine === row.engine)?.label ??
    row.engine ??
    'Service'
  return (
    <Pressable style={styles.provisionedRow} onPress={onPress}>
      <View style={styles.provisionedMain}>
        <Text style={styles.provisionedName}>
          {row.displayName?.trim() || engineLabel}
        </Text>
        <Text style={orgPanelStyles.muted}>
          {engineLabel} · {row.serverDisplayName?.trim() || row.serverId}
        </Text>
      </View>
      <View
        style={[
          styles.statusPill,
          row.status === 'ready' && styles.statusPillLive,
          row.status === 'failed' && styles.statusPillFailed,
        ]}
      >
        <Text
          style={[
            styles.statusPillText,
            row.status === 'ready' && styles.statusPillTextLive,
          ]}
        >
          {statusLabel(row.status)}
        </Text>
      </View>
    </Pressable>
  )
}

export function ManagedServicesSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const createHref = `${orgRouteHref(orgId, 'servers', 'managed')}/new` as Href
  const [provisioned, setProvisioned] = useState<ManagedServiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProvisioned = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchManagedServices()
      setProvisioned(result.managedServices)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to load services')
    } finally {
      setLoading(false)
    }
  }, [handleUnauthorized])

  useEffect(() => {
    void loadProvisioned()
  }, [loadProvisioned])

  const sortedCatalog = useMemo(
    () =>
      [...MANAGED_SERVICE_CATALOG].sort((a, b) => {
        if (a.status === 'available' && b.status !== 'available') return -1
        if (b.status === 'available' && a.status !== 'available') return 1
        return a.label.localeCompare(b.label)
      }),
    [],
  )

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Managed services</Text>

      <SectionPanel
        title="Provisioned"
        hint={`${provisioned.length} on your fleet`}
        accent
      >
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {loading ? (
          <Text style={orgPanelStyles.muted}>Loading…</Text>
        ) : null}
        {!loading && provisioned.length === 0 ? (
          <View style={orgPanelStyles.statePanel}>
            <Text style={orgPanelStyles.statePanelTitle}>No managed services yet</Text>
            <Text style={orgPanelStyles.muted}>
              Provision Postgres on a connected server to get started.
            </Text>
          </View>
        ) : null}
        <View style={styles.provisionedList}>
          {provisioned.map((row) => (
            <ProvisionedRow
              key={row.id}
              row={row}
              onPress={() =>
                router.push(
                  `${orgRouteHref(orgId, 'servers', 'managed')}/${row.id}` as Href,
                )
              }
            />
          ))}
        </View>
      </SectionPanel>

      <SectionPanel title="Engines" hint="Postgres available now">
        <Pressable
          style={orgPanelStyles.toolbarBtnPrimary}
          onPress={() => router.push(createHref)}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Provision Postgres</Text>
        </Pressable>

        <View style={styles.engineGrid}>
          {sortedCatalog.map((entry) => (
            <EngineCard
              key={entry.engine}
              entry={entry}
              onPress={
                entry.status === 'available'
                  ? () => router.push(createHref)
                  : undefined
              }
            />
          ))}
        </View>
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  provisionedList: {
    gap: spacing.sm,
  },
  provisionedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgSecondary,
    padding: spacing.sm,
  },
  provisionedMain: {
    flex: 1,
    gap: 2,
  },
  provisionedName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  engineGrid: {
    gap: spacing.sm,
  },
  engineCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  engineCardDisabled: {
    opacity: 0.72,
  },
  engineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  engineLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  engineDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusPillLive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  statusPillMuted: {
    backgroundColor: colors.bgInset,
  },
  statusPillFailed: {
    borderColor: colors.error,
    backgroundColor: colors.bgSecondary,
  },
  statusPillText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusPillTextLive: {
    color: colors.accent,
  },
})
