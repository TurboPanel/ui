import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createEnvironment,
  deleteEnvironment,
  fetchVisibleEnvironments,
  isForbiddenError,
  type EnvironmentRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 ._-]+$/

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  borderRadius: 6,
  minHeight: 44,
} as const

export function EnvironmentsOverviewSection({
  orgId,
  projectId,
}: {
  orgId: string
  projectId: string
}) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [environments, setEnvironments] = useState<EnvironmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [envDisplayName, setEnvDisplayName] = useState('')
  const [envDescription, setEnvDescription] = useState('')
  const [envFieldError, setEnvFieldError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const loadEnvironments = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchVisibleEnvironments(projectId)
      setEnvironments(result.environments)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to load environments',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchVisibleEnvironments(projectId)
        if (!cancelled) {
          setEnvironments(result.environments)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setError(
            err instanceof Error ? err.message : 'Failed to load environments',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [projectId, handleUnauthorized])

  const handleDeleteEnvironment = async (id: string) => {
    setDeleting((current) => new Set(current).add(id))
    setError(null)
    try {
      await deleteEnvironment(id)
      await loadEnvironments()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to delete environment',
      )
    } finally {
      setDeleting((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  const handleCreateEnvironment = async () => {
    const trimmedName = envDisplayName.trim()
    if (!trimmedName) {
      setEnvFieldError('Name is required.')
      return
    }
    if (trimmedName.length > 255) {
      setEnvFieldError('Name must be 255 characters or fewer.')
      return
    }
    if (!DISPLAY_NAME_PATTERN.test(trimmedName)) {
      setEnvFieldError(
        'Name may only contain letters, numbers, spaces, dots, underscores, and hyphens.',
      )
      return
    }

    setCreating(true)
    setEnvFieldError(null)
    setError(null)
    try {
      const trimmedDescription = envDescription.trim()
      await createEnvironment({
        projectId,
        displayName: trimmedName,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      })
      setEnvDisplayName('')
      setEnvDescription('')
      setShowCreateForm(false)
      await loadEnvironments()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to create environment',
      )
    } finally {
      setCreating(false)
    }
  }

  const inputStyle = (hasError: boolean) => [
    Platform.OS === 'web'
      ? {
          ...webInputStyle,
          borderColor: hasError ? colors.error : colors.border,
        }
      : styles.input,
    hasError && Platform.OS !== 'web' && styles.inputError,
  ]

  return (
    <SectionPanel title="Environments" hint="Project environments">
      {canOwn ? (
        <Pressable
          style={styles.primaryButton}
          onPress={() => setShowCreateForm((current) => !current)}
        >
          <Text style={styles.primaryButtonText}>
            {showCreateForm ? 'Cancel' : 'New environment'}
          </Text>
        </Pressable>
      ) : null}

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {showCreateForm && canOwn ? (
        <View style={styles.createForm}>
          <View style={styles.field}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={inputStyle(Boolean(envFieldError))}
              value={envDisplayName}
              onChangeText={(t) => {
                setEnvDisplayName(t)
                setEnvFieldError(null)
              }}
              placeholder="e.g. production"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!creating}
              maxLength={255}
            />
            {envFieldError ? (
              <Text style={styles.fieldError}>{envFieldError}</Text>
            ) : null}
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={inputStyle(false)}
              value={envDescription}
              onChangeText={setEnvDescription}
              placeholder="Optional description"
              placeholderTextColor={colors.textDim}
              editable={!creating}
              maxLength={255}
              multiline
            />
          </View>
          <Pressable
            style={[styles.submitButton, creating && styles.buttonDisabled]}
            disabled={creating}
            onPress={() => void handleCreateEnvironment()}
          >
            <Text style={styles.submitButtonText}>
              {creating ? 'Creating…' : 'Create environment'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {loading && environments.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      ) : environments.length === 0 ? (
        <Text style={orgPanelStyles.muted}>No environments yet.</Text>
      ) : (
        <View style={styles.list}>
          {environments.map((env) => (
            <View key={env.id} style={orgPanelStyles.detailCard}>
              <View style={styles.cardHeader}>
                <Text style={orgPanelStyles.detailTitle}>
                  {env.displayName?.trim() || 'Unnamed environment'}
                </Text>
                <View style={styles.cardActions}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() =>
                      router.push(
                        `/${orgId}/projects/${projectId}/${env.id}`,
                      )
                    }
                  >
                    <Text style={styles.secondaryButtonText}>Open</Text>
                  </Pressable>
                  {canOwn ? (
                    <Pressable
                      style={[
                        styles.secondaryButton,
                        deleting.has(env.id) && styles.buttonDisabled,
                      ]}
                      disabled={deleting.has(env.id)}
                      onPress={() => void handleDeleteEnvironment(env.id)}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {deleting.has(env.id) ? 'Deleting…' : 'Delete'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              {env.description ? (
                <Text style={orgPanelStyles.detailLine}>
                  {env.description}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgActive,
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  createForm: {
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
  },
  inputError: {
    borderColor: colors.error,
  },
  fieldError: {
    color: colors.errorText,
    fontSize: 13,
  },
  submitButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submitButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
