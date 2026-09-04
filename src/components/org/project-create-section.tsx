import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import { SystemManagedNotice } from '@/components/org/system-managed-notice'
import { panelStyles } from '@/components/ui/panel-styles'
import { CatalogStep } from '@/components/org/project-create/catalog-step'
import { ChoiceTileGrid } from '@/components/org/project-create/choice-card'
import { ComposeStep } from '@/components/org/project-create/compose-step'
import { DetailsStep } from '@/components/org/project-create/details-step'
import {
  parseRepositoryCompose,
  seedComposeForLane,
  seedHostingCompose,
} from '@/lib/project-create/repository-seed'
import {
  detectedComposePath,
  rankRepositoryLanes,
  recommendedLane,
  rootFromEntries,
  type RepositoryLane,
} from '@/lib/compose/repository-lane'
import {
  suggestedSimpleAppConfig,
  type RepositoryBuilder,
  type SimpleAppConfig,
} from '@/lib/project-create/simple-app'
import { RepositoryStep } from '@/components/org/project-create/repository-step'
import { resolveWizardSelectedSource } from '@/lib/project-create/selected-source'
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
  useRepositoryInspection,
  useCreateProject,
  useCreateWorkspace,
  useProjectCatalog,
  useProjects,
  useRepositories,
  useWorkspaces,
} from '@/lib/queries'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import {
  DRAFT_REPOSITORY_APP_TAB_IDS,
  projectOverviewHref,
} from '@/lib/project-navigation'
import type {
  RepositoryInspection,
  RepositoryRecord,
} from '@/lib/instance-api'
import { userWorkspaces } from '@/lib/system-inventory'
import { colors, spacing, webPointer } from '@/lib/theme'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

const FORM_MAX_WIDTH = 440

/**
 * Wizard position. Nothing is persisted until the final step's Create button,
 * so every step is freely reversible. The repository step owns everything
 * about the picked repository — check, branch, builder, Simple-application
 * settings — so there is no separate lane step anymore.
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
    title: 'What are you starting from?',
    hint: '',
  },
  repository: {
    title: 'Link a repository',
    hint: 'Pick it, then set up how it builds and runs. Nothing is created yet.',
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

function resolveSelectedOption(
  choice: SetupChoice | null,
): SetupTypeOption | null {
  if (!choice) return null
  return setupOptionForChoice(choice) ?? null
}

function wizardHint(
  step: Step,
  defaultEnvironmentName: string,
  fallback: string,
): string {
  if (step === 'details') {
    return `Creates a ${defaultEnvironmentName} environment when you finish. Nothing is created yet.`
  }
  return fallback
}

function asError(error: unknown): Error | null {
  return error instanceof Error ? error : null
}

function isCatalogStep(
  step: Step,
  option: SetupTypeOption | null,
): option is SetupTypeOption & {
  type: Exclude<SetupTypeOption['type'], 'docker-compose'>
} {
  return step === 'catalog' && option != null && option.type !== 'docker-compose'
}

function canContinueFromStep(
  step: Step,
  selectedOption: SetupTypeOption | null,
  builder: RepositoryBuilder | null,
  selectedSource: RepositoryRecord | null,
): boolean {
  if (step === 'type') return selectedOption != null
  // The repository step ends only once a builder is chosen, which itself
  // waits on the read — everything the seed needs lives on this one screen.
  return selectedSource != null && builder != null
}

/**
 * The read fires the moment a repository is picked — it costs a provider
 * round-trip or a clone on a connected server, but making the operator press
 * a second button to start it, right after the pick that already committed
 * them to this repository, was pure friction. Keyed by branch, so editing
 * the production branch afterwards re-reads at the new ref.
 */
function sourceInspectionEnabled(step: Step, sourceId: string): boolean {
  return step === 'repository' && sourceId.length > 0
}

/** The compose lane the chosen builder seeds. */
function laneForBuilder(
  builder: RepositoryBuilder,
  kind: SimpleAppConfig['kind'],
): RepositoryLane {
  if (builder === 'compose') return 'compose'
  if (builder === 'site-php') return 'site-php'
  // Railpack's card is disabled until the wizard can seed it; `simple` is the
  // only builder left, split by what it produces.
  return kind === 'static' ? 'static' : 'app'
}

/**
 * Compose seed for the chosen lane, built from what the repository read found.
 *
 * The compose lane uses the repository's own document. Parsing can fail on YAML
 * we did not write, so it falls back to the static lane's shape rather than
 * seeding a draft the operator cannot create from.
 */
function seedForRepositoryLane(
  source: RepositoryRecord,
  branch: string,
  lane: RepositoryLane,
  inspection: RepositoryInspection | undefined,
  simple: SimpleAppConfig,
): ComposeDocument {
  const files = inspection?.files ?? []
  const composePath = detectedComposePath(files)
  const composeFile = files.find(
    (file) => file.path === composePath && file.found,
  )
  const repositoryCompose = composeFile?.content
    ? parseRepositoryCompose(composeFile.content)
    : undefined
  const detectedRoot = rootFromEntries(inspection?.entries ?? [])
  // The operator's output directory is the static document root; detection
  // only fills the gap when they left the field empty.
  const root = simple.outputDirectory.trim() || detectedRoot
  return seedComposeForLane({
    source,
    branch,
    lane: lane === 'compose' && !repositoryCompose ? 'static' : lane,
    ...(repositoryCompose ? { repositoryCompose } : {}),
    ...(root ? { root } : {}),
    simple: {
      buildCommand: simple.buildCommand,
      startCommand: simple.startCommand,
      subdirectory: simple.buildRoot,
    },
  })
}

/**
 * Back's destination. A seeded draft steps back to the screen it came from, so
 * the repository, branch, and builder settings are still there to change
 * rather than being re-chosen blind. `?type=` only skips the type cards on
 * the way forward — Back always walks through them, so a pinned type is
 * still switchable.
 */
function resolveBackStep(step: Step, selectedChoice: SetupChoice | null): Step {
  if (step === 'type') return 'details'
  if (step === 'compose' && selectedChoice === 'repository') return 'repository'
  return 'type'
}

/** Simple-application repository drafts skip YAML and open on the overview. */
function isRepositorySimpleAppDraft(
  choice: SetupChoice | null,
  builder: RepositoryBuilder | null,
  kind: SimpleAppConfig['kind'],
): boolean {
  return choice === 'repository' && builder === 'simple' && kind === 'web'
}

function composeStepInitialSection(
  repositoryAppDraft: boolean,
  option: SetupTypeOption | null,
): SetupTypeOption['section'] {
  if (repositoryAppDraft) return 'overview'
  return option?.section ?? 'compose'
}

function composeDraftRepositoryId(sourceId: string): string | null {
  return sourceId.length > 0 ? sourceId : null
}

function composeStepSections(repositoryAppDraft: boolean) {
  if (!repositoryAppDraft) return undefined
  return DRAFT_REPOSITORY_APP_TAB_IDS
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
  const [attachedSource, setAttachedSource] = useState<RepositoryRecord | null>(
    null,
  )
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
  const selectedOption = resolveSelectedOption(selectedChoice)

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
  const repositoriesQuery = useRepositories(orgId, { enabled: step === 'repository' })
  /**
   * True while the repository picker's clone-URL lane owns the screen. That
   * lane ends in its own Connect and Back, so the wizard's own footer is
   * hidden rather than stacking a second Back and a Continue that can never
   * be pressed (nothing is picked yet) on top of it.
   */
  const [cloneUrlLaneOpen, setCloneUrlLaneOpen] = useState(false)
  const [builder, setBuilder] = useState<RepositoryBuilder | null>(null)
  const [simpleConfig, setSimpleConfig] = useState<SimpleAppConfig>(() =>
    suggestedSimpleAppConfig(undefined),
  )
  /**
   * True after any manual edit of the Simple form. Suggestions only ever fill
   * a pristine form: a re-read (branch change, refetch) must not overwrite
   * what the operator typed.
   */
  const [simpleConfigTouched, setSimpleConfigTouched] = useState(false)
  const inspection = useRepositoryInspection(
    orgId,
    selectedSourceId,
    repositoryBranch.trim(),
    {
      enabled: sourceInspectionEnabled(step, selectedSourceId),
    },
  )
  const selectedSource = useMemo(
    () =>
      resolveWizardSelectedSource(
        repositoriesQuery.data?.repositories,
        selectedSourceId,
        attachedSource,
      ),
    [repositoriesQuery.data?.repositories, selectedSourceId, attachedSource],
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
  const loadingWorkspaces = [workspacesQuery.isLoading, projectsQuery.isLoading]
    .some(Boolean)

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

  /** Highlights a card; nothing moves until Next commits the choice. */
  const selectType = (option: SetupTypeOption) => {
    setSelectedChoice(option.choice)
    setSelectedCode('')
    setApiError(null)
  }

  /**
   * The seed/clear effects live here, not in `selectType`: they run once per
   * committed choice, so flipping between cards before pressing Next cannot
   * leave `composeDoc` seeded for a card that was only browsed.
   */
  const continueFromType = () => {
    if (!selectedOption) return
    setApiError(null)
    // Leaving the repository card drops the draft it seeded: Compose promises a
    // blank slate, and a service still bound to a repository is not one.
    if (selectedOption.choice !== 'repository' && seededRepositoryKey) {
      setComposeDoc(emptyComposeDocument())
      setSeededRepositoryKey('')
    }
    // Hosting opens on a draft rather than a blank slate: the whole card is
    // "one site, already declared", and making the operator write four lines of
    // `x-turbopanel` by hand would be the opposite of what it offers.
    if (selectedOption.choice === 'hosting') setComposeDoc(seedHostingCompose({}))
    setStep(stepForOption(selectedOption))
  }

  // Preselect what the repository points at, once the read lands. Detection
  // that does not move the selection is decoration; the cards still show every
  // alternative with its evidence, so this is a default, not a decision. The
  // Simple form is prefilled in the same pass, but only while pristine — a
  // re-read must not overwrite what the operator typed.
  useEffect(() => {
    if (step !== 'repository') return
    if (!inspection.isSuccess || !inspection.data) return
    const suggested = suggestedSimpleAppConfig(inspection.data)
    if (!simpleConfigTouched) setSimpleConfig(suggested)
    if (builder !== null) return
    const detected = recommendedLane(
      rankRepositoryLanes(inspection.data.files, inspection.data.entries),
    )
    if (detected === 'compose') setBuilder('compose')
    else if (detected === 'site-php') setBuilder('site-php')
    // `app`, `static`, and "nothing matched" all land on Simple — it is the
    // builder that works for any repository, and the kind segment already
    // reflects what the read found.
    else setBuilder('simple')
  }, [
    step,
    builder,
    simpleConfigTouched,
    inspection.isSuccess,
    inspection.data,
  ])

  const changeSimpleConfig = (patch: Partial<SimpleAppConfig>) => {
    setSimpleConfigTouched(true)
    setSimpleConfig((current) => ({ ...current, ...patch }))
  }

  /** Everything chosen on the repository screen — seed the draft and move on. */
  const continueFromRepository = () => {
    if (!selectedSource || !builder) return
    setApiError(null)
    const lane = laneForBuilder(builder, simpleConfig.kind)
    const seedKey = [
      selectedSource.id,
      repositoryBranch.trim(),
      lane,
      simpleConfig.buildRoot,
      simpleConfig.buildCommand,
      simpleConfig.startCommand,
      simpleConfig.outputDirectory,
    ].join('\u0000')
    if (seedKey !== seededRepositoryKey) {
      setComposeDoc(
        seedForRepositoryLane(
          selectedSource,
          repositoryBranch,
          lane,
          inspection.data,
          simpleConfig,
        ),
      )
      setSeededRepositoryKey(seedKey)
    }
    setStep('compose')
  }

  const goBack = () => {
    setApiError(null)
    setStep(resolveBackStep(step, selectedChoice))
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

  const surfaceError = apiError ?? loadError

  if (step === 'compose') {
    // The App lane's document is synthesized wholesale from the repository
    // binding — nothing in it is worth hand-editing before create, so the
    // draft surface shows the topology diagram alone.
    const repositoryAppDraft = isRepositorySimpleAppDraft(
      selectedChoice,
      builder,
      simpleConfig.kind,
    )
    return (
      <ComposeStep
        orgId={orgId}
        name={displayName}
        description={description}
        workspaceId={pickedWorkspaceId}
        // The Repository card's pick, so the compose surface narrows its Source
        // controls to it before the project exists — the row adopts the same id
        // on create. Empty for every other card, which stays unbound.
        repositoryId={composeDraftRepositoryId(selectedSourceId)}
        compose={composeDoc}
        initialSection={composeStepInitialSection(repositoryAppDraft, selectedOption)}
        sections={composeStepSections(repositoryAppDraft)}
        creating={submitting}
        error={surfaceError}
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
  const hint = wizardHint(step, defaultEnvironmentName, copy.hint)

  return (
    <View style={styles.column}>
      <View style={styles.pageHeader}>
        <Text style={[panelStyles.pageTitle, styles.centeredText]}>
          {title}
        </Text>
        {hint ? (
          <Text style={[panelStyles.pageCopy, styles.centeredText]}>
            {hint}
          </Text>
        ) : null}
      </View>

      <PanelShell>
        {surfaceError ? (
          <Text style={panelStyles.error}>{surfaceError}</Text>
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
            inspection={inspection.data}
            // `isPending`, not `isFetching`: true for the whole gap between a
            // fresh pick and the read landing (data or error), including the
            // one tick before TanStack Query's fetch has actually started —
            // `isFetching` alone would let the form flash ahead of it.
            inspectionLoading={inspection.isPending}
            inspectionError={asError(inspection.error)}
            defaultEnvironmentName={defaultEnvironmentName}
            builder={builder}
            simple={simpleConfig}
            disabled={submitting}
            onSelectSourceId={(sourceId, record) => {
              setSelectedSourceId(sourceId)
              setAttachedSource(record ?? null)
              // A pick — from any lane — unmounts the picker without its own
              // clone-URL-lane effect getting a last word, so the wizard's
              // footer is restored explicitly rather than staying hidden.
              setCloneUrlLaneOpen(false)
              // A different repository is a different read: the detected
              // builder and the prefilled commands all belonged to the
              // previous pick. The read itself starts as soon as this state
              // update makes `sourceInspectionEnabled` true.
              setBuilder(null)
              setSimpleConfig(suggestedSimpleAppConfig(undefined))
              setSimpleConfigTouched(false)
            }}
            onBranchChange={setRepositoryBranch}
            onSelectBuilder={setBuilder}
            onSimpleChange={changeSimpleConfig}
            onCloneUrlLaneChange={setCloneUrlLaneOpen}
          />
        ) : null}

        {step === 'type' ? (
          <ChoiceTileGrid>
            {SETUP_TYPE_OPTIONS.map((option) => (
              <SetupTypeChoiceCard
                key={option.choice}
                option={option}
                selected={selectedChoice === option.choice}
                onPress={() => selectType(option)}
              />
            ))}
          </ChoiceTileGrid>
        ) : null}

        {isCatalogStep(step, selectedOption) ? (
          <CatalogStep
            type={selectedOption.type}
            catalog={catalogQuery.data?.catalog ?? []}
            loading={catalogQuery.isLoading}
            error={asError(catalogQuery.error)?.message ?? null}
            selectedCode={selectedCode}
            disabled={submitting}
            onSelect={setSelectedCode}
          />
        ) : null}

        {/*
          The clone-URL lane ends in its own Connect and Back — stacking the
          wizard's Back/Continue on top read as two Back buttons and a
          Continue that could never be pressed, since nothing is picked yet.
        */}
        {step === 'repository' && cloneUrlLaneOpen ? null : (
          <StepActions
            step={step}
            submitting={submitting}
            canCreate={selectedCode.length > 0}
            canContinue={canContinueFromStep(
              step,
              selectedOption,
              builder,
              selectedSource,
            )}
            onBack={goBack}
            onNext={goToTypeStep}
            onContinue={step === 'type' ? continueFromType : continueFromRepository}
            onCreate={() => {
              void create()
            }}
          />
        )}
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
 * Footer buttons: Next on details and on the type cards, Back everywhere
 * after, Create on the last step. The repository step ends in Continue
 * instead — the compose surface it opens owns the single Create.
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

  if (step === 'type' || step === 'repository') {
    const continueLabel = step === 'type' ? 'Next' : 'Continue'
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
          label={continueLabel}
          variant="primary"
          disabled={!canContinue}
          onPress={onContinue}
          accessibilityLabel={continueLabel}
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
      <Button
        label="Create project"
        busyLabel="Creating…"
        variant="primary"
        busy={submitting}
        disabled={!canCreate}
        onPress={onCreate}
        accessibilityLabel="Create project"
      />
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
