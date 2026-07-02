import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createProject,
  fetchProjectCatalog,
  fetchVisibleWorkspaces,
  isForbiddenError,
  type CatalogSummary,
  type WorkspaceRecord,
} from '@/lib/instance-api'
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

type ProjectType = 'blank' | 'template' | 'managed'

const TYPE_OPTIONS: {
  type: ProjectType
  label: string
  description: string
}[] = [
  {
    type: 'blank',
    label: 'Blank',
    description: 'Start with an empty project and add environments manually.',
  },
  {
    type: 'template',
    label: 'From Template',
    description: 'Scaffold from a catalog template with default compose options.',
  },
  {
    type: 'managed',
    label: 'Managed App',
    description: 'Deploy a managed application from the project catalog.',
  },
]

export function ProjectCreateSection({ orgId }: { orgId: string }) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>()
  const resolvedWorkspaceId =
    typeof workspaceId === 'string' ? workspaceId : undefined

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedType, setSelectedType] = useState<ProjectType | null>(null)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<CatalogSummary[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<
    string | undefined
  >(resolvedWorkspaceId)
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string
    workspaceId?: string
  }>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setSelectedWorkspaceId(resolvedWorkspaceId)
  }, [resolvedWorkspaceId])

  useEffect(() => {
    if (resolvedWorkspaceId) {
      return
    }

    let cancelled = false

    const load = async () => {
      setWorkspacesLoading(true)
      setWorkspacesError(null)
      try {
        const result = await fetchVisibleWorkspaces()
        if (!cancelled) {
          setWorkspaces(result.workspaces)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setWorkspacesError(
            err instanceof Error ? err.message : 'Failed to load workspaces',
          )
        }
      } finally {
        if (!cancelled) {
          setWorkspacesLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [resolvedWorkspaceId, handleUnauthorized])

  useEffect(() => {
    if (step !== 2 || !selectedType || selectedType === 'blank') {
      return
    }

    let cancelled = false

    const load = async () => {
      setCatalogLoading(true)
      setCatalogError(null)
      try {
        const result = await fetchProjectCatalog()
        if (!cancelled) {
          setCatalog(result.catalog)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setCatalogError(
            err instanceof Error ? err.message : 'Failed to load catalog',
          )
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [step, selectedType, handleUnauthorized])

  const filteredCatalog = catalog.filter((entry) => {
    if (selectedType === 'template') {
      return entry.kind === 'template'
    }
    if (selectedType === 'managed') {
      return entry.kind === 'managed'
    }
    return false
  })

  const handleTypeSelect = (type: ProjectType) => {
    setSelectedType(type)
    setSelectedCode(null)
    setApiError(null)
    if (type === 'blank') {
      setStep(3)
    } else {
      setStep(2)
    }
  }

  const handleBack = () => {
    setApiError(null)
    if (step === 3) {
      if (selectedType === 'blank') {
        setStep(1)
        setSelectedType(null)
      } else {
        setStep(2)
      }
    } else if (step === 2) {
      setStep(1)
      setSelectedType(null)
      setSelectedCode(null)
    }
  }

  const validate = (): boolean => {
    const trimmedName = displayName.trim()
    const errors: { displayName?: string; workspaceId?: string } = {}

    if (!resolvedWorkspaceId && !selectedWorkspaceId) {
      errors.workspaceId = 'Select a workspace.'
    }

    if (!trimmedName) {
      errors.displayName = 'Name is required.'
    } else if (trimmedName.length > 255) {
      errors.displayName = 'Name must be 255 characters or fewer.'
    } else if (!DISPLAY_NAME_PATTERN.test(trimmedName)) {
      errors.displayName =
        'Name may only contain letters, numbers, spaces, dots, underscores, and hyphens.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    const workspaceIdForCreate = resolvedWorkspaceId ?? selectedWorkspaceId
    if (!workspaceIdForCreate) {
      setApiError('Select a workspace before creating the project.')
      return
    }
    if (!selectedType) {
      return
    }
    if ((selectedType === 'template' || selectedType === 'managed') && !selectedCode) {
      setApiError('Select a catalog entry before continuing.')
      return
    }
    if (!validate()) {
      return
    }

    setSubmitting(true)
    setApiError(null)
    try {
      const trimmedDescription = description.trim()
      await createProject({
        workspaceId: workspaceIdForCreate,
        type: selectedType,
        displayName: displayName.trim(),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        ...(selectedCode ? { code: selectedCode } : {}),
      })
      router.replace(`/${orgId}/projects`)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setApiError(
        err instanceof Error ? err.message : 'Failed to create project',
      )
    } finally {
      setSubmitting(false)
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
    <View style={styles.root}>
      <Text style={styles.heading}>New project</Text>

      <SectionPanel title="New project">
        {step > 1 ? (
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
        ) : null}

        {step === 1 ? (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Choose project type</Text>
            <View style={styles.typeGrid}>
              {TYPE_OPTIONS.map((option) => (
                <Pressable
                  key={option.type}
                  style={styles.typeCard}
                  onPress={() => handleTypeSelect(option.type)}
                >
                  <Text style={styles.typeCardLabel}>{option.label}</Text>
                  <Text style={styles.typeCardDescription}>
                    {option.description}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Select from catalog</Text>
            {catalogError ? (
              <Text style={orgPanelStyles.error}>{catalogError}</Text>
            ) : null}
            {catalogLoading ? (
              <Text style={orgPanelStyles.muted}>Loading catalog…</Text>
            ) : filteredCatalog.length === 0 ? (
              <Text style={orgPanelStyles.muted}>
                No catalog entries for this type.
              </Text>
            ) : (
              <ScrollView style={styles.catalogScroll}>
                <View style={styles.catalogList}>
                  {filteredCatalog.map((entry) => (
                    <Pressable
                      key={entry.code}
                      style={[
                        styles.catalogCard,
                        selectedCode === entry.code && styles.catalogCardSelected,
                      ]}
                      onPress={() => {
                        setSelectedCode(entry.code)
                        setStep(3)
                      }}
                    >
                      <Text style={styles.catalogTitle}>
                        {entry.displayName}
                      </Text>
                      <Text style={styles.catalogCode}>{entry.code}</Text>
                      <Text style={styles.catalogDescription}>
                        {entry.description}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Project details</Text>
            {selectedCode ? (
              <Text style={orgPanelStyles.muted}>
                Catalog: {selectedCode}
              </Text>
            ) : null}

            {!resolvedWorkspaceId ? (
              <View style={styles.field}>
                <Text style={styles.label}>Workspace *</Text>
                {workspacesError ? (
                  <Text style={orgPanelStyles.error}>{workspacesError}</Text>
                ) : null}
                {workspacesLoading ? (
                  <Text style={orgPanelStyles.muted}>Loading workspaces…</Text>
                ) : workspaces.length === 0 ? (
                  <Text style={orgPanelStyles.muted}>
                    No workspaces available. Create a workspace first.
                  </Text>
                ) : (
                  <View style={styles.workspaceList}>
                    {workspaces.map((workspace) => (
                      <Pressable
                        key={workspace.id}
                        style={[
                          styles.workspaceCard,
                          selectedWorkspaceId === workspace.id &&
                            styles.workspaceCardSelected,
                        ]}
                        onPress={() => {
                          setSelectedWorkspaceId(workspace.id)
                          setFieldErrors((current) => ({
                            ...current,
                            workspaceId: undefined,
                          }))
                        }}
                      >
                        <Text style={styles.workspaceCardLabel}>
                          {workspace.displayName?.trim() || 'Unnamed workspace'}
                        </Text>
                        {workspace.description ? (
                          <Text style={styles.workspaceCardDescription}>
                            {workspace.description}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                )}
                {fieldErrors.workspaceId ? (
                  <Text style={styles.fieldError}>
                    {fieldErrors.workspaceId}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={inputStyle(Boolean(fieldErrors.displayName))}
                value={displayName}
                onChangeText={(t) => {
                  setDisplayName(t)
                  setFieldErrors({})
                }}
                placeholder="e.g. my-app"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
                maxLength={255}
              />
              {fieldErrors.displayName ? (
                <Text style={styles.fieldError}>{fieldErrors.displayName}</Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={inputStyle(false)}
                value={description}
                onChangeText={setDescription}
                placeholder="Optional description"
                placeholderTextColor={colors.textDim}
                editable={!submitting}
                maxLength={255}
                multiline
              />
            </View>

            {apiError ? (
              <Text style={orgPanelStyles.error}>{apiError}</Text>
            ) : null}

            <Pressable
              style={[styles.primaryButton, submitting && styles.buttonDisabled]}
              disabled={submitting}
              onPress={() => void handleSubmit()}
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? 'Creating…' : 'Create project'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  backButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  stepContent: {
    gap: spacing.md,
  },
  stepTitle: {
    color: colors.textBody,
    fontSize: 15,
    fontWeight: '600',
  },
  typeGrid: {
    gap: spacing.sm,
  },
  typeCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  typeCardLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  typeCardDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  catalogScroll: {
    maxHeight: 360,
  },
  catalogList: {
    gap: spacing.sm,
  },
  catalogCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInset,
    padding: spacing.md,
    gap: 4,
  },
  catalogCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  catalogTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  catalogCode: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  catalogDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  workspaceList: {
    gap: spacing.sm,
  },
  workspaceCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    padding: spacing.sm,
    gap: 4,
  },
  workspaceCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  workspaceCardLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  workspaceCardDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
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
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
