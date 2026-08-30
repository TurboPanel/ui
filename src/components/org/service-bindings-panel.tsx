import { useMemo, useState } from 'react'
import { useRouter, type Href } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ConfirmButton,
  LoadingState,
  SectionPanel,
} from '@/components/ui'
import type { BindingRecord } from '@/lib/instance-api'
import {
  managedCatalogEntryForCode,
  managedErrorMessage,
} from '@/lib/managed-services'
import { projectTabHref } from '@/lib/project-navigation'
import {
  useDeleteBinding,
  useServiceBindings,
} from '@/lib/queries/bindings'
import { useOrganizationManaged } from '@/lib/queries/managed'
import { chrome, colors, spacing } from '@/lib/theme'

function KeyChip({ label }: Readonly<{ label: string }>) {
  return (
    <View style={styles.keyChip}>
      <Text style={styles.keyChipText}>{label}</Text>
      <Text style={styles.lockGlyph}> locked</Text>
    </View>
  )
}

export function bindingEngineLabel(engine: string | null | undefined): string {
  if (!engine) return 'Database'
  return managedCatalogEntryForCode(engine)?.label ?? engine
}

/** Cluster name + owning project per managed environment id, for card labels. */
export function useManagedClustersByEnvironment(orgId: string) {
  const orgManagedQuery = useOrganizationManaged(orgId)
  return useMemo(() => {
    const map = new Map<string, { projectId: string; name: string }>()
    for (const row of orgManagedQuery.data?.managed ?? []) {
      if (!row.environmentId) continue
      map.set(row.environmentId, {
        projectId: row.projectId,
        name:
          row.name?.trim() ||
          row.projectName?.trim() ||
          bindingEngineLabel(row.engine),
      })
    }
    return map
  }, [orgManagedQuery.data])
}

/**
 * One bound database: engine badge, cluster / database / prefix facts, the
 * locked key chips, and Open / Disconnect. Shared by the service-scoped panel
 * and the Bindings tab's environment list (which adds `serviceLabel`).
 */
export function BindingCard({
  orgId,
  binding,
  cluster,
  serviceLabel,
  canManage,
  busy,
  disabled,
  onDisconnect,
}: Readonly<{
  orgId: string
  binding: BindingRecord
  cluster: { projectId: string; name: string } | undefined
  serviceLabel?: string
  canManage: boolean
  busy: boolean
  disabled: boolean
  onDisconnect: () => void
}>) {
  const router = useRouter()
  return (
    <View style={styles.card}>
      <View style={styles.engineBadge}>
        <Text style={styles.engineBadgeText}>
          {bindingEngineLabel(binding.engine)}
        </Text>
      </View>
      {serviceLabel ? (
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Service: </Text>
          {serviceLabel}
        </Text>
      ) : null}
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Cluster: </Text>
        {cluster?.name ?? 'Managed database'}
      </Text>
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Database: </Text>
        {binding.databaseName}
      </Text>
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Prefix: </Text>
        {binding.keyPrefix}
      </Text>
      <View style={styles.keyRow}>
        {binding.keys.map((key) => (
          <KeyChip key={key} label={key} />
        ))}
      </View>
      <View style={styles.actions}>
        {cluster?.projectId ? (
          <Button
            label="Open database"
            size="sm"
            onPress={() => {
              router.push(
                projectTabHref(orgId, cluster.projectId, 'connect') as Href,
              )
            }}
          />
        ) : null}
        {canManage ? (
          <ConfirmButton
            label="Disconnect"
            confirmLabel="Confirm disconnect"
            busy={busy}
            disabled={disabled}
            onConfirm={onDisconnect}
          />
        ) : null}
      </View>
    </View>
  )
}

export function ServiceBindingsPanel({
  orgId,
  serviceId,
  canManage,
}: Readonly<{
  orgId: string
  serviceId: string
  canManage: boolean
}>) {
  const bindingsQuery = useServiceBindings(orgId, serviceId, {
    enabled: serviceId.length > 0,
  })
  const managedByEnv = useManagedClustersByEnvironment(orgId)
  const deleteBinding = useDeleteBinding(orgId)
  const [error, setError] = useState<string | null>(null)
  const [workingBindingId, setWorkingBindingId] = useState<string | null>(null)

  const bindings = bindingsQuery.data?.bindings ?? []
  if (bindingsQuery.isLoading) {
    return (
      <SectionPanel title="Bound databases" hint="Connected managed clusters">
        <LoadingState />
      </SectionPanel>
    )
  }
  if (bindings.length === 0) {
    return null
  }

  const handleDisconnect = async (binding: BindingRecord) => {
    setWorkingBindingId(binding.id)
    setError(null)
    try {
      await deleteBinding.mutateAsync({
        id: binding.id,
        serviceId,
        managedEnvironmentId: binding.managedEnvironmentId ?? undefined,
      })
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to disconnect'))
    } finally {
      setWorkingBindingId(null)
    }
  }

  return (
    <SectionPanel title="Bound databases" hint="Connected managed clusters">
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <View style={styles.list}>
        {bindings.map((binding) => (
          <BindingCard
            key={binding.id}
            orgId={orgId}
            binding={binding}
            cluster={
              binding.managedEnvironmentId
                ? managedByEnv.get(binding.managedEnvironmentId)
                : undefined
            }
            canManage={canManage}
            busy={workingBindingId === binding.id}
            disabled={
              workingBindingId !== null && workingBindingId !== binding.id
            }
            onDisconnect={() => {
              void handleDisconnect(binding)
            }}
          />
        ))}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  engineBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  engineBadgeText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  keyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  keyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  keyChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  lockGlyph: {
    fontSize: 10,
    color: chrome.accent,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
})
