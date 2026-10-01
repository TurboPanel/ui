import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel, SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { fetchOrgReauthSettings, saveOrgReauthSettings } from '@/lib/instance-api'
import { queryKeys, useApiMutation, useCan } from '@/lib/query-client'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Manage Organization → Security: ask people to confirm it is them before a
 * permanent action. Owner-only (`organization:own`, the same as the server
 * route); anyone else sees the panel with the control disabled and a sentence
 * saying why. Off by default so nobody is surprised; turning it on is
 * recommended.
 */
export function ReauthSettingsSection({ orgId }: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const key = queryKeys.org(orgId).settings.reauthSettings

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchOrgReauthSettings(orgId),
    enabled: canOwn,
  })
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<boolean | null>(null)
  const mutation = useApiMutation({
    mutationFn: (requireReauthForDestructive: boolean) =>
      saveOrgReauthSettings(orgId, { requireReauthForDestructive }),
    onSuccess: (data) => {
      setError(null)
      setDraft(null)
      queryClient.setQueryData(key, {
        requireReauthForDestructive: data.requireReauthForDestructive,
      })
    },
    onError: (err) => {
      setDraft(null)
      setError(errorMessage(err, 'Failed to update the setting'))
    },
  })

  const enabled = draft ?? query.data?.requireReauthForDestructive ?? false
  const onToggle = (next: boolean) => {
    if (!canOwn) return
    setDraft(next)
    mutation.mutate(next)
  }

  return (
    <SectionPanel
      title="Security"
      hint="Owner-only · who must confirm it is them before a permanent action"
    >
      {canOwn ? null : (
        <Text style={panelStyles.muted}>Only an organization owner can change this setting.</Text>
      )}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {errorMessage(query.error, 'Failed to load the security setting')}
        </Text>
      ) : null}
      <SettingRow
        label="Ask people to confirm it is them before permanent actions"
        description="Off by default; turning it on is recommended. When on, deleting a project, environment, server or managed database, removing a member and revoking a key each ask for the person's password (or authenticator code, if they use one) first. A confirmation lasts five minutes on that sign-in, and signing in counts as one. Turning this on or off is recorded in the organization's audit trail."
      >
        <Toggle
          value={enabled}
          onValueChange={onToggle}
          disabled={!canOwn || mutation.isPending || query.isLoading}
          accessibilityLabel="Ask people to confirm it is them before permanent actions"
        />
      </SettingRow>
    </SectionPanel>
  )
}
