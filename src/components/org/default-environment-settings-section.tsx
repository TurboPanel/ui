import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import { validateEnvironmentName } from '@/lib/environment-validation'
import {
  fetchOrgDefaultEnvironment,
  isForbiddenError,
  saveOrgDefaultEnvironment,
} from '@/lib/instance-api'
import {
  orgDefaultEnvironmentQueryKey,
  PLATFORM_DEFAULT_ENVIRONMENT_NAME,
} from '@/lib/org-default-environment'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function DefaultEnvironmentSettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const { handleUnauthorized } = useAuth()
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draftText, setDraftText] = useState<string | null>(null)

  const queryKey = orgDefaultEnvironmentQueryKey(orgId)
  const query = useQuery({
    queryKey,
    queryFn: () => fetchOrgDefaultEnvironment(orgId),
    enabled: canManage,
  })
  useForbiddenRecovery(query.error)

  const mutation = useMutation({
    mutationFn: (name: string | null) => saveOrgDefaultEnvironment(orgId, name),
    onSuccess: (data) => {
      setError(null)
      setDraftText(null)
      queryClient.setQueryData(queryKey, {
        defaultEnvironmentName: data.defaultEnvironmentName,
      })
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
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

      <View style={styles.field}>
        <TextInput
          value={draftValue}
          onChangeText={(text) => {
            setDraftText(text)
            setError(null)
          }}
          editable={!pending}
          placeholder={PLATFORM_DEFAULT_ENVIRONMENT_NAME}
          placeholderTextColor={colors.textMuted}
          maxLength={255}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, pending && styles.inputDisabled]}
        />
        <Text style={orgPanelStyles.muted}>
          Leave empty to restore the platform default (
          {PLATFORM_DEFAULT_ENVIRONMENT_NAME}).
        </Text>
      </View>

      <Pressable
        disabled={pending}
        onPress={saveSettings}
        style={({ pressed }) => [
          orgPanelStyles.toolbarBtnPrimary,
          pending && styles.btnDisabled,
          pressed && styles.btnPressed,
          webPointer,
        ]}
      >
        <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save settings</Text>
      </Pressable>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    minHeight: 44,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.85,
  },
})
