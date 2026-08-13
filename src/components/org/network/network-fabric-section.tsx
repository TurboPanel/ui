import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  isOrgFabricUnavailable,
  useOrgFabric,
  useSaveOrgFabric,
} from '@/lib/queries/fabric'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

function fabricStatusLabel(enabled: boolean, status?: string): string {
  if (!enabled) return 'Off'
  const trimmed = status?.trim()
  if (trimmed) return trimmed
  return 'On'
}

function fabricLoadError(
  isError: boolean,
  unavailable: boolean,
  error: unknown,
): string | null {
  if (!isError || unavailable) return null
  if (error instanceof Error) return error.message
  return `Failed to load ${TURBOFABRIC_PRODUCT_NAME}`
}

function FabricStatusBlock({
  enabled,
  cidr,
  status,
}: Readonly<{ enabled: boolean; cidr?: string; status?: string }>) {
  return (
    <View style={styles.statusBlock}>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Status: </Text>
        {fabricStatusLabel(enabled, status)}
      </Text>
      {enabled && cidr ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>CIDR: </Text>
          <Text style={styles.mono}>{cidr}</Text>
        </Text>
      ) : null}
    </View>
  )
}

function fabricMutationError(err: unknown): string {
  if (err instanceof Error) return err.message
  return `Failed to update ${TURBOFABRIC_PRODUCT_NAME}`
}

function FabricUnavailableNotice() {
  return (
    <Text style={orgPanelStyles.muted}>
      {TURBOFABRIC_PRODUCT_NAME} is not available on this control plane
      yet.
    </Text>
  )
}

function FabricManageHint() {
  return (
    <Text style={orgPanelStyles.muted}>
      Organization manage permission is required to enable{' '}
      {TURBOFABRIC_PRODUCT_NAME}.
    </Text>
  )
}

function FabricEnableToggle({
  enabled,
  disabled,
  pending,
  onToggle,
}: Readonly<{
  enabled: boolean
  disabled: boolean
  pending: boolean
  onToggle: () => void
}>) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>
        Enable {TURBOFABRIC_PRODUCT_NAME}
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={`Enable ${TURBOFABRIC_PRODUCT_NAME}`}
        accessibilityState={{ checked: enabled, disabled }}
        disabled={disabled}
        onPress={onToggle}
        style={[
          styles.toggle,
          enabled ? styles.toggleOn : styles.toggleOff,
          disabled && styles.toggleDisabled,
          webPointer,
        ]}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text
            style={[
              styles.toggleText,
              enabled ? styles.toggleTextOn : styles.toggleTextOff,
            ]}
          >
            {enabled ? 'On' : 'Off'}
          </Text>
        )}
      </Pressable>
    </View>
  )
}

/**
 * Org opt-in for TurboFabric. Default off. Enabling lets environments run
 * across servers; standalone Docker does not require it.
 */
export function NetworkFabricSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const query = useOrgFabric(orgId)
  const mutation = useSaveOrgFabric(orgId)

  const unavailable = isOrgFabricUnavailable(query.error)
  const enabled = query.data?.enabled === true
  const fabric = query.data?.fabric
  const pending = mutation.isPending || query.isLoading
  const queryError = fabricLoadError(query.isError, unavailable, query.error)
  const displayError = error ?? mutation.actionError ?? queryError
  const toggleDisabled =
    pending || unavailable || !canManage || query.data === undefined
  const showToggle = canManage && !unavailable

  function handleToggle() {
    if (toggleDisabled) return
    setError(null)
    mutation.mutate(!enabled, {
      onError: (err) => {
        setError(fabricMutationError(err))
      },
    })
  }

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>{TURBOFABRIC_PRODUCT_NAME}</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Enabling {TURBOFABRIC_PRODUCT_NAME} lets environments run across
        servers. It is not required for single-engine Docker.
      </Text>

      {unavailable ? <FabricUnavailableNotice /> : null}

      {displayError ? (
        <Text style={orgPanelStyles.error}>{displayError}</Text>
      ) : null}

      <SectionPanel
        title={TURBOFABRIC_PRODUCT_NAME}
        hint="Opt-in · default off"
      >
        {query.isLoading && !query.data ? (
          <Text style={orgPanelStyles.muted}>Loading…</Text>
        ) : null}

        <FabricStatusBlock
          enabled={enabled}
          cidr={fabric?.cidr}
          status={fabric?.status}
        />

        {showToggle ? (
          <FabricEnableToggle
            enabled={enabled}
            disabled={toggleDisabled}
            pending={mutation.isPending}
            onToggle={handleToggle}
          />
        ) : null}

        {canManage ? null : <FabricManageHint />}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  statusBlock: {
    gap: spacing.xs,
  },
  mono: {
    fontFamily: 'monospace',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 44,
  },
  toggleLabel: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  toggle: {
    minWidth: 64,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: chrome.bgActive,
    borderColor: chrome.accent,
  },
  toggleOff: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderChip,
  },
  toggleDisabled: {
    opacity: 0.5,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  toggleTextOn: {
    color: chrome.accent,
  },
  toggleTextOff: {
    color: colors.textChip,
  },
})
