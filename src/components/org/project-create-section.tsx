import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { SystemManagedNotice } from '@/components/org/system-managed-notice'
import { CatalogStep } from '@/components/org/project-create/catalog-step'
import { RepositoryLaneStep } from '@/components/org/project-create/repository-lane-step'
import { ComposeStep } from '@/components/org/project-create/compose-step'
import { DetailsStep } from '@/components/org/project-create/details-step'
import { NewProjectScreen } from '@/components/org/project-create/new-project-screen'
import {
  parseRepositoryCompose,
  projectAccountAlias,
  seedComposeForLane,
  seedHostingCompose,
} from '@/lib/project-create/repository-seed'
import { builderForLane, laneForBuilder } from '@/lib/project-create/lane-builder'
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
import {
  afterCreateHref,
  moreWaysOpenFor,
  primaryActionForChoice,
} from '@/lib/project-create/new-project-flow'
import { useDebouncedValue } from '@/lib/use-debounced-value'
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
import { SectionHeading } from '@/components/ui/v4'
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
import { useOrgProjectFormDefaults } from '@/lib/org-project-settings'
import type { RepositoryInspection, RepositoryRecord } from '@/lib/instance-api'
import { userWorkspaces } from '@/lib/system-inventory'
import { spacing } from '@/lib/theme'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'
import { userErrorMessage } from '@/lib/user-error'

/**
 * Wizard position. `setup` is the one new-project screen (name, workspace,
 * where it comes from, and the repository, lane or catalog pick inline).
 * `compose` is the Compose editor that Compose, Service forms and Hosting
 * upload open before Create. Nothing is written until Create.
 */
type Step = 'setup' | 'compose'

function resolveScopedWorkspaceId(
  paramWorkspaceId: string | string[] | undefined,
  scopeId: string | undefined
): string | undefined {
  if (typeof paramWorkspaceId === 'string' && paramWorkspaceId) {
    return paramWorkspaceId
  }
  if (scopeId && scopeId !== ALL_WORKSPACES_SCOPE) {
    return scopeId
  }
  return undefined
}

function resolveLoadError(workspacesError: unknown, projectsError: unknown): string | null {
  if (workspacesError instanceof Error) return userErrorMessage(workspacesError, '')
  if (projectsError instanceof Error) return userErrorMessage(projectsError, '')
  return null
}

/**
 * `?type=managed` from the managed CTAs picks a card up front. Accepts either
 * a card id (`services`, `repository`) or a project type (`docker-compose`); a
 * bare project type resolves to the first card offering it.
 *
 * Card ids are matched first and separately. Four cards are `docker-compose`,
 * and a bare `?type=docker-compose` has always meant the blank YAML slate —
 * resolving it by card order alone would let whichever compose card happens
 * to sit first quietly take over every existing link.
 */
function parsePreselectedChoice(value: string | string[] | undefined): SetupChoice | null {
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

function asError(error: unknown): Error | null {
  return error instanceof Error ? error : null
}

function isCatalogOption(option: SetupTypeOption | null): option is SetupTypeOption & {
  type: Exclude<SetupTypeOption['type'], 'docker-compose'>
} {
  return option != null && option.type !== 'docker-compose'
}

/**
 * How long the production branch field must sit still before it is read.
 * Every read is a provider round-trip or a clone on a connected server, and
 * a half-typed name ("l" on the way to "live") only ever answers "no such
 * branch". Leaving the field reads at once.
 */
const BRANCH_READ_DEBOUNCE_MS = 500

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
  projectName: string
): ComposeDocument {
  const files = inspection?.files ?? []
  const composePath = detectedComposePath(files)
  const composeFile = files.find((file) => file.path === composePath && file.found)
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
    principalAlias: projectAccountAlias(projectName),
    ...(repositoryCompose ? { repositoryCompose } : {}),
    ...(root ? { root } : {}),
    simple: {
      buildCommand: simple.buildCommand,
      startCommand: simple.startCommand,
      subdirectory: simple.buildRoot,
      nodeVersion: simple.nodeVersion,
    },
  })
}

/** The Compose editor opens on the tab the card promised. */
function composeStepInitialSection(option: SetupTypeOption | null): SetupTypeOption['section'] {
  return option?.section ?? 'compose'
}

/**
 * Create-project screen, then (for Compose, Service forms and Hosting upload)
 * the Compose editor. The project, its workspace and its environment are
 * only written on Create, so backing out of a mis-clicked card leaves no
 * half-made project to clean up.
 */
export function ProjectCreateSection({ orgId }: Readonly<{ orgId: string }>) {
  return <ProjectCreateWizard orgId={orgId} />
}

/** Keeps the workspace mode and pick in step with what loaded and the URL scope. */
function useWorkspaceSelectionDefaults({
  workspaces,
  loadingWorkspaces,
  scopedWorkspaceId,
  allowedWorkspaceIds,
  pickedWorkspaceId,
  setWorkspaceMode,
  setPickedWorkspaceId,
}: Readonly<{
  workspaces: readonly { id: string }[]
  loadingWorkspaces: boolean
  scopedWorkspaceId: string | undefined
  allowedWorkspaceIds: string[]
  pickedWorkspaceId: string
  setWorkspaceMode: (mode: WorkspaceMode) => void
  setPickedWorkspaceId: (id: string) => void
}>) {
  useEffect(() => {
    if (workspaces.length === 0 && !loadingWorkspaces) {
      setWorkspaceMode('new')
    }
  }, [workspaces.length, loadingWorkspaces, setWorkspaceMode])

  useEffect(() => {
    if (!scopedWorkspaceId || loadingWorkspaces) return
    if (!allowedWorkspaceIds.includes(scopedWorkspaceId)) {
      setPickedWorkspaceId('')
      return
    }
    setWorkspaceMode('existing')
    setPickedWorkspaceId(scopedWorkspaceId)
  }, [
    scopedWorkspaceId,
    loadingWorkspaces,
    allowedWorkspaceIds,
    setWorkspaceMode,
    setPickedWorkspaceId,
  ])

  useEffect(() => {
    if (pickedWorkspaceId) return
    if (scopedWorkspaceId && allowedWorkspaceIds.includes(scopedWorkspaceId)) {
      return
    }
    if (workspaces.length === 1) {
      setPickedWorkspaceId(workspaces[0]?.id ?? '')
    }
  }, [workspaces, pickedWorkspaceId, scopedWorkspaceId, allowedWorkspaceIds, setPickedWorkspaceId])
}

function ProjectCreateWizard({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const params = useLocalSearchParams<{ workspaceId?: string; type?: string }>()
  const workspaceScope = useOptionalWorkspaceScope()
  const { defaultEnvironmentName } = useOrgDefaultEnvironmentName(orgId)
  const { openWorkspaceSectionByDefault } = useOrgProjectFormDefaults(orgId)

  const workspacesQuery = useWorkspaces(orgId)
  const projectsQuery = useProjects(orgId)
  const createWorkspace = useCreateWorkspace(orgId)
  const createProject = useCreateProject(orgId)

  const [step, setStep] = useState<Step>('setup')
  /** A `?type=` link picks its card up front; every card stays switchable. */
  const [selectedChoice, setSelectedChoice] = useState<SetupChoice | null>(() =>
    parsePreselectedChoice(params.type)
  )
  const [moreOpen, setMoreOpen] = useState(() => moreWaysOpenFor(selectedChoice))
  const [selectedCode, setSelectedCode] = useState('')
  /** Repository card: the picked source id and ref, until they seed the draft. */
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [attachedSource, setAttachedSource] = useState<RepositoryRecord | null>(null)
  const [repositoryBranch, setRepositoryBranch] = useState('')
  /**
   * The card the Compose editor's draft was seeded for. Coming back to this
   * screen and continuing with the same card keeps whatever was edited there.
   */
  const [seededChoice, setSeededChoice] = useState<SetupChoice | null>(null)
  /** Seed document handed to the editor; edits come back via onDraftChange. */
  const [composeDoc, setComposeDoc] = useState<ComposeDocument>(() => emptyComposeDocument())
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('existing')
  const [pickedWorkspaceId, setPickedWorkspaceId] = useState('')
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [newWorkspaceNameOverridden, setNewWorkspaceNameOverridden] = useState(false)
  /**
   * Workspace already created by a Create press whose project insert then
   * failed — reused on retry so a second press does not collide with the
   * workspace the first one left behind.
   */
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)

  const selectedOption = selectedChoice ? (setupOptionForChoice(selectedChoice) ?? null) : null
  const repositoryPicked = selectedChoice === 'repository'

  const catalogQuery = useProjectCatalog(orgId, {
    enabled: isCatalogOption(selectedOption),
  })

  /**
   * Same query the repository section renders from — one key, one cache
   * entry, so holding it here costs no extra fetch. Only the id lives in
   * wizard state and the record is resolved from *this* list, so a repository
   * disconnected while the screen was open disables Continue instead of
   * seeding a project bound to a source the org no longer has.
   */
  const repositoriesQuery = useRepositories(orgId, { enabled: repositoryPicked })
  /**
   * True while the repository picker's clone-URL lane owns the screen. That
   * lane ends in its own Connect and Back, so the screen's own footer is
   * hidden rather than stacking a Cancel and a Continue that can never be
   * pressed (nothing is picked yet) under it.
   */
  const [cloneUrlLaneOpen, setCloneUrlLaneOpen] = useState(false)
  const [builder, setBuilder] = useState<RepositoryBuilder | null>(null)
  const [simpleConfig, setSimpleConfig] = useState<SimpleAppConfig>(() =>
    suggestedSimpleAppConfig(undefined)
  )
  /**
   * True after any manual edit of the build settings. Suggestions only ever
   * fill a pristine form: a re-read (branch change, refetch) must not
   * overwrite what the operator typed.
   */
  const [simpleConfigTouched, setSimpleConfigTouched] = useState(false)
  // The Node version is applied from the read unless the operator changed that field.
  const [nodeVersionTouched, setNodeVersionTouched] = useState(false)
  const typedBranch = repositoryBranch.trim()
  const [settledBranch, settleBranch] = useDebouncedValue(typedBranch, BRANCH_READ_DEBOUNCE_MS)
  /**
   * The field is ahead of the last read: Continue waits for it, or the project
   * would be seeded from a read of a branch the operator has since changed.
   */
  const branchSettling = settledBranch !== typedBranch
  // The read fires the moment a repository is picked, keyed by branch, so
  // editing the branch afterwards re-reads at the new ref.
  const inspection = useRepositoryInspection(orgId, selectedSourceId, settledBranch, {
    enabled: repositoryPicked && selectedSourceId.length > 0,
  })
  const selectedSource = useMemo(
    () =>
      resolveWizardSelectedSource(
        repositoriesQuery.data?.repositories,
        selectedSourceId,
        attachedSource
      ),
    [repositoriesQuery.data?.repositories, selectedSourceId, attachedSource]
  )

  const workspaces = useMemo(
    () =>
      [...userWorkspaces(workspacesQuery.data?.workspaces ?? [])].sort((a, b) =>
        (a.name ?? a.id).localeCompare(b.name ?? b.id)
      ),
    [workspacesQuery.data?.workspaces]
  )
  const allowedWorkspaceIds = useMemo(
    () => workspaces.map((workspace) => workspace.id),
    [workspaces]
  )
  const projectNames = useMemo(
    () => (projectsQuery.data?.projects ?? []).map((row) => row.name),
    [projectsQuery.data?.projects]
  )
  const loadingWorkspaces = [workspacesQuery.isLoading, projectsQuery.isLoading].some(Boolean)

  const scopedWorkspaceId = resolveScopedWorkspaceId(params.workspaceId, workspaceScope?.scopeId)

  /** True when URL/scope pointed at system (or unknown) workspace — not creatable. */
  const scopedWorkspaceBlocked = useMemo(() => {
    if (!scopedWorkspaceId || loadingWorkspaces) return false
    return !allowedWorkspaceIds.includes(scopedWorkspaceId)
  }, [scopedWorkspaceId, loadingWorkspaces, allowedWorkspaceIds])

  const loadError = resolveLoadError(workspacesQuery.error, projectsQuery.error)

  useWorkspaceSelectionDefaults({
    workspaces,
    loadingWorkspaces,
    scopedWorkspaceId,
    allowedWorkspaceIds,
    pickedWorkspaceId,
    setWorkspaceMode,
    setPickedWorkspaceId,
  })

  const submitting = createWorkspace.isPending || createProject.isPending
  const trimmedProjectName = displayName.trim()
  const mirroredWorkspaceName = resolveMirroredWorkspaceName(
    trimmedProjectName,
    newWorkspaceName,
    newWorkspaceNameOverridden
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

  /** Checks the name, description and workspace; false (with field errors) when one is wrong. */
  const validateBasics = (): boolean => {
    const errors = validateProjectCreateFields({
      name: trimmedProjectName,
      description,
      environmentName: '',
      workspaceMode,
      pickedWorkspaceId,
      allowedWorkspaceIds,
      newWorkspaceName,
      newWorkspaceNameOverridden,
      projectNames,
      workspaceNames: workspaces.map((workspace) => workspace.name),
    })
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  /** Picks a card; a different card drops the catalog pick that belonged to the last one. */
  const selectChoice = (choice: SetupChoice) => {
    if (choice !== selectedChoice) setSelectedCode('')
    setSelectedChoice(choice)
    setApiError(null)
  }

  // Preselect what the repository points at, once the read lands. Detection
  // that does not move the selection is decoration; the lanes still show every
  // alternative with its evidence, so this is a default, not a decision. The
  // build settings are prefilled in the same pass, but only while pristine — a
  // re-read must not overwrite what the operator typed.
  useEffect(() => {
    if (!repositoryPicked) return
    if (!inspection.isSuccess || !inspection.data) return
    const suggested = suggestedSimpleAppConfig(inspection.data)
    if (!simpleConfigTouched) setSimpleConfig(suggested)
    else if (!nodeVersionTouched) {
      setSimpleConfig((current) => ({ ...current, nodeVersion: suggested.nodeVersion }))
    }
    if (builder !== null) return
    const detected = recommendedLane(
      rankRepositoryLanes(inspection.data.files, inspection.data.entries)
    )
    if (detected === 'compose') setBuilder('compose')
    else if (detected === 'site-php') setBuilder('site-php')
    // `app`, `static`, and "nothing matched" all land on Simple — it is the
    // builder that works for any repository, and the kind segment already
    // reflects what the read found.
    else setBuilder('simple')
  }, [
    repositoryPicked,
    builder,
    simpleConfigTouched,
    nodeVersionTouched,
    inspection.isSuccess,
    inspection.data,
  ])

  const laneCandidates = useMemo(
    () => rankRepositoryLanes(inspection.data?.files ?? [], inspection.data?.entries ?? []),
    [inspection.data]
  )

  const changeSimpleConfig = (patch: Partial<SimpleAppConfig>) => {
    setSimpleConfigTouched(true)
    if (patch.nodeVersion !== undefined) setNodeVersionTouched(true)
    setSimpleConfig((current) => ({ ...current, ...patch }))
  }

  /** "Run it as" answered: set the builder, and Simple's kind if it applies. */
  const selectLane = (lane: RepositoryLane) => {
    const next = builderForLane(lane)
    setBuilder(next.builder)
    if (next.kind) {
      const kind = next.kind
      setSimpleConfig((current) => ({ ...current, kind }))
    }
  }

  /** Resolves the workspace, creating it first when the operator asked for a new one. */
  const resolveWorkspaceId = async (): Promise<string | null> => {
    if (workspaceMode !== 'new') {
      if (!allowedWorkspaceIds.includes(pickedWorkspaceId)) {
        setFieldErrors({ workspaceId: 'Select a user workspace.' })
        setStep('setup')
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
   * Commits the project. `drafted` is the compose to create with (the
   * editor's draft, or the repository seed); catalog types pass nothing and
   * create straight from the pick.
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
        selectedType === 'template' ? 'Choose a template first.' : 'Choose a database engine first.'
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

    router.replace(afterCreateHref(orgId, result.value.id, selectedType) as Href)
  }

  /** Compose, Service forms and Hosting upload: seed the editor once per card, then open it. */
  const openComposeEditor = () => {
    if (!selectedChoice) return
    if (seededChoice !== selectedChoice) {
      // Hosting opens on a draft rather than a blank slate: the whole card is
      // "one site, already declared", and making the operator write four
      // lines of `x-turbopanel` by hand would be the opposite of what it offers.
      setComposeDoc(selectedChoice === 'hosting' ? seedHostingCompose({}) : emptyComposeDocument())
      setSeededChoice(selectedChoice)
    }
    setStep('compose')
  }

  /** Everything the repository needs is on this screen: seed the project and create it. */
  const createFromRepository = () => {
    if (!selectedSource || !builder) return
    const lane = laneForBuilder(builder, simpleConfig.kind)
    void create(
      seedForRepositoryLane(
        selectedSource,
        repositoryBranch,
        lane,
        inspection.data,
        simpleConfig,
        trimmedProjectName
      )
    )
  }

  const primary = primaryActionForChoice(selectedChoice)
  const repositoryReady =
    selectedSource != null && builder != null && !inspection.isPending && !branchSettling
  const primaryReady: Record<NonNullable<typeof primary.kind>, boolean> = {
    'create-from-repository': repositoryReady,
    'open-compose': true,
    'create-from-catalog': selectedCode.length > 0,
  }

  const pressPrimary = () => {
    setApiError(null)
    if (!validateBasics()) return
    if (primary.kind === 'create-from-repository') createFromRepository()
    else if (primary.kind === 'open-compose') openComposeEditor()
    else if (primary.kind === 'create-from-catalog') void create()
  }

  const surfaceError = apiError ?? loadError

  if (step === 'compose') {
    return (
      <ComposeStep
        orgId={orgId}
        name={displayName}
        description={description}
        workspaceId={pickedWorkspaceId}
        repositoryId={null}
        compose={composeDoc}
        initialSection={composeStepInitialSection(selectedOption)}
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
        onBack={() => {
          setApiError(null)
          setStep('setup')
        }}
      />
    )
  }

  const repositoryDetail = repositoryPicked ? (
    <>
      <RepositoryStep
        orgId={orgId}
        selectedSourceId={selectedSourceId}
        branch={repositoryBranch}
        inspectedBranch={settledBranch}
        inspection={inspection.data}
        // `isPending`, not `isFetching`: true for the whole gap between a
        // fresh pick and the read landing (data or error), including the one
        // tick before TanStack Query's fetch has actually started.
        inspectionLoading={inspection.isPending}
        inspectionError={asError(inspection.error)}
        defaultEnvironmentName={defaultEnvironmentName}
        disabled={submitting}
        onSelectSourceId={(sourceId, record) => {
          setSelectedSourceId(sourceId)
          setAttachedSource(record ?? null)
          // A pick — from any lane — unmounts the picker without its own
          // clone-URL-lane effect getting a last word, so the footer is
          // restored explicitly rather than staying hidden.
          setCloneUrlLaneOpen(false)
          // A different repository is a different read: the detected lane
          // and the prefilled commands all belonged to the previous pick.
          setBuilder(null)
          setSimpleConfig(suggestedSimpleAppConfig(undefined))
          setSimpleConfigTouched(false)
          setNodeVersionTouched(false)
        }}
        onBranchChange={setRepositoryBranch}
        onBranchBlur={settleBranch}
        onCloneUrlLaneChange={setCloneUrlLaneOpen}
      />
      {selectedSourceId && !inspection.isPending ? (
        <View style={styles.lane}>
          <SectionHeading title="Run it as" />
          <RepositoryLaneStep
            candidates={laneCandidates}
            selectedLane={builder ? laneForBuilder(builder, simpleConfig.kind) : null}
            inspection={inspection.data}
            simple={simpleConfig}
            disabled={submitting}
            onSelectLane={selectLane}
            onSimpleChange={changeSimpleConfig}
          />
        </View>
      ) : null}
    </>
  ) : null

  const catalogDetail = isCatalogOption(selectedOption) ? (
    <View style={styles.lane}>
      <SectionHeading
        title={selectedOption.type === 'template' ? 'Choose a template' : 'Choose a database'}
      />
      <CatalogStep
        type={selectedOption.type}
        catalog={catalogQuery.data?.catalog ?? []}
        loading={catalogQuery.isLoading}
        error={asError(catalogQuery.error)?.message ?? null}
        selectedCode={selectedCode}
        disabled={submitting}
        onSelect={setSelectedCode}
      />
    </View>
  ) : null

  return (
    <NewProjectScreen
      notice={
        scopedWorkspaceBlocked ? (
          <SystemManagedNotice
            title="Platform workspace"
            description="Projects cannot be created in the System workspace. Choose a user workspace below."
            onBack={() => {
              router.replace(`/${orgId}/projects` as Href)
            }}
            backLabel="Back to projects"
          />
        ) : null
      }
      error={surfaceError}
      basics={
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
          openWorkspaceByDefault={openWorkspaceSectionByDefault}
        />
      }
      selectedChoice={selectedChoice}
      moreOpen={moreOpen}
      onToggleMore={() => {
        setMoreOpen((open) => !open)
      }}
      onSelectChoice={selectChoice}
      detail={repositoryDetail ?? catalogDetail}
      footerHidden={repositoryPicked && cloneUrlLaneOpen}
      primaryLabel={primary.label}
      primaryDisabled={primary.kind === null || !primaryReady[primary.kind]}
      busy={submitting}
      onPrimary={pressPrimary}
      onCancel={() => {
        router.replace(`/${orgId}/projects` as Href)
      }}
    />
  )
}

const styles = StyleSheet.create({
  lane: { gap: spacing.sm },
})
