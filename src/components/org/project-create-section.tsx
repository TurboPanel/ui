import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import { SystemManagedNotice } from '@/components/org/system-managed-notice'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { CatalogStep } from '@/components/org/project-create/catalog-step'
import {
  ChoiceCard,
  ChoiceGrid,
} from '@/components/org/project-create/choice-card'
import { parseComposeDraft } from '@/components/org/project-create/compose-draft'
import { ComposeStep } from '@/components/org/project-create/compose-step'
import { DetailsStep } from '@/components/org/project-create/details-step'
import {
  SETUP_TYPE_OPTIONS,
  type SetupType,
} from '@/components/org/project-create/setup-types'
import {
  conflictOrRawError,
  resolveMirroredWorkspaceName,
  validateProjectCreateFields,
  type FieldErrors,
  type WorkspaceMode,
} from '@/components/org/project-create/validation'
import { Button, ButtonRow } from '@/components/ui'
import { isBlankComposeData } from '@/lib/compose'
import type { ComposeDocument } from '@/lib/instance-api'
import {
  useCreateProject,
  useCreateWorkspace,
  useProjectCatalog,
  useProjects,
  useWorkspaces,
} from '@/lib/queries'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { projectOverviewHref } from '@/lib/project-navigation'
import { userWorkspaces } from '@/lib/system-inventory'
import { colors, spacing } from '@/lib/theme'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

const FORM_MAX_WIDTH = 440
/** Compose drafting needs room for real YAML lines. */
const COMPOSE_MAX_WIDTH = 760

/**
 * Wizard position. Nothing is persisted until the final step's Create button,
 * so every step is freely reversible.
 */
type Step = 'details' | 'type' | 'catalog' | 'compose'

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

function resolveLoadError(
  workspacesError: unknown,
  projectsError: unknown,
): string | null {
  if (workspacesError instanceof Error) return workspacesError.message
  if (projectsError instanceof Error) return projectsError.message
  return null
}

/** `?type=managed` from the managed overview CTA jumps past the type cards. */
function parsePreselectedType(
  value: string | string[] | undefined,
): SetupType | null {
  const found = SETUP_TYPE_OPTIONS.find((option) => option.type === value)
  return found?.type ?? null
}

/** `compose_invalid` is the control plane's machine code — say it in English. */
function createErrorMessage(error: string | null | undefined): string | null {
  if (error === 'compose_invalid') {
    return 'The control plane rejected this compose file. Fix the reported issues and try again.'
  }
  return conflictOrRawError(error)
}

function stepForType(type: SetupType): Step {
  return type === 'docker-compose' ? 'compose' : 'catalog'
}

const STEP_COPY: Record<Step, { title: string; hint: string }> = {
  details: {
    title: 'New project',
    hint: 'Name it and pick where it lives. Nothing is created yet.',
  },
  type: {
    title: 'How does it run?',
    hint: 'Pick a type — you can come back and change it before creating.',
  },
  catalog: { title: 'Choose a service', hint: '' },
  compose: { title: 'Compose file', hint: '' },
}

function stepTitle(step: Step, type: SetupType | null): string {
  if (step === 'catalog') {
    return type === 'template' ? 'Choose a template' : 'Choose a database'
  }
  return STEP_COPY[step].title
}

/**
 * Create-project wizard: details → type → (compose draft | catalog pick) →
 * Create. The project, its workspace, and its environment are only written on
 * the final Create press, so backing out of a mis-clicked type leaves no
 * half-made project to clean up.
 */
export function ProjectCreateSection({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const params = useLocalSearchParams<{ workspaceId?: string; type?: string }>()
  const workspaceScope = useOptionalWorkspaceScope()
  const { defaultEnvironmentName } = useOrgDefaultEnvironmentName(orgId)

  const workspacesQuery = useWorkspaces(orgId)
  const projectsQuery = useProjects(orgId)
  const createWorkspace = useCreateWorkspace(orgId)
  const createProject = useCreateProject(orgId)

  const [step, setStep] = useState<Step>('details')
  const [selectedType, setSelectedType] = useState<SetupType | null>(null)
  const [selectedCode, setSelectedCode] = useState('')
  const [composeYaml, setComposeYaml] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('existing')
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState('')
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [newWorkspaceNameOverridden, setNewWorkspaceNameOverridden] =
    useState(false)
  /**
   * Workspace already created by a Create press whose project insert then
   * failed — reused on retry so a second press does not collide with the
   * workspace the first one left behind.
   */
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)

  const preselectedType = parsePreselectedType(params.type)

  const catalogQuery = useProjectCatalog(orgId, {
    enabled: step === 'catalog',
  })

  const workspaces = useMemo(
    () =>
      [...userWorkspaces(workspacesQuery.data?.workspaces ?? [])].sort((a, b) =>
        (a.name ?? a.id).localeCompare(b.name ?? b.id),
      ),
    [workspacesQuery.data?.workspaces],
  )
  const allowedWorkspaceIds = useMemo(
    () => workspaces.map((workspace) => workspace.id),
    [workspaces],
  )
  const projectNames = useMemo(
    () => (projectsQuery.data?.projects ?? []).map((row) => row.name),
    [projectsQuery.data?.projects],
  )
  const loadingWorkspaces = workspacesQuery.isLoading || projectsQuery.isLoading

  const scopedWorkspaceId = resolveScopedWorkspaceId(
    params.workspaceId,
    workspaceScope?.scopeId,
  )

  /** True when URL/scope pointed at system (or unknown) workspace — not creatable. */
  const scopedWorkspaceBlocked = useMemo(() => {
    if (!scopedWorkspaceId || loadingWorkspaces) return false
    return !allowedWorkspaceIds.includes(scopedWorkspaceId)
  }, [scopedWorkspaceId, loadingWorkspaces, allowedWorkspaceIds])

  const loadError = resolveLoadError(workspacesQuery.error, projectsQuery.error)

  useEffect(() => {
    if (workspaces.length === 0 && !loadingWorkspaces) {
      setWorkspaceMode('new')
    }
  }, [workspaces.length, loadingWorkspaces])

  useEffect(() => {
    if (!scopedWorkspaceId || loadingWorkspaces) return
    if (!allowedWorkspaceIds.includes(scopedWorkspaceId)) {
      setPickedWorkspaceId('')
      return
    }
    setWorkspaceMode('existing')
    setPickedWorkspaceId(scopedWorkspaceId)
  }, [scopedWorkspaceId, loadingWorkspaces, allowedWorkspaceIds])

  useEffect(() => {
    if (pickedWorkspaceId) return
    if (scopedWorkspaceId && allowedWorkspaceIds.includes(scopedWorkspaceId)) {
      return
    }
    if (workspaces.length === 1) {
      setPickedWorkspaceId(workspaces[0]?.id ?? '')
    }
  }, [workspaces, pickedWorkspaceId, scopedWorkspaceId, allowedWorkspaceIds])

  const submitting = createWorkspace.isPending || createProject.isPending
  const trimmedProjectName = displayName.trim()
  const mirroredWorkspaceName = resolveMirroredWorkspaceName(
    trimmedProjectName,
    newWorkspaceName,
    newWorkspaceNameOverridden,
  )

  const handleNewWorkspaceNameChange = (text: string) => {
    setCreatedWorkspaceId('')
    // Blank field resumes mirroring the project name as they type.
    if (text.trim() === '') {
      setNewWorkspaceNameOverridden(false)
      setNewWorkspaceName('')
      return
    }
    setNewWorkspaceNameOverridden(true)
    setNewWorkspaceName(text)
  }

  /** Both fields can feed the new workspace's name, so either edit invalidates it. */
  const handleDisplayNameChange = (text: string) => {
    setCreatedWorkspaceId('')
    setDisplayName(text)
  }

  const handleWorkspaceModeChange = (mode: WorkspaceMode) => {
    setCreatedWorkspaceId('')
    setWorkspaceMode(mode)
  }

  const goToTypeStep = () => {
    const errors = validateProjectCreateFields({
      name: trimmedProjectName,
      description,
      workspaceMode,
      pickedWorkspaceId,
      allowedWorkspaceIds,
      newWorkspaceName,
      newWorkspaceNameOverridden,
      projectNames,
      workspaceNames: workspaces.map((workspace) => workspace.name),
    })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setApiError(null)
    if (preselectedType) {
      setSelectedType(preselectedType)
      setStep(stepForType(preselectedType))
      return
    }
    setStep('type')
  }

  const chooseType = (type: SetupType) => {
    setSelectedType(type)
    setSelectedCode('')
    setApiError(null)
    setStep(stepForType(type))
  }

  const goBack = () => {
    setApiError(null)
    // `?type=` only skips the type cards on the way forward — Back always walks
    // through them, so a pinned type is still switchable.
    setStep(step === 'type' ? 'details' : 'type')
  }

  /** Resolves the workspace, creating it first when the operator asked for a new one. */
  const resolveWorkspaceId = async (): Promise<string | null> => {
    if (workspaceMode !== 'new') {
      if (!allowedWorkspaceIds.includes(pickedWorkspaceId)) {
        setFieldErrors({ workspaceId: 'Select a user workspace.' })
        setStep('details')
        return null
      }
      return pickedWorkspaceId
    }

    if (createdWorkspaceId) return createdWorkspaceId

    const result = await createWorkspace.run({ name: mirroredWorkspaceName })
    if (!result.ok) {
      setApiError(conflictOrRawError(result.error))
      return null
    }
    setCreatedWorkspaceId(result.value.id)
    await workspaceScope?.refreshWorkspaces()
    return result.value.id
  }

  const create = async () => {
    if (!selectedType) return
    setApiError(null)

    let compose: ComposeDocument | undefined
    if (selectedType === 'docker-compose') {
      const parsed = parseComposeDraft(composeYaml)
      if (!parsed.ok) {
        setApiError(parsed.error)
        return
      }
      // A blank draft sends no options at all, so the project lands with the
      // same empty compose a bare compose project has always started with.
      if (!isBlankComposeData(parsed.document.data)) {
        compose = parsed.document
      }
    } else if (!selectedCode) {
      setApiError(
        selectedType === 'template'
          ? 'Choose a template first.'
          : 'Choose a database engine first.',
      )
      return
    }

    const workspaceId = await resolveWorkspaceId()
    if (!workspaceId) return

    const trimmedDescription = description.trim()
    const result = await createProject.run({
      type: selectedType,
      workspaceId,
      name: trimmedProjectName,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      ...(selectedCode ? { code: selectedCode } : {}),
      ...(compose ? { options: { compose } } : {}),
    })
    if (!result.ok) {
      setApiError(createErrorMessage(result.error))
      return
    }

    router.replace(projectOverviewHref(orgId, result.value.id) as Href)
  }

  const copy = STEP_COPY[step]
  const hint =
    step === 'details'
      ? `Creates a ${defaultEnvironmentName} environment when you finish. Nothing is created yet.`
      : copy.hint

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
    >
      <View
        style={[
          styles.column,
          { maxWidth: step === 'compose' ? COMPOSE_MAX_WIDTH : FORM_MAX_WIDTH },
        ]}
      >
        <View style={styles.pageHeader}>
          <Text style={[orgPanelStyles.pageTitle, styles.centeredText]}>
            {stepTitle(step, selectedType)}
          </Text>
          {hint ? (
            <Text style={[orgPanelStyles.pageCopy, styles.centeredText]}>
              {hint}
            </Text>
          ) : null}
        </View>

        <GlassSurface style={styles.panel} intensity="regular">
          <View style={styles.panelBody}>
            {apiError ?? loadError ? (
              <Text style={orgPanelStyles.error}>{apiError ?? loadError}</Text>
            ) : null}

            {scopedWorkspaceBlocked ? (
              <SystemManagedNotice
                title="Platform workspace"
                description="Projects cannot be created in the System workspace. Choose a user workspace below."
                onBack={() => {
                  router.replace(`/${orgId}/projects` as Href)
                }}
                backLabel="Back to projects"
              />
            ) : null}

            {step === 'details' ? (
              <DetailsStep
                displayName={displayName}
                description={description}
                workspaceMode={workspaceMode}
                workspaces={workspaces}
                loadingWorkspaces={loadingWorkspaces}
                pickedWorkspaceId={pickedWorkspaceId}
                newWorkspaceNameValue={mirroredWorkspaceName}
                fieldErrors={fieldErrors}
                onDisplayNameChange={handleDisplayNameChange}
                onDescriptionChange={setDescription}
                onWorkspaceModeChange={handleWorkspaceModeChange}
                onPickedWorkspaceIdChange={setPickedWorkspaceId}
                onNewWorkspaceNameChange={handleNewWorkspaceNameChange}
              />
            ) : null}

            {step === 'type' ? (
              <ChoiceGrid>
                {SETUP_TYPE_OPTIONS.map((option) => (
                  <ChoiceCard
                    key={option.type}
                    label={option.label}
                    description={option.description}
                    selected={selectedType === option.type}
                    onPress={() => chooseType(option.type)}
                  />
                ))}
              </ChoiceGrid>
            ) : null}

            {step === 'catalog' && selectedType && selectedType !== 'docker-compose' ? (
              <CatalogStep
                type={selectedType}
                catalog={catalogQuery.data?.catalog ?? []}
                loading={catalogQuery.isLoading}
                error={
                  catalogQuery.error instanceof Error
                    ? catalogQuery.error.message
                    : null
                }
                selectedCode={selectedCode}
                disabled={submitting}
                onSelect={setSelectedCode}
              />
            ) : null}

            {step === 'compose' ? (
              <ComposeStep
                yaml={composeYaml}
                editable={!submitting}
                onChange={setComposeYaml}
              />
            ) : null}

            <StepActions
              step={step}
              submitting={submitting}
              canCreate={
                selectedType === 'docker-compose' || selectedCode.length > 0
              }
              onBack={goBack}
              onNext={goToTypeStep}
              onCreate={() => {
                void create()
              }}
            />
          </View>
        </GlassSurface>

        <Pressable
          style={[styles.cancelLink, webPointer]}
          onPress={() => {
            router.replace(`/${orgId}/projects` as Href)
          }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

/** Footer buttons: Next on details, Back everywhere after, Create on the last step. */
function StepActions({
  step,
  submitting,
  canCreate,
  onBack,
  onNext,
  onCreate,
}: Readonly<{
  step: Step
  submitting: boolean
  canCreate: boolean
  onBack: () => void
  onNext: () => void
  onCreate: () => void
}>) {
  if (step === 'details') {
    return (
      <Button
        label="Next"
        variant="primary"
        onPress={onNext}
        accessibilityLabel="Next"
      />
    )
  }

  return (
    <ButtonRow>
      <Button
        label="Back"
        variant="secondary"
        disabled={submitting}
        onPress={onBack}
        accessibilityLabel="Back"
      />
      {step === 'type' ? null : (
        <Button
          label="Create project"
          busyLabel="Creating…"
          variant="primary"
          busy={submitting}
          disabled={!canCreate}
          onPress={onCreate}
          accessibilityLabel="Create project"
        />
      )}
    </ButtonRow>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  root: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  column: {
    width: '100%',
    alignSelf: 'center',
    gap: spacing.md,
  },
  pageHeader: {
    gap: spacing.xs,
    alignItems: 'center',
  },
  centeredText: {
    textAlign: 'center',
  },
  panel: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  panelBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cancelLink: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  cancelLinkText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
})
