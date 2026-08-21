import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { Button, TextField } from '@/components/ui'
import { validateEnvironmentName } from '@/lib/environment-validation'
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
import {
  fetchOrgDefaultEnvironment,
  saveOrgDefaultEnvironment,
} from '@/lib/instance-api'
import { PLATFORM_DEFAULT_ENVIRONMENT_NAME } from '@/lib/org-default-environment'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function DefaultEnvironmentSettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draftText, setDraftText] = useState<string | null>(null)

  const queryKey = queryKeys.org(orgId).settings.defaultEnvironment
  const query = useQuery({
    queryKey,
    queryFn: () => fetchOrgDefaultEnvironment(orgId),
    enabled: canManage,
  })

  const mutation = useApiMutation({
    mutationFn: (name: string | null) => saveOrgDefaultEnvironment(orgId, name),
    onSuccess: (data) => {
      setError(null)
      setDraftText(null)
      queryClient.setQueryData(queryKey, {
        defaultEnvironmentName: data.defaultEnvironmentName,
      })
    },
    onError: (err) => {
      setError(errorMessage(err, 'Failed to save default environment name'))
    },
  })

  const draftValue =
    draftText ?? query.data?.defaultEnvironmentName ?? ''
  const pending = mutation.isPending || query.isLoading

  const saveSettings = () => {
    const trimmed = draftValue.trim()
    if (!trimmed) {
      mutation.mutate(null)
      return
    }
    const validation = validateEnvironmentName(trimmed)
    if (validation) {
      setError(validation)
      return
    }
    mutation.mutate(trimmed)
  }

  if (!canManage) return null

  return (
    <SectionPanel
      title="Default environment name"
      hint="Manage-gated · applies to newly created projects"
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={orgPanelStyles.error}>
          {errorMessage(query.error, 'Failed to load default environment name')}
        </Text>
      ) : null}

      <Text style={orgPanelStyles.muted}>
        Every new project starts with one environment; this names it. Existing
        projects are unchanged.
      </Text>

      <TextField
        label="Environment name"
        value={draftValue}
        onChangeText={(text) => {
          setDraftText(text)
          setError(null)
        }}
        editable={!pending}
        placeholder={PLATFORM_DEFAULT_ENVIRONMENT_NAME}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        hint={`Leave empty to restore the platform default (${PLATFORM_DEFAULT_ENVIRONMENT_NAME}).`}
      />

      <Button
        label="Save settings"
        variant="primary"
        disabled={pending}
        onPress={saveSettings}
      />
    </SectionPanel>
  )
}
