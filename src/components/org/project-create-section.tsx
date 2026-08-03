import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
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
import { WizardStepIndicator } from '@/components/org/wizard-step-indicator'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import { withGuardedAction } from '@/lib/guarded-action'
import {
  createProject,
  fetchVisibleWorkspaces,
  isForbiddenError,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { projectSetupHref } from '@/lib/project-navigation'
import { chrome, colors, spacing } from '@/lib/theme'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

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

type FieldErrors = {
  displayName?: string
  workspaceId?: string
}

function validateProjectFields(options: {
  displayName: string
  resolvedWorkspaceId?: string
  selectedWorkspaceId?: string
}): FieldErrors {
  const trimmedName = options.displayName.trim()
  const errors: FieldErrors = {}

  if (!options.resolvedWorkspaceId && !options.selectedWorkspaceId) {
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

  return errors
}

function resolveScopedWorkspaceId(
  paramWorkspaceId: string | string[] | undefined,
  scopeId: string | undefined,
): string | undefined {
  if (typeof paramWorkspaceId === 'string' && paramWorkspaceId) {
    return paramWorkspaceId
  }
  if (scopeId && scopeId !== ALL_WORKSPACES_SCOPE) {
    return scopeId
  }
  return undefined
}

function resolveWorkspaceId(options: {
  scopedWorkspaceId?: string
  workspaces: WorkspaceRecord[]
  pickedWorkspaceId: string
}): string | undefined {
  if (options.scopedWorkspaceId) return options.scopedWorkspaceId
  if (options.workspaces.length === 1) return options.workspaces[0]?.id
  return options.pickedWorkspaceId || undefined
}

function workspaceLabel(workspace: WorkspaceRecord): string {
  return workspace.displayName?.trim() || 'Workspace'
}

function WorkspacePicker({
  workspaces,
  loading,
  selectedId,
  error,
  onSelect,
}: Readonly<{
  workspaces: WorkspaceRecord[]
  loading: boolean
  selectedId?: string
  error?: string
  onSelect: (workspaceId: string) => void
}>) {
  return (
    <>
      <Text style={styles.label}>Workspace</Text>
      {loading ? (
        <Text style={orgPanelStyles.muted}>Loading workspaces…</Text>
      ) : (
        <View style={styles.workspaceList}>
          {workspaces.map((ws) => {
            const selected = selectedId === ws.id
            return (
              <Pressable
                key={ws.id}
                style={[
                  styles.workspaceOption,
                  selected && styles.workspaceOptionSelected,
                  webPointer,
                ]}
                onPress={() => onSelect(ws.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={workspaceLabel(ws)}
              >
                <Text style={styles.workspaceOptionText}>
                  {workspaceLabel(ws)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
    </>
  )
}

/**
 * Step 1 of project setup: create an empty project (org default environment once).
 * Type / catalog selection continues on the project setup screen.
 */
export function ProjectCreateSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const params = useLocalSearchParams<{ workspaceId?: string }>()
  const workspaceScope = useOptionalWorkspaceScope()
  const { defaultEnvironmentName } = useOrgDefaultEnvironmentName(orgId)

  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState<string>('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingWorkspaces(true)
      try {
        const result = await fetchVisibleWorkspaces()
        if (cancelled) return
        const sorted = [...result.workspaces].sort((a, b) =>
          (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id),
        )
        setWorkspaces(sorted)
      } catch (err) {
        if (cancelled) return
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setApiError(
          err instanceof Error ? err.message : 'Failed to load workspaces',
        )
      } finally {
        if (!cancelled) setLoadingWorkspaces(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [handleUnauthorized])

  const scopedWorkspaceId = resolveScopedWorkspaceId(
    params.workspaceId,
    workspaceScope?.scopeId,
  )
  const resolvedWorkspaceId = resolveWorkspaceId({
    scopedWorkspaceId,
    workspaces,
    pickedWorkspaceId,
  })
  const showWorkspacePicker = !scopedWorkspaceId && workspaces.length > 1

  const submit = async () => {
    const errors = validateProjectFields({
      displayName,
      resolvedWorkspaceId,
      selectedWorkspaceId: pickedWorkspaceId,
    })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0 || !resolvedWorkspaceId) return

    setSubmitting(true)
    setApiError(null)
    const result = await withGuardedAction(
      () =>
        createProject({
          type: 'empty',
          workspaceId: resolvedWorkspaceId,
          displayName: displayName.trim(),
        }),
      handleUnauthorized,
      'Failed to create project',
    )
    setSubmitting(false)
    if (!result.ok) {
      if (result.error) setApiError(result.error)
      return
    }

    router.replace(projectSetupHref(orgId, result.value.id) as Href)
  }

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <WizardStepIndicator labels={['Details', 'Type']} activeIndex={0} />

      <SectionPanel
        title="New project"
        hint={`Creates an empty project with a ${defaultEnvironmentName} environment. You choose Compose, template, or managed next.`}
        accent
      >
        {apiError ? <Text style={orgPanelStyles.error}>{apiError}</Text> : null}

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="My project"
          placeholderTextColor={colors.textDim}
          autoCapitalize="words"
          accessibilityLabel="Project name"
          style={[
            Platform.OS === 'web' ? webInputStyle : styles.input,
            fieldErrors.displayName ? styles.inputError : null,
          ]}
        />
        {fieldErrors.displayName ? (
          <Text style={orgPanelStyles.error}>{fieldErrors.displayName}</Text>
        ) : null}

        {showWorkspacePicker ? (
          <WorkspacePicker
            workspaces={workspaces}
            loading={loadingWorkspaces}
            selectedId={pickedWorkspaceId || resolvedWorkspaceId}
            error={fieldErrors.workspaceId}
            onSelect={setPickedWorkspaceId}
          />
        ) : null}

        <Pressable
          style={[
            styles.primaryButton,
            webPointer,
            submitting && styles.disabled,
          ]}
          disabled={submitting}
          onPress={() => {
            void submit()
          }}
          accessibilityRole="button"
          accessibilityLabel="Create project"
        >
          <Text style={styles.primaryButtonText}>
            {submitting ? 'Creating…' : 'Create project'}
          </Text>
        </Pressable>
      </SectionPanel>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  label: {
    color: colors.textLabel,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: spacing.sm,
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
  workspaceList: {
    gap: spacing.xs,
  },
  workspaceOption: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  workspaceOptionSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  workspaceOptionText: {
    color: colors.text,
    fontSize: 15,
  },
  primaryButton: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    backgroundColor: chrome.accent,
    borderRadius: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: chrome.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.55,
  },
})
