import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { Button } from '@/components/ui'
import { ServerTimezonePicker } from '@/components/org/server-timezone-picker'
import {
  fetchOrgDefaultTimezone,
  saveOrgDefaultTimezone,
  type OrgDefaultTimezoneSettings,
} from '@/lib/instance-api'
import { useTimezones } from '@/lib/queries/servers'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { chrome, colors, spacing } from '@/lib/theme'

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
      <Text style={orgPanelStyles.pageTitle}>Server fleet settings</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Default timezone applied to new hosts and optionally enforced across the
        fleet. SSH port, NTP, and a {TURBOFABRIC_PRODUCT_NAME} preference sit in
        Host defaults below. Per-server overrides live on each host unless
        enforcement is on.
      </Text>

      <SectionPanel
        title="Default server timezone"
        hint="Manage-gated · Postgres-backed settings"
      >
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {query.isError && !error ? (
          <Text style={orgPanelStyles.error}>
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

        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchLabel}>Enforce org default on every server</Text>
            <Text style={orgPanelStyles.muted}>
              When on, per-server timezone changes are blocked and the org default
              wins.
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{
              checked: enforce,
              disabled: readOnly || pending || !settings,
            }}
            disabled={readOnly || pending || !settings}
            onPress={() => setDraftEnforce(!enforce)}
            style={[
              styles.toggle,
              enforce ? styles.toggleOn : styles.toggleOff,
              (readOnly || pending) && styles.toggleDisabled,
            ]}
          >
            <Text style={styles.toggleText}>{enforce ? 'On' : 'Off'}</Text>
          </Pressable>
        </View>

        {readOnly ? (
          <Text style={orgPanelStyles.muted}>
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  toggle: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  toggleOn: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  toggleOff: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  toggleDisabled: {
    opacity: 0.5,
  },
  toggleText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
})
