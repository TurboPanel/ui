import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { SettingRow, Toggle } from '@/components/ui'
import {
  fetchOrgComposeRemoteBuildSources,
  saveOrgComposeRemoteBuildSources,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

/**
 * The owner-only opt-in that lets a compose build fetch its source from a
 * public URL or git repository. The parent passes `canOwn`; the route itself is
 * `organization:own`, so a non-owner sees the control disabled.
 */
export function ComposeRemoteSourcesRow({
  orgId,
  canOwn,
}: Readonly<{ orgId: string; canOwn: boolean }>) {
  const queryClient = useQueryClient()
  const key = queryKeys.org(orgId).settings.composeRemoteBuildSources
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchOrgComposeRemoteBuildSources(orgId),
    enabled: canOwn,
  })
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<boolean | null>(null)
  const mutation = useApiMutation({
    mutationFn: (composeRemoteBuildSourcesEnabled: boolean) =>
      saveOrgComposeRemoteBuildSources(orgId, { composeRemoteBuildSourcesEnabled }),
    onSuccess: (data) => {
      setError(null)
      setDraft(null)
      queryClient.setQueryData(key, {
        composeRemoteBuildSourcesEnabled: data.composeRemoteBuildSourcesEnabled,
      })
    },
    onError: (err) => {
      setDraft(null)
      setError(userErrorMessage(err, 'Failed to update the remote build sources setting'))
    },
  })
  const enabled = draft ?? query.data?.composeRemoteBuildSourcesEnabled ?? false
  const onToggle = (next: boolean) => {
    if (!canOwn) return
    setDraft(next)
    mutation.mutate(next)
  }

  return (
    <>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load the remote build sources setting')}
        </Text>
      ) : null}
      <SettingRow
        label="Allow remote build sources"
        description="Off by default. A build can name a web address or a git repository as its source, and the files it fetches were never reviewed by anyone in this organization. When this is off, a deploy that builds from one is refused. When it is on, builds may fetch from public hosts only; addresses on a private network, localhost and cloud metadata stay refused. Dockerfile lines that download files (ADD with a URL) are not checked either way. Turning this on is recorded in the organization's audit trail."
      >
        <Toggle
          value={enabled}
          onValueChange={onToggle}
          disabled={!canOwn || mutation.isPending || query.isLoading}
          accessibilityLabel="Allow remote build sources"
        />
      </SettingRow>
    </>
  )
}
