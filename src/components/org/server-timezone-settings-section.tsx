import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, SectionPanel, SettingRow, Toggle } from '@/components/ui'
import { ServerTimezonePicker } from '@/components/org/server-timezone-picker'
import {
  fetchOrgDefaultTimezone,
  saveOrgDefaultTimezone,
  type OrgDefaultTimezoneSettings,
} from '@/lib/instance-api'
import { useTimezones } from '@/lib/queries/servers'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function ServerTimezoneSettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draftTimezone, setDraftTimezone] = useState<string | null | undefined>(
    undefined,
  )
  const [draftEnforce, setDraftEnforce] = useState<boolean | null>(null)

  const settingsKey = queryKeys.org(orgId).settings.defaultTimezone
  const query = useQuery({
    queryKey: settingsKey,
    queryFn: () => fetchOrgDefaultTimezone(orgId),
  })
  const timezonesQuery = useTimezones()

  const mutation = useApiMutation({
    mutationFn: (patch: Partial<OrgDefaultTimezoneSettings>) =>
      saveOrgDefaultTimezone(orgId, patch),
    onSuccess: (data) => {
      setError(null)
      setDraftTimezone(undefined)
      setDraftEnforce(null)
      queryClient.setQueryData(settingsKey, data)
    },
    onError: (err) => {
      setError(errorMessage(err, 'Failed to save fleet timezone settings'))
    },
  })

  const settings = query.data
  const effectiveTimezone =
    draftTimezone !== undefined
      ? draftTimezone
      : (settings?.defaultServerTimezone ?? null)
  const enforce = draftEnforce ?? settings?.enforceServerTimezone ?? false
  const pending = mutation.isPending || query.isLoading
  const readOnly = !canManage

  const saveDefaults = () => {
    if (!settings || readOnly) return
    mutation.mutate({
      defaultServerTimezone: effectiveTimezone,
      enforceServerTimezone: enforce,
    })
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Server fleet settings</Text>
      <Text style={panelStyles.pageCopy}>
        Default timezone applied to new hosts and optionally enforced across the
        fleet. SSH port, NTP, and a {TURBOFABRIC_PRODUCT_NAME} preference sit in
        Host defaults below. Per-server overrides live on each host unless
        enforcement is on.
      </Text>

      <SectionPanel
        title="Default server timezone"
        hint="Manage-gated · Postgres-backed settings"
      >
        {error ? <Text style={panelStyles.error}>{error}</Text> : null}
        {query.isError && !error ? (
          <Text style={panelStyles.error}>
            {errorMessage(query.error, 'Failed to load settings')}
          </Text>
        ) : null}

        <ServerTimezonePicker
          value={effectiveTimezone}
          options={timezonesQuery.data?.timezones ?? []}
          disabled={readOnly || pending}
          placeholder="Select default timezone…"
          noneLabel="None (no org default)"
          onChange={(tz) => setDraftTimezone(tz)}
        />

        <SettingRow
          label="Enforce org default on every server"
          description="When on, per-server timezone changes are blocked and the org default wins."
        >
          <Toggle
            value={enforce}
            onValueChange={setDraftEnforce}
            disabled={readOnly || pending || !settings}
            accessibilityLabel="Enforce org default on every server"
          />
        </SettingRow>

        {readOnly ? (
          <Text style={panelStyles.muted}>
            Organization manage permission is required to edit these settings.
          </Text>
        ) : (
          <Button
            label="Save settings"
            variant="primary"
            busy={mutation.isPending}
            disabled={pending || !settings}
            onPress={saveDefaults}
          />
        )}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
})
