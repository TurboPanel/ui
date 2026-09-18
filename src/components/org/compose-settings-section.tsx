import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, SectionPanel, SettingRow, TextField, Toggle } from '@/components/ui'
import {
  describeComposeResourceDefaults,
  draftFromLimits,
  parseComposeResourceDefaultsDraft,
  type ComposeResourceDefaultsDraft,
} from '@/lib/compose-resource-defaults'
import {
  fetchOrgComposeGatedFields,
  fetchOrgComposeResourceDefaults,
  saveOrgComposeGatedFields,
  saveOrgComposeResourceDefaults,
} from '@/lib/instance-api'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Manage Organization → Compose: the two owner-only opt-ins that widen what a
 * compose document may ask for. Both routes are `organization:own`; a
 * non-owner sees the panel with its controls disabled and a sentence saying
 * why, rather than a hidden panel and a deploy error that names it.
 */
export function ComposeSettingsSection({ orgId }: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canOwn = useCan('organization', orgId, 'organization:own')

  // ---- gated fields ---------------------------------------------------------
  const gatedKey = queryKeys.org(orgId).settings.composeGatedFields
  const gatedQuery = useQuery({
    queryKey: gatedKey,
    queryFn: () => fetchOrgComposeGatedFields(orgId),
    enabled: canOwn,
  })
  const [gatedError, setGatedError] = useState<string | null>(null)
  const [draftGated, setDraftGated] = useState<boolean | null>(null)
  const gatedMutation = useApiMutation({
    mutationFn: (composeGatedFieldsEnabled: boolean) =>
      saveOrgComposeGatedFields(orgId, { composeGatedFieldsEnabled }),
    onSuccess: (data) => {
      setGatedError(null)
      setDraftGated(null)
      queryClient.setQueryData(gatedKey, {
        composeGatedFieldsEnabled: data.composeGatedFieldsEnabled,
      })
    },
    onError: (err) => {
      setDraftGated(null)
      setGatedError(errorMessage(err, 'Failed to update the privileged-fields setting'))
    },
  })
  const gatedEnabled = draftGated ?? gatedQuery.data?.composeGatedFieldsEnabled ?? false
  const onToggleGated = (next: boolean) => {
    if (!canOwn) return
    setDraftGated(next)
    gatedMutation.mutate(next)
  }

  // ---- default resource ceiling ---------------------------------------------
  const limitsKey = queryKeys.org(orgId).settings.composeResourceDefaults
  const limitsQuery = useQuery({
    queryKey: limitsKey,
    queryFn: () => fetchOrgComposeResourceDefaults(orgId),
    enabled: canOwn,
  })
  const [limitsError, setLimitsError] = useState<string | null>(null)
  const [draftLimits, setDraftLimits] = useState<ComposeResourceDefaultsDraft | null>(null)
  const limitsMutation = useApiMutation({
    mutationFn: (limits: { cpus?: number; memoryBytes?: number } | null) =>
      saveOrgComposeResourceDefaults(orgId, { composeDefaultResourceLimits: limits }),
    onSuccess: (data) => {
      setLimitsError(null)
      setDraftLimits(null)
      queryClient.setQueryData(limitsKey, {
        composeDefaultResourceLimits: data.composeDefaultResourceLimits,
      })
    },
    onError: (err) => {
      setLimitsError(errorMessage(err, 'Failed to save the default resource ceiling'))
    },
  })
  const storedLimits = limitsQuery.data?.composeDefaultResourceLimits ?? null
  const limitsDraft = draftLimits ?? draftFromLimits(storedLimits)
  const limitsPending = limitsMutation.isPending || limitsQuery.isLoading
  const limitsDirty = draftLimits !== null

  const saveLimits = () => {
    if (!canOwn) return
    const parsed = parseComposeResourceDefaultsDraft(limitsDraft)
    if (!parsed.ok) {
      setLimitsError(parsed.error)
      return
    }
    setLimitsError(null)
    limitsMutation.mutate(parsed.limits)
  }

  const clearLimits = () => {
    if (!canOwn) return
    setLimitsError(null)
    limitsMutation.mutate(null)
  }

  return (
    <SectionPanel
      title="Compose"
      hint="Owner-only · what a compose document in this organization may ask for"
    >
      {!canOwn ? (
        <Text style={panelStyles.muted}>
          Only an organization owner can change these settings. Ask an owner if a
          deploy is refused with the message that names this screen.
        </Text>
      ) : null}

      {gatedError ? <Text style={panelStyles.error}>{gatedError}</Text> : null}
      {gatedQuery.isError && !gatedError ? (
        <Text style={panelStyles.error}>
          {errorMessage(gatedQuery.error, 'Failed to load the privileged-fields setting')}
        </Text>
      ) : null}
      <SettingRow
        label="Allow privileged compose fields"
        description="Off by default. When off, a deploy that sets privileged, cap_add, devices, network_mode, pid, ipc, userns_mode, security_opt, cgroup_parent or sysctls is refused — those fields grant root-equivalent access to the shared server, and every other project on that server with it. Turning this on is recorded in the organization's audit trail."
      >
        <Toggle
          value={gatedEnabled}
          onValueChange={onToggleGated}
          disabled={!canOwn || gatedMutation.isPending || gatedQuery.isLoading}
          accessibilityLabel="Allow privileged compose fields"
        />
      </SettingRow>

      <View style={styles.divider} />

      {limitsError ? <Text style={panelStyles.error}>{limitsError}</Text> : null}
      {limitsQuery.isError && !limitsError ? (
        <Text style={panelStyles.error}>
          {errorMessage(limitsQuery.error, 'Failed to load the default resource ceiling')}
        </Text>
      ) : null}
      <Text style={styles.label}>Default resource ceiling</Text>
      <Text style={panelStyles.muted}>{describeComposeResourceDefaults(storedLimits)}</Text>
      <Text style={panelStyles.muted}>
        A service that sets its own mem_limit, cpus or deploy.resources keeps them;
        this fills the gap for services that set none. Leave both fields empty and
        save to remove the default.
      </Text>
      <View style={styles.fields}>
        <View style={styles.field}>
          <TextField
            label="CPUs"
            value={limitsDraft.cpus}
            onChangeText={(text) => {
              setDraftLimits({ ...limitsDraft, cpus: text })
              setLimitsError(null)
            }}
            editable={canOwn && !limitsPending}
            placeholder="none"
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoCapitalize="none"
            autoCorrect={false}
            hint="Whole or fractional cores, like 0.5 or 2"
            accessibilityLabel="Default CPU ceiling"
          />
        </View>
        <View style={styles.field}>
          <TextField
            label="Memory (MiB)"
            value={limitsDraft.memoryMib}
            onChangeText={(text) => {
              setDraftLimits({ ...limitsDraft, memoryMib: text })
              setLimitsError(null)
            }}
            editable={canOwn && !limitsPending}
            placeholder="none"
            keyboardType="numeric"
            inputMode="numeric"
            autoCapitalize="none"
            autoCorrect={false}
            hint="Whole MiB, like 512 or 2048"
            accessibilityLabel="Default memory ceiling in MiB"
          />
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label="Save ceiling"
          variant="primary"
          disabled={!canOwn || limitsPending || !limitsDirty}
          onPress={saveLimits}
        />
        <Button
          label="Remove default"
          variant="secondary"
          disabled={!canOwn || limitsPending || storedLimits === null}
          onPress={clearLimits}
        />
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  fields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  field: {
    flexGrow: 1,
    flexBasis: 200,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
