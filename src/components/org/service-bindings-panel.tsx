import { useMemo, useState } from 'react'
import { useRouter, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
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

function DisconnectActions({
  bindingId,
  armed,
  working,
  onArm,
  onConfirm,
  onCancel,
}: Readonly<{
  bindingId: string
  armed: boolean
  working: boolean
  onArm: (id: string) => void
  onConfirm: () => void
  onCancel: () => void
}>) {
  if (armed) {
    return (
      <>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          disabled={working}
          onPress={onConfirm}
        >
          <Text
            style={[orgPanelStyles.toolbarBtnTextSecondary, styles.danger]}
          >
            Confirm disconnect
          </Text>
        </Pressable>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={onCancel}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </>
    )
  }
  return (
    <Pressable
      style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
      disabled={working}
      onPress={() => onArm(bindingId)}
    >
      <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Disconnect</Text>
    </Pressable>
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
  const router = useRouter()
  const bindingsQuery = useServiceBindings(orgId, serviceId, {
    enabled: serviceId.length > 0,
  })
  const orgManagedQuery = useOrganizationManaged(orgId)
  const deleteBinding = useDeleteBinding(orgId)
  const [error, setError] = useState<string | null>(null)
  const [disconnectArmedId, setDisconnectArmedId] = useState<string | null>(
    null,
  )
  const [working, setWorking] = useState(false)

  const managedByEnv = useMemo(() => {
    const map = new Map<
      string,
      { projectId: string; displayName: string }
    >()
    for (const row of orgManagedQuery.data?.managed ?? []) {
      if (!row.environmentId) continue
      map.set(row.environmentId, {
        projectId: row.projectId,
        displayName:
          row.displayName?.trim() ||
          row.projectDisplayName?.trim() ||
          engineLabel(row.engine),
      })
    }
    return map
  }, [orgManagedQuery.data])

  const bindings = bindingsQuery.data?.bindings ?? []
  if (bindingsQuery.isLoading) {
    return (
      <SectionPanel title="Bound databases" hint="Connected managed clusters">
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      </SectionPanel>
    )
  }
  if (bindings.length === 0) {
    return null
  }

  const handleDisconnect = async (binding: BindingRecord) => {
    setWorking(true)
    setError(null)
    try {
      await deleteBinding.mutateAsync({
        id: binding.id,
        serviceId,
        managedEnvironmentId: binding.managedEnvironmentId ?? undefined,
      })
      setDisconnectArmedId(null)
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to disconnect'))
      setDisconnectArmedId(null)
    } finally {
      setWorking(false)
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
                {cluster?.displayName ?? 'Managed database'}
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
                  <Pressable
                    style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
                    onPress={() => {
                      router.push(
                        projectTabHref(
                          orgId,
                          cluster.projectId,
                          'connect',
                        ) as Href,
                      )
                    }}
                  >
                    <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                      Open database
                    </Text>
                  </Pressable>
                ) : null}
                {canManage ? (
                  <DisconnectActions
                    bindingId={binding.id}
                    armed={disconnectArmedId === binding.id}
                    working={working}
                    onArm={setDisconnectArmedId}
                    onConfirm={() => {
                      void handleDisconnect(binding)
                    }}
                    onCancel={() => setDisconnectArmedId(null)}
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
  danger: {
    color: colors.error,
  },
})
