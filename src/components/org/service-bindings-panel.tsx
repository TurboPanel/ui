import { useMemo, useState } from 'react'
import { useRouter, type Href } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { Button, ConfirmButton, LoadingState } from '@/components/ui'
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

function engineLabel(engine: string | null | undefined): string {
  if (!engine) return 'Database'
  return managedCatalogEntryForCode(engine)?.label ?? engine
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
  const router = useRouter()
  const bindingsQuery = useServiceBindings(orgId, serviceId, {
    enabled: serviceId.length > 0,
  })
  const orgManagedQuery = useOrganizationManaged(orgId)
  const deleteBinding = useDeleteBinding(orgId)
  const [error, setError] = useState<string | null>(null)
  const [workingBindingId, setWorkingBindingId] = useState<string | null>(null)

  const managedByEnv = useMemo(() => {
    const map = new Map<
      string,
      { projectId: string; name: string }
    >()
    for (const row of orgManagedQuery.data?.managed ?? []) {
      if (!row.environmentId) continue
      map.set(row.environmentId, {
        projectId: row.projectId,
        name:
          row.name?.trim() ||
          row.projectName?.trim() ||
          engineLabel(row.engine),
      })
    }
    return map
  }, [orgManagedQuery.data])

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
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      <View style={styles.list}>
        {bindings.map((binding) => {
          const cluster = binding.managedEnvironmentId
            ? managedByEnv.get(binding.managedEnvironmentId)
            : undefined
          return (
            <View key={binding.id} style={styles.card}>
              <View style={styles.engineBadge}>
                <Text style={styles.engineBadgeText}>
                  {engineLabel(binding.engine)}
                </Text>
              </View>
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>Cluster: </Text>
                {cluster?.name ?? 'Managed database'}
              </Text>
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>Database: </Text>
                {binding.databaseName}
              </Text>
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>Prefix: </Text>
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
                        projectTabHref(
                          orgId,
                          cluster.projectId,
                          'connect',
                        ) as Href,
                      )
                    }}
                  />
                ) : null}
                {canManage ? (
                  <ConfirmButton
                    label="Disconnect"
                    confirmLabel="Confirm disconnect"
                    busy={workingBindingId === binding.id}
                    disabled={
                      workingBindingId !== null &&
                      workingBindingId !== binding.id
                    }
                    onConfirm={() => {
                      void handleDisconnect(binding)
                    }}
                  />
                ) : null}
              </View>
            </View>
          )
        })}
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
