import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { SectionPanel } from '@/components/ui'
import { BuildLimitsEditor } from '@/components/org/build-limits-fields'
import { fetchOrgBuildLimits, type OrgBuildLimits, saveOrgBuildLimits } from '@/lib/instance-api'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

/** Organization limit for one build on any server; a server or service can set a smaller one. */
export function ServerBuildLimitsSettingsSection({ orgId }: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  // The route is owner-only (`organization:own`), like the compose settings.
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [error, setError] = useState<string | null>(null)
  const key = queryKeys.org(orgId).settings.buildLimits
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchOrgBuildLimits(orgId),
    enabled: canOwn && orgId.length > 0,
  })
  const mutation = useApiMutation({
    mutationFn: (limits: OrgBuildLimits) => saveOrgBuildLimits(orgId, limits),
    onSuccess: (data) => {
      setError(null)
      queryClient.setQueryData(key, {
        cores: data.cores,
        memoryBytes: data.memoryBytes,
        swap: data.swap,
      })
    },
    onError: (err) => setError(userErrorMessage(err, 'Failed to save build limits')),
  })

  return (
    <SectionPanel
      title="Build Limits"
      hint="Owner-only · organization limit for any one build · a server or service can set a smaller one"
    >
      {canOwn ? null : (
        <Text style={panelStyles.muted}>
          Only an owner can change the build limits of the organization.
        </Text>
      )}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load build limits')}
        </Text>
      ) : null}
      <BuildLimitsEditor
        scopeLabel="Organization"
        value={query.data}
        canManage={canOwn}
        pending={mutation.isPending || (canOwn && !query.data)}
        error={error}
        onSave={(values) => mutation.mutate(values)}
      />
    </SectionPanel>
  )
}
