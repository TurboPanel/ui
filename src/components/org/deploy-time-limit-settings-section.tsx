import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, SectionPanel, TextField } from '@/components/ui'
import {
  checkDeployTimeLimit,
  DEPLOY_TIME_LIMIT_DEFAULT,
  DEPLOY_TIME_LIMIT_MAX,
  DEPLOY_TIME_LIMIT_MIN,
} from '@/lib/deploy-time-limit'
import { fetchOrgDeployTimeout, saveOrgDeployTimeout } from '@/lib/instance-api'
import { queryKeys, useApiMutation, useCan } from '@/lib/query-client'
import { userErrorMessage } from '@/lib/user-error'

/** Managers set how long a deploy may run before it is stopped. */
export function DeployTimeLimitSettingsSection({ orgId }: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)

  const queryKey = queryKeys.org(orgId).settings.deployTimeout
  const query = useQuery({
    queryKey,
    queryFn: () => fetchOrgDeployTimeout(orgId),
    enabled: canManage,
  })

  const mutation = useApiMutation({
    mutationFn: (minutes: number) => saveOrgDeployTimeout(orgId, minutes),
    onSuccess: (data) => {
      setError(null)
      setDraft(null)
      queryClient.setQueryData(queryKey, { deployTimeoutMinutes: data.deployTimeoutMinutes })
    },
    onError: (err) => setError(userErrorMessage(err, 'Could not save the deploy time limit.')),
  })

  if (!canManage) return null

  const saved = query.data?.deployTimeoutMinutes
  const value = draft ?? (saved === undefined ? '' : String(saved))
  const pending = mutation.isPending
  const loaded = saved !== undefined

  const save = (text: string) => {
    const result = checkDeployTimeLimit(text)
    if ('error' in result) {
      setError(result.error)
      return
    }
    mutation.mutate(result.minutes)
  }

  return (
    <SectionPanel title="Deploy Time Limit" hint="How long a deploy may take">
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isLoading ? (
        <Text style={panelStyles.muted}>Loading the deploy time limit…</Text>
      ) : null}
      {query.isError ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Could not load the deploy time limit.')}
        </Text>
      ) : null}
      <TextField
        label="Deploy Time Limit (Minutes)"
        value={value}
        onChangeText={(text) => {
          setDraft(text)
          setError(null)
        }}
        editable={loaded && !pending}
        keyboardType="number-pad"
        autoCorrect={false}
        placeholder={String(DEPLOY_TIME_LIMIT_DEFAULT)}
        hint={`A deploy that runs longer than this is stopped. Choose from ${DEPLOY_TIME_LIMIT_MIN} to ${DEPLOY_TIME_LIMIT_MAX} minutes; the default is ${DEPLOY_TIME_LIMIT_DEFAULT}. A server with an older daemon stops waiting after 10 minutes no matter what this is set to.`}
      />
      <ButtonRow>
        <Button
          label="Save Time Limit"
          variant="primary"
          disabled={!loaded || pending}
          busy={pending}
          onPress={() => save(value)}
        />
        <Button
          label="Restore Default"
          disabled={!loaded || pending || saved === DEPLOY_TIME_LIMIT_DEFAULT}
          onPress={() => save(String(DEPLOY_TIME_LIMIT_DEFAULT))}
        />
      </ButtonRow>
    </SectionPanel>
  )
}
