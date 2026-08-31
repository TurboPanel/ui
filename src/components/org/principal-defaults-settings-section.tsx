import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, SectionPanel, SettingRow, Toggle } from '@/components/ui'
import {
  fetchOrgPrincipalDefaults,
  saveOrgPrincipalDefaults,
} from '@/lib/instance-api'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Org-wide randomized-usernames default. On (the platform default), every new
 * principal's applied login — the Linux account or database role actually
 * created — is its short name plus a random `_<11 chars>` suffix. Off, the
 * short name is the login. Changing it never renames existing principals.
 */
export function PrincipalDefaultsSettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<boolean | null>(null)

  const settingsKey = queryKeys.org(orgId).settings.principalDefaults
  const query = useQuery({
    queryKey: settingsKey,
    queryFn: () => fetchOrgPrincipalDefaults(orgId),
    enabled: canManage && orgId.length > 0,
  })

  const mutation = useApiMutation({
    mutationFn: (randomizedUsernames: boolean) =>
      saveOrgPrincipalDefaults(orgId, randomizedUsernames),
    onSuccess: (data) => {
      setError(null)
      setDraft(null)
      queryClient.setQueryData(settingsKey, {
        randomizedUsernames: data.randomizedUsernames,
        effectiveRandomizedUsernames: data.effectiveRandomizedUsernames,
      })
    },
    onError: (err) => {
      setError(errorMessage(err, 'Failed to save principal defaults'))
    },
  })

  const settings = query.data
  const enabled = draft ?? settings?.effectiveRandomizedUsernames !== false
  const pending = mutation.isPending || query.isLoading
  const dirty = draft != null && settings != null &&
    draft !== settings.effectiveRandomizedUsernames

  if (!canManage) return null

  return (
    <SectionPanel
      title="Usernames"
      hint="Applies to users created from now on"
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {errorMessage(query.error, 'Failed to load principal defaults')}
        </Text>
      ) : null}
      <SettingRow
        label="Randomized usernames"
        description="New system and database users get a random 12-character suffix on the actual login (name_abc123def45) — preferred for security. You still refer to them by their short name in TurboPanel. Turning this off never renames existing users."
      >
        <Toggle
          value={enabled}
          disabled={pending || !settings}
          accessibilityLabel="Randomized usernames"
          onValueChange={() => setDraft(!enabled)}
        />
      </SettingRow>
      {dirty ? (
        <Button
          label="Save"
          busyLabel="Saving…"
          busy={mutation.isPending}
          onPress={() => {
            if (draft != null) mutation.mutate(draft)
          }}
        />
      ) : null}
    </SectionPanel>
  )
}
