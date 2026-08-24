import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import { SystemManagedNotice } from '@/components/org/system-managed-notice'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { CatalogStep } from '@/components/org/project-create/catalog-step'
import { ChoiceGrid } from '@/components/org/project-create/choice-card'
import { ComposeStep } from '@/components/org/project-create/compose-step'
import { DetailsStep } from '@/components/org/project-create/details-step'
import { seedRepositoryCompose } from '@/components/org/project-create/repository-seed'
import { RepositoryStep } from '@/components/org/project-create/repository-step'
import { SetupTypeChoiceCard } from '@/components/org/project-create/setup-type-icons'
import {
  SETUP_TYPE_OPTIONS,
  setupOptionForChoice,
  type SetupChoice,
  type SetupTypeOption,
} from '@/components/org/project-create/setup-types'
import {
  conflictOrRawError,
  resolveMirroredWorkspaceName,
  validateProjectCreateFields,
  type FieldErrors,
  type WorkspaceMode,
} from '@/components/org/project-create/validation'
import { Button, ButtonRow } from '@/components/ui'
import {
  emptyComposeDocument,
  isBlankComposeData,
  normalizeCompose,
  type ComposeDocument,
} from '@/lib/compose'
import {
  useCreateProject,
  useCreateWorkspace,
  useProjectCatalog,
  useProjects,
  useSources,
  useWorkspaces,
} from '@/lib/queries'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { projectOverviewHref } from '@/lib/project-navigation'
import { userWorkspaces } from '@/lib/system-inventory'
import { colors, spacing } from '@/lib/theme'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

const FORM_MAX_WIDTH = 440

/**
 * Wizard position. Nothing is persisted until the final step's Create button,
 * so every step is freely reversible.
 */
type Step = 'details' | 'type' | 'repository' | 'catalog' | 'compose'

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

/**
 * `?type=managed` from the managed overview CTA jumps past the type cards.
 * Accepts either a card id (`services`, `repository`) or a project type
 * (`docker-compose`); a bare project type resolves to the first card offering
 * it.
 *
 * Card ids are matched first and separately. Three cards are `docker-compose`
 * now, and a bare `?type=docker-compose` has always meant the blank YAML slate
 * — resolving it by card order alone would let whichever compose card happens
 * to sit first quietly take over every existing link.
 */
function parsePreselectedChoice(
  value: string | string[] | undefined,
): SetupChoice | null {
  const byChoice = SETUP_TYPE_OPTIONS.find((option) => option.choice === value)
  if (byChoice) return byChoice.choice
  const byType = SETUP_TYPE_OPTIONS.find((option) => option.type === value)
  return byType?.choice ?? null
}

/** `compose_invalid` is the control plane's machine code — say it in English. */
function createErrorMessage(error: string | null | undefined): string | null {
  if (error === 'compose_invalid') {
    return 'The control plane rejected this compose file. Fix the reported issues and try again.'
  }
  return conflictOrRawError(error)
}

function stepForOption(option: SetupTypeOption): Step {
  // Routed off `choice`, never `type`: three cards are `docker-compose`, and
  // the repository one needs its picker before the compose surface opens.
  if (option.choice === 'repository') return 'repository'
  return option.type === 'docker-compose' ? 'compose' : 'catalog'
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
  repository: {
    title: 'Link a repository',
    hint: 'Pick one you have already connected. Nothing is created yet.',
  },
  catalog: { title: 'Choose a service', hint: '' },
  compose: { title: '', hint: '' },
}

function stepTitle(step: Step, option: SetupTypeOption | null): string {
  if (step === 'catalog') {
    return option?.type === 'template'
      ? 'Choose a template'
      : 'Choose a database'
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
  const [selectedChoice, setSelectedChoice] = useState<SetupChoice | null>(
    null,
  )
  const [selectedCode, setSelectedCode] = useState('')
  /** Repository card: the picked source id and ref, until they seed the draft. */
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [repositoryBranch, setRepositoryBranch] = useState('')
  /**
   * `sourceId@branch` the current draft was seeded from. Re-seeding on every
   * Continue would discard whatever the operator did on the compose surface
   * after a Back that changed neither.
   */
  const [seededRepositoryKey, setSeededRepositoryKey] = useState('')
  /** Seed document handed to the editor; edits come back via onDraftChange. */
  const [composeDoc, setComposeDoc] = useState<ComposeDocument>(() =>
    emptyComposeDocument(),
  )
  /** Latest editor draft — `null` while the YAML does not parse. */
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

  const preselectedChoice = parsePreselectedChoice(params.type)
  const selectedOption = selectedChoice
    ? setupOptionForChoice(selectedChoice) ?? null
    : null

  const catalogQuery = useProjectCatalog(orgId, {
    enabled: step === 'catalog',
  })

  /**
   * Same query the repository step renders from — one key, one cache entry, so
   * holding it here costs no extra fetch. Only the id lives in wizard state and
   * the record is resolved from *this* list, so a repository disconnected while
   * the wizard was open disables Continue instead of seeding a draft bound to a
   * source the org no longer has.
   */
  const sourcesQuery = useSources(orgId, { enabled: step === 'repository' })
  const selectedSource = useMemo(
    () =>
      (sourcesQuery.data?.sources ?? []).find(
        (source) => source.id === selectedSourceId,
      ) ?? null,
    [sourcesQuery.data?.sources, selectedSourceId],
  )

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
    const preselected = preselectedChoice
      ? setupOptionForChoice(preselectedChoice)
      : undefined
    if (preselected) {
      setSelectedChoice(preselected.choice)
      setStep(stepForOption(preselected))
      return
    }
    setStep('type')
  }

  const chooseType = (option: SetupTypeOption) => {
    setSelectedChoice(option.choice)
    setSelectedCode('')
    setApiError(null)
    // Leaving the repository card drops the draft it seeded: Compose promises a
    // blank slate, and a service still bound to a repository is not one.
    if (option.choice !== 'repository' && seededRepositoryKey) {
      setComposeDoc(emptyComposeDocument())
      setSeededRepositoryKey('')
    }
    setStep(stepForOption(option))
  }

  /** Seeds the compose draft from the picked repository and opens the surface. */
  const continueFromRepository = () => {
    if (!selectedSource) return
    setApiError(null)
    const seedKey = `${selectedSource.id}@${repositoryBranch.trim()}`
    if (seedKey !== seededRepositoryKey) {
      setComposeDoc(seedRepositoryCompose(selectedSource, repositoryBranch))
      setSeededRepositoryKey(seedKey)
    }
    setStep('compose')
  }

  const goBack = () => {
    setApiError(null)
    if (step === 'type') {
      setStep('details')
      return
    }
    // A seeded draft steps back to the picker it came from, so the repository
    // and branch are still there to change rather than being re-chosen blind.
    if (step === 'compose' && selectedChoice === 'repository') {
      setStep('repository')
      return
    }
    // `?type=` only skips the type cards on the way forward — Back always walks
    // through them, so a pinned type is still switchable.
    setStep('type')
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

  /**
   * Commits the wizard. `drafted` arrives from the compose surface's Save slot;
   * catalog types pass nothing and create straight from the selection.
   */
  const create = async (drafted?: ComposeDocument) => {
    if (!selectedOption) return
    const selectedType = selectedOption.type
    setApiError(null)

    let compose: ComposeDocument | undefined
    if (selectedType === 'docker-compose') {
      const normalized = normalizeCompose(drafted ?? composeDoc)
      // A blank draft sends no options at all, so the project lands with the
      // same empty compose a bare compose project has always started with.
      if (!isBlankComposeData(normalized.data)) {
        compose = normalized
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

  if (step === 'compose') {
    return (
      <ComposeStep
        orgId={orgId}
        name={displayName}
        description={description}
        workspaceId={pickedWorkspaceId}
        compose={composeDoc}
        initialSection={selectedOption?.section ?? 'compose'}
        creating={submitting}
        error={apiError ?? loadError}
        onNameChange={setDisplayName}
        onDraftChange={(next) => {
          // `null` means the YAML is mid-edit and unparseable — keep the last
          // good document so Back/forward does not lose the file.
          if (next) setComposeDoc(next)
        }}
        onCreate={() => {
          void create()
        }}
        onBack={goBack}
      />
    )
  }

  const copy = STEP_COPY[step]
  const title = stepTitle(step, selectedOption)
  const hint =
    step === 'details'
      ? `Creates a ${defaultEnvironmentName} environment when you finish. Nothing is created yet.`
      : copy.hint

  return (
    <View style={styles.column}>
      <View style={styles.pageHeader}>
        <Text style={[orgPanelStyles.pageTitle, styles.centeredText]}>
          {title}
        </Text>
        {hint ? (
          <Text style={[orgPanelStyles.pageCopy, styles.centeredText]}>
            {hint}
          </Text>
        ) : null}
      </View>

      <PanelShell>
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

        {step === 'repository' ? (
          <RepositoryStep
            orgId={orgId}
            selectedSourceId={selectedSourceId}
            branch={repositoryBranch}
            disabled={submitting}
            onSelectSourceId={setSelectedSourceId}
            onBranchChange={setRepositoryBranch}
          />
        ) : null}

        {step === 'type' ? (
          <ChoiceGrid>
            {SETUP_TYPE_OPTIONS.map((option) => (
              <SetupTypeChoiceCard
                key={option.choice}
                option={option}
                selected={selectedChoice === option.choice}
                onPress={() => chooseType(option)}
              />
            ))}
          </ChoiceGrid>
        ) : null}

        {step === 'catalog' &&
        selectedOption &&
        selectedOption.type !== 'docker-compose' ? (
          <CatalogStep
            type={selectedOption.type}
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

        <StepActions
          step={step}
          submitting={submitting}
          canCreate={selectedCode.length > 0}
          canContinue={selectedSource != null}
          onBack={goBack}
          onNext={goToTypeStep}
          onContinue={continueFromRepository}
          onCreate={() => {
            void create()
          }}
        />
      </PanelShell>

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
  )
}

/** Wizard body container for the form-shaped steps. */
function PanelShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <GlassSurface style={styles.panel} intensity="regular">
      <View style={styles.panelBody}>{children}</View>
    </GlassSurface>
  )
}

/**
 * Footer buttons: Next on details, Back everywhere after, Create on the last
 * step. The repository step ends in Continue instead — the compose surface it
 * opens owns the single Create.
 */
function StepActions({
  step,
  submitting,
  canCreate,
  canContinue,
  onBack,
  onNext,
  onContinue,
  onCreate,
}: Readonly<{
  step: Step
  submitting: boolean
  canCreate: boolean
  canContinue: boolean
  onBack: () => void
  onNext: () => void
  onContinue: () => void
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

  if (step === 'repository') {
    return (
      <ButtonRow>
        <Button
          label="Back"
          variant="secondary"
          disabled={submitting}
          onPress={onBack}
          accessibilityLabel="Back"
        />
        <Button
          label="Continue"
          variant="primary"
          disabled={!canContinue}
          onPress={onContinue}
          accessibilityLabel="Continue"
        />
      </ButtonRow>
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
  // No ScrollView here: `OrgScreenScroll` (the org Stack screen layout) already
  // scrolls and already applies the page's vertical/horizontal insets. Nesting a
  // second vertical ScrollView leaves the inner one unbounded on native, which
  // is what padded the wizard with dead space above and below on iOS.
  column: {
    width: '100%',
    maxWidth: FORM_MAX_WIDTH,
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
  plainPanelBody: {
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
