import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchEnvironmentManaged,
  isForbiddenError,
  provisionEnvironmentManaged,
  type ManagedEnvironmentRecord,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  managedCatalogEntryForCode,
  type ManagedServiceCatalogEntry,
  type ManagedServiceStatus,
} from '@/lib/managed-services'
import { colors, spacing } from '@/lib/theme'

function statusLabel(status: ManagedServiceStatus | ManagedEnvironmentRecord['status']): string {
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

function provisionBlockedReason(
  placementServerId: string | null,
  pinnedServer: OrgServerRecord | null,
): string | null {
  if (!placementServerId) {
    return 'Select a server for this environment before provisioning.'
  }
  if (!pinnedServer) {
    return 'Selected server is unavailable. Choose a connected server.'
  }
  if (!pinnedServer.connected) {
    return 'Selected server is offline. Choose a connected server.'
  }
  return null
}

function endpointLabel(managed: ManagedEnvironmentRecord | null): string {
  if (!managed) {
    return 'Not provisioned yet'
  }
  if (managed.host && managed.port) {
    return `${managed.host}:${managed.port}`
  }
  if (managed.status === 'provisioning') {
    return 'Pending…'
  }
  return 'Pending'
}

function resolveErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function resolveCatalogEntry(
  managed: ManagedEnvironmentRecord | null,
  engineCode: string | null,
): ManagedServiceCatalogEntry | undefined {
  const code = managed?.engine ?? engineCode
  if (!code) {
    return undefined
  }
  return managedCatalogEntryForCode(code)
}

function engineLabelFor(
  managed: ManagedEnvironmentRecord | null,
  engineCode: string | null,
): string {
  const catalog = resolveCatalogEntry(managed, engineCode)
  return catalog?.label ?? managed?.engine ?? engineCode ?? 'Managed engine'
}

function provisionResultMessage(alreadyProvisioned: boolean | undefined): string {
  if (alreadyProvisioned) {
    return 'Already provisioned — showing current connection.'
  }
  return 'Provision queued.'
}

async function loadManagedRecord(
  environmentId: string,
  handleUnauthorized: () => void | Promise<void>,
): Promise<{ managed: ManagedEnvironmentRecord | null } | { error: string } | null> {
  try {
    const result = await fetchEnvironmentManaged(environmentId)
    return { managed: result.managed }
  } catch (err) {
    if (isForbiddenError(err)) {
      await handleUnauthorized()
      return null
    }
    return { error: resolveErrorMessage(err, 'Failed to load managed service') }
  }
}

async function provisionManagedRecord(
  environmentId: string,
  handleUnauthorized: () => void | Promise<void>,
): Promise<
  | { managed: ManagedEnvironmentRecord; message: string }
  | { error: string }
  | null
> {
  try {
    const result = await provisionEnvironmentManaged(environmentId)
    return {
      managed: result.managed,
      message: provisionResultMessage(result.alreadyProvisioned),
    }
  } catch (err) {
    if (isForbiddenError(err)) {
      await handleUnauthorized()
      return null
    }
    return { error: resolveErrorMessage(err, 'Failed to provision managed service') }
  }
}

function ManagedStatusPill({
  managed,
  catalog,
}: Readonly<{
  managed: ManagedEnvironmentRecord | null
  catalog: ManagedServiceCatalogEntry | undefined
}>) {
  const status = managed?.status ?? catalog?.status
  return (
    <View
      style={[
        styles.statusPill,
        status === 'ready' && styles.statusPillLive,
        status === 'failed' && styles.statusPillFailed,
        !managed && styles.statusPillMuted,
      ]}
    >
      <Text
        style={[
          styles.statusPillText,
          status === 'ready' && styles.statusPillTextLive,
        ]}
      >
        {status ? statusLabel(status) : 'Not provisioned'}
      </Text>
    </View>
  )
}

function ManagedConnectionDetails({
  managed,
  engineCode,
}: Readonly<{
  managed: ManagedEnvironmentRecord | null
  engineCode: string | null
}>) {
  const catalog = resolveCatalogEntry(managed, engineCode)
  return (
    <View style={styles.details}>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Engine: </Text>
        {engineLabelFor(managed, engineCode)}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Endpoint: </Text>
        {endpointLabel(managed)}
      </Text>
      <View style={styles.statusRow}>
        <Text style={orgPanelStyles.detailLabel}>Status: </Text>
        <ManagedStatusPill managed={managed} catalog={catalog} />
      </View>
    </View>
  )
}

function ManagedProvisionControls({
  blockedReason,
  provisioning,
  provisionMessage,
  onProvision,
}: Readonly<{
  blockedReason: string | null
  provisioning: boolean
  provisionMessage: string | null
  onProvision: () => void
}>) {
  const disabled = provisioning || blockedReason !== null
  return (
    <>
      <Pressable
        style={[styles.provisionButton, disabled && styles.buttonDisabled]}
        disabled={disabled}
        onPress={onProvision}
      >
        <Text style={styles.provisionButtonText}>
          {provisioning ? 'Provisioning…' : 'Provision'}
        </Text>
      </Pressable>
      {blockedReason ? <Text style={orgPanelStyles.muted}>{blockedReason}</Text> : null}
      {provisionMessage ? (
        <Text style={orgPanelStyles.detailLine}>{provisionMessage}</Text>
      ) : null}
    </>
  )
}

function useManagedConnection(
  environmentId: string,
  placementServerId: string | null,
  pinnedServer: OrgServerRecord | null,
) {
  const { handleUnauthorized } = useAuth()
  const [managed, setManaged] = useState<ManagedEnvironmentRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [provisioning, setProvisioning] = useState(false)
  const [provisionMessage, setProvisionMessage] = useState<string | null>(null)
  const blockedReason = provisionBlockedReason(placementServerId, pinnedServer)

  const loadManaged = useCallback(async () => {
    setLoading(true)
    setError(null)
    const outcome = await loadManagedRecord(environmentId, handleUnauthorized)
    if (outcome && 'managed' in outcome) {
      setManaged(outcome.managed)
    } else if (outcome?.error) {
      setError(outcome.error)
    }
    setLoading(false)
  }, [environmentId, handleUnauthorized])

  useEffect(() => {
    void loadManaged()
  }, [loadManaged])

  const runProvision = async () => {
    if (blockedReason) {
      setProvisionMessage(blockedReason)
      return
    }
    setProvisioning(true)
    setProvisionMessage(null)
    setError(null)
    const outcome = await provisionManagedRecord(environmentId, handleUnauthorized)
    if (outcome && 'managed' in outcome) {
      setManaged(outcome.managed)
      setProvisionMessage(outcome.message)
    } else if (outcome?.error) {
      setProvisionMessage(outcome.error)
    }
    setProvisioning(false)
  }

  return {
    managed,
    loading,
    error,
    provisioning,
    provisionMessage,
    blockedReason,
    runProvision,
  }
}

export function ManagedConnectionPanel({
  environmentId,
  engineCode,
  canManage,
  placementServerId,
  pinnedServer,
}: Readonly<{
  environmentId: string
  /** Project metadata engine code — used before the environment-scoped row exists. */
  engineCode: string | null
  canManage: boolean
  placementServerId: string | null
  pinnedServer: OrgServerRecord | null
}>) {
  const {
    managed,
    loading,
    error,
    provisioning,
    provisionMessage,
    blockedReason,
    runProvision,
  } = useManagedConnection(environmentId, placementServerId, pinnedServer)

  return (
    <SectionPanel
      title="Managed connection"
      hint="Engine endpoint on the environment's pinned server"
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {loading ? <Text style={orgPanelStyles.muted}>Loading…</Text> : null}
      {!loading ? (
        <ManagedConnectionDetails managed={managed} engineCode={engineCode} />
      ) : null}
      {canManage ? (
        <ManagedProvisionControls
          blockedReason={blockedReason}
          provisioning={provisioning}
          provisionMessage={provisionMessage}
          onProvision={() => {
            void runProvision()
          }}
        />
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  details: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
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
  provisionButton: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  provisionButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
