import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  composeDraftScopeKey,
  composeFullYaml,
  isComposeDraftDirty,
  reconcileComposeDraft,
  resolveComposeDraftSnapshot,
  seedComposeDraftFromDocument,
  useComposeDraftStore,
} from '@/components/org/project/compose-draft-context'
import {
  useProjectContext,
  type ProjectDraft,
} from '@/components/org/project/project-context'
import { ComposeScopeBanner } from '@/components/org/project/compose-scope-banner'
import { ComposeInheritedPanel } from '@/components/org/project/compose-inherited-panel'
import {
  ComposeHostingTab,
  ComposeServersTab,
  ComposeSettingsTab,
  ComposeStorageTab,
} from '@/components/org/project/compose-resource-tabs'
import {
  ComposeSavedView,
  type OverviewComposeSource,
} from '@/components/org/project/compose-saved-view'
import type { InventoryStripItem } from '@/components/org/project/compose-inventory-strip'
import {
  ComposeServersIcon,
  ComposeVisualIcon,
  ComposeStorageIcon,
} from '@/components/org/compose-view-icons'
import {
  BindingResourceIcon,
  EnvironmentResourceIcon,
  NetworkResourceIcon,
  VolumeResourceIcon,
} from '@/components/icons/resource-icons'
import { OverviewEnvironmentsPanel } from '@/components/org/project/overview-environments-panel'
import { ComposeBasePanel } from '@/components/org/compose-base-panel'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import type {
  ComposeDocFacts,
  ComposeDocServiceFacts,
} from '@/components/org/project/compose-document-view'
import {
  ComposeDraftActionButtons,
  ComposeEditorChrome,
} from '@/components/org/compose-editor-section'
import { ComposeSurfaceNav } from '@/components/org/project/compose-surface-nav'
import {
  usePersistEnvironmentCompose,
  usePersistProjectCompose,
} from '@/components/org/compose-persistence'
import { ServiceReleasesPanel } from '@/components/org/project/service-releases-panel'
import { useServiceReleases } from '@/lib/queries/releases'
import { SystemProjectOverviewPanel } from '@/components/org/project/system-project-overview-panel'
import {
  blockingComposeLintIssues,
  composeDocumentToYaml,
  isBlankComposeData,
  lintComposeYaml,
  mergeComposeOverlay,
  normalizeCompose,
  resolveComposeOverlayState,
  setComposeEditorView,
  stripComposePlacement,
  summarizeComposeDocument,
  type ComposeDocument,
  type ComposeEditorView,
} from '@/lib/compose'
import {
  type ContainerRecord,
  type EnvironmentRecord,
  type HostingRecord,
  type ProjectRecord,
  type ReleaseRecord,
  type ServiceRecord,
  type StorageRecord,
} from '@/lib/instance-api'
import {
  parseComposeEditView,
  parseComposeProjectTab,
  projectComposeSectionHref,
  type ComposeProjectTabId,
} from '@/lib/project-navigation'
import { orEmptyArray } from '@/lib/or-empty-array'
import {
  useContainersByServices,
  useHostingsByServices,
  useOrgServers,
  useServices,
} from '@/lib/queries'
import {
  serverDisplayName,
  type ServerNameSource,
} from '@/lib/resource-labels'
import { useEnvironmentBindings } from '@/lib/queries/bindings'
import { useStorage } from '@/lib/queries/storage'
import { isActiveContainerStatus, serviceStatusTone } from '@/lib/container-status'
import {
  countDistinctProjectServers,
  resolveEffectiveServerId,
} from '@/lib/project-options'
import { spacing } from '@/lib/theme'

/** Stable empty list so the facts memo does not thrash on every render. */
const EMPTY_STORAGE: readonly StorageRecord[] = []

/** Draft section tab → the editor view the compose surface renders. */
function draftSectionView(
  section: ProjectDraft['section'],
): ComposeEditorView | null {
  if (section === 'compose') return 'editor'
  // Services lens — the compose services as a list.
  if (section === 'overview') return 'visual'
  return null
}

function resolveComposeActiveTab(
  draft: ProjectDraft | null,
  pathname: string,
  projectId: string,
): ComposeProjectTabId {
  if (draft) return draft.section
  return parseComposeProjectTab(pathname, projectId)
}

/**
 * Which lens the surface renders: `visual` is the Services lens (the service
 * list), `editor` is Compose (YAML), and `null` is Overview (the topology
 * diagram, which is a read-only view rather than an editor).
 */
function resolveComposeSectionView(
  draft: ProjectDraft | null,
  pathname: string,
  projectId: string,
): ComposeEditorView | null {
  if (draft) return draftSectionView(draft.section)
  const tab = parseComposeProjectTab(pathname, projectId)
  if (tab === 'map') return null
  if (tab === 'compose') return 'editor'
  if (tab === 'overview') return 'visual'
  return parseComposeEditView(pathname, projectId)
}

function isComposeServicesQueryEnabled(
  draft: ProjectDraft | null,
  selectedEnvironmentId: string | null,
  baseSelected: boolean,
  projectAllowsMutations: boolean,
): boolean {
  return (
    !draft &&
    Boolean(selectedEnvironmentId) &&
    !baseSelected &&
    projectAllowsMutations
  )
}

function isComposeServicesLoading(
  queryEnabled: boolean,
  servicesLoading: boolean,
  serviceCount: number,
  containersLoading: boolean,
): boolean {
  if (!queryEnabled) return false
  if (servicesLoading) return true
  return serviceCount > 0 && containersLoading
}

/**
 * Hosting / Servers / Storage / Settings are dedicated surface tabs;
 * everything else is Overview · Compose · Services.
 */
function composeSurfaceBody(
  activeTab: ComposeProjectTabId,
  overviewBody: ReactNode,
): ReactNode {
  if (activeTab === 'hosting') return <ComposeHostingTab />
  if (activeTab === 'servers') return <ComposeServersTab />
  if (activeTab === 'storage') return <ComposeStorageTab />
  if (activeTab === 'settings') return <ComposeSettingsTab />
  return overviewBody
}

function inventoryItem(
  key: string,
  icon: InventoryStripItem['icon'],
  value: number,
  noun: string,
  pluralNoun?: string,
): InventoryStripItem {
  return pluralNoun
    ? { key, icon, value, noun, pluralNoun }
    : { key, icon, value, noun }
}

/** Project scope counts project-wide storage; environment scope narrows to it. */
function resolveStorageFilter(
  baseSelected: boolean,
  projectId: string,
  selectedEnvironmentId: string | null,
): { projectId: string } | { environmentId: string } | null {
  if (baseSelected) return { projectId }
  if (selectedEnvironmentId) return { environmentId: selectedEnvironmentId }
  return null
}

/** Prefer reconciled draft when Overview is showing Proposed unsaved changes. */
function overviewComposeDocument(
  isDirty: boolean,
  source: OverviewComposeSource,
  snapshot: ReturnType<typeof resolveComposeDraftSnapshot>,
  saved: unknown,
): unknown {
  if (!isDirty || source !== 'proposed') return saved
  return reconcileComposeDraft(snapshot) ?? snapshot.draft
}

function overviewSaveTrailing(
  isDirty: boolean,
  saving: boolean,
  onSave: () => void,
  onDiscard: () => void,
  draft?: ProjectDraft | null,
): ReactNode {
  // The create wizard commits from its own footer button, so the draft surface
  // shows no Save / Discard in the toolbar at all.
  if (draft) return undefined
  if (!isDirty && !saving) return undefined
  return (
    <ComposeDraftActionButtons
      saving={saving}
      canSave={!saving && isDirty}
      onSave={onSave}
      onDiscard={onDiscard}
    />
  )
}

function ComposeEditorPanel({
  document,
  onSave,
  saving,
  editView,
  sessionKey,
  hideSave = false,
  onDraftChange,
  documentFacts,
  onOpenScopeConfig,
  renderHostingEditor,
  renderReleasesPanel,
}: Readonly<{
  document: unknown
  onSave: (compose: ComposeDocument) => Promise<void>
  saving: boolean
  editView: ComposeEditorView
  sessionKey: string
  hideSave?: boolean
  onDraftChange?: (compose: ComposeDocument | null) => void
  documentFacts?: ComposeDocFacts
  onOpenScopeConfig?: () => void
  renderHostingEditor?: (composeServiceName: string) => ReactNode
  renderReleasesPanel?: (composeServiceName: string) => ReactNode
}>) {
  return (
    <ComposeBasePanel
      document={document}
      onSave={onSave}
      saving={saving}
      defaultEditorView={editView}
      view={editView}
      sessionKey={sessionKey}
      hideHeader
      showSectionTabs
      {...(onDraftChange ? { onDraftChange } : {})}
      hideSave={hideSave}
      // `visual` is the Services lens on the project surface.
      visualMode="document"
      {...(documentFacts ? { documentFacts } : {})}
      {...(onOpenScopeConfig ? { onOpenScopeConfig } : {})}
      {...(renderHostingEditor ? { renderHostingEditor } : {})}
      {...(renderReleasesPanel ? { renderReleasesPanel } : {})}
    />
  )
}

function ProjectOverviewCompose({
  projectId,
  orgId,
  environmentsCount,
  projectServerCount,
  storageCount,
  services,
  containersByService,
  isDirty,
  draft,
  overviewSource,
  onOverviewSourceChange,
  proposedDoc,
  saving,
  onSave,
  onDiscard,
}: Readonly<{
  projectId: string
  orgId: string
  environmentsCount: number
  projectServerCount: number
  storageCount: number
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  isDirty: boolean
  draft: ProjectDraft | null
  overviewSource: OverviewComposeSource
  onOverviewSourceChange: (source: OverviewComposeSource) => void
  proposedDoc: unknown
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}>) {
  const projectSummary = summarizeComposeDocument(proposedDoc)
  const inventory: InventoryStripItem[] = [
    inventoryItem(
      'environments',
      EnvironmentResourceIcon,
      environmentsCount,
      'environment',
    ),
    inventoryItem('servers', ComposeServersIcon, projectServerCount, 'server'),
    inventoryItem(
      'services',
      ComposeVisualIcon,
      projectSummary.services,
      'service',
    ),
    inventoryItem(
      'networks',
      NetworkResourceIcon,
      projectSummary.networks,
      'network',
    ),
    inventoryItem(
      'volumes',
      VolumeResourceIcon,
      projectSummary.volumes,
      'volume',
    ),
    inventoryItem(
      'storage',
      ComposeStorageIcon,
      storageCount,
      'storage volume',
      'storage volumes',
    ),
  ]
  return (
    <ComposeSavedView
      document={proposedDoc}
      inventory={inventory}
      orgId={orgId}
      projectId={projectId}
      services={services}
      containersByService={containersByService}
      showServiceStatus={false}
      draftSource={isDirty ? overviewSource : undefined}
      onDraftSourceChange={isDirty ? onOverviewSourceChange : undefined}
      toolbarTrailing={overviewSaveTrailing(
        isDirty,
        saving,
        onSave,
        onDiscard,
        draft,
      )}
    />
  )
}

function EnvironmentOverviewCompose({
  project,
  selectedEnvironment,
  projectId,
  orgId,
  storageCount,
  bindingsCount,
  services,
  containersByService,
  isStarted,
  isDirty,
  overviewSource,
  onOverviewSourceChange,
  liveSnapshot,
  saving,
  onSave,
  onDiscard,
}: Readonly<{
  project: ProjectRecord
  selectedEnvironment: EnvironmentRecord
  projectId: string
  orgId: string
  storageCount: number
  bindingsCount: number
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  isStarted: boolean
  isDirty: boolean
  overviewSource: OverviewComposeSource
  onOverviewSourceChange: (source: OverviewComposeSource) => void
  liveSnapshot: ReturnType<typeof resolveComposeDraftSnapshot>
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}>) {
  const overlayState = resolveComposeOverlayState(
    selectedEnvironment.options?.compose,
  )
  const proposedOverlay = overviewComposeDocument(
    isDirty,
    overviewSource,
    liveSnapshot,
    selectedEnvironment.options?.compose,
  )
  const merged = mergeComposeOverlay(project.options?.compose, proposedOverlay)
  const effectiveServerId = resolveEffectiveServerId(
    selectedEnvironment.serverId,
    project.options?.defaultServerId,
  )
  const showSavedOrClean = overviewSource === 'saved' || !isDirty
  const inheriting = showSavedOrClean
    ? overlayState.blank
    : isBlankComposeData(normalizeCompose(proposedOverlay).data)
  const envSummary = summarizeComposeDocument(merged)
  const inventory: InventoryStripItem[] = [
    inventoryItem(
      'servers',
      ComposeServersIcon,
      effectiveServerId ? 1 : 0,
      'server',
    ),
    inventoryItem('services', ComposeVisualIcon, envSummary.services, 'service'),
    inventoryItem(
      'networks',
      NetworkResourceIcon,
      envSummary.networks,
      'network',
    ),
    inventoryItem('volumes', VolumeResourceIcon, envSummary.volumes, 'volume'),
    inventoryItem(
      'storage',
      ComposeStorageIcon,
      storageCount,
      'storage volume',
      'storage volumes',
    ),
    inventoryItem('bindings', BindingResourceIcon, bindingsCount, 'binding'),
  ]
  return (
    <ComposeSavedView
      document={inheriting ? merged : proposedOverlay}
      summaryDocument={merged}
      inventory={inventory}
      inheritedCaption={inheriting ? 'Inheriting project compose' : null}
      orgId={orgId}
      projectId={projectId}
      services={services}
      containersByService={containersByService}
      showServiceStatus={isStarted}
      draftSource={isDirty ? overviewSource : undefined}
      onDraftSourceChange={isDirty ? onOverviewSourceChange : undefined}
      toolbarTrailing={overviewSaveTrailing(isDirty, saving, onSave, onDiscard)}
    />
  )
}

function ServicesPanelBody({
  baseSelected,
  project,
  projectId,
  orgId,
  selectedEnvironment,
  environmentsCount,
  projectServerCount,
  storageCount,
  bindingsCount,
  services,
  containersByService,
  loading,
  saving,
  isStarted,
  sectionView,
  draft,
  canMutate,
  documentFacts,
  onOpenScopeConfig,
  onSaveProjectCompose,
  onSaveEnvironmentCompose,
}: Readonly<{
  baseSelected: boolean
  project: ProjectRecord
  projectId: string
  orgId: string
  selectedEnvironment: EnvironmentRecord | null
  /** Project's environment count — Overview Base inventory only. */
  environmentsCount: number
  /** Distinct servers placing this project's environments — Overview Base inventory only. */
  projectServerCount: number
  storageCount: number
  bindingsCount: number
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  loading: boolean
  saving: boolean
  isStarted: boolean
  /** null = Overview lens (diagram); `visual` = Services, `editor` = Compose. */
  sectionView: ComposeEditorView | null
  draft: ProjectDraft | null
  canMutate: boolean
  documentFacts: ComposeDocFacts
  onOpenScopeConfig: () => void
  onSaveProjectCompose: (compose: ComposeDocument) => Promise<void>
  onSaveEnvironmentCompose: (compose: ComposeDocument) => Promise<void>
}>): ReactNode {
  const draftStore = useComposeDraftStore()
  const editing = sectionView != null
  const editView = sectionView ?? 'editor'
  const scopeKey = composeDraftScopeKey(
    projectId,
    baseSelected ? null : selectedEnvironment?.id ?? null,
  )
  const savedDocument = baseSelected
    ? project.options?.compose
    : selectedEnvironment?.options?.compose
  const liveSnapshot = resolveComposeDraftSnapshot(
    draftStore,
    scopeKey,
    savedDocument,
  )
  const isDirty = isComposeDraftDirty(liveSnapshot)
  const [overviewSource, setOverviewSource] =
    useState<OverviewComposeSource>('proposed')
  // Scope key the user chose to start an override in — a blank overlay has
  // nothing to seed the draft store with, so the intent is tracked here.
  const [overrideStartedKey, setOverrideStartedKey] = useState<string | null>(
    null,
  )

  useEffect(() => {
    if (isDirty) {
      setOverviewSource('proposed')
    }
  }, [isDirty, scopeKey])

  // Plain handlers (not useCallback): React Compiler could not preserve manual
  // memoization of this save path (`preserve-manual-memoization` on scopeKey).
  async function saveOverviewDraft(): Promise<void> {
    const snapshot = resolveComposeDraftSnapshot(
      draftStore,
      scopeKey,
      savedDocument,
    )
    const reconciled = reconcileComposeDraft(snapshot)
    if (reconciled == null) return
    const viewForSave: ComposeEditorView =
      editView === 'visual' ? 'visual' : 'editor'
    const next = stripComposePlacement(
      setComposeEditorView(reconciled, viewForSave),
    )
    const blocking = blockingComposeLintIssues(
      lintComposeYaml(composeDocumentToYaml(next)),
    )
    if (blocking.length > 0) return
    if (baseSelected) {
      await onSaveProjectCompose(next)
    } else {
      await onSaveEnvironmentCompose(next)
    }
    const seeded = seedComposeDraftFromDocument(next)
    draftStore.setSnapshot(scopeKey, {
      draft: next,
      yaml: seeded.yaml,
      baselineYaml: composeFullYaml(next),
    })
  }

  function runOverviewSave(): void {
    void saveOverviewDraft()
  }

  function discardOverviewDraft(): void {
    draftStore.setSnapshot(
      scopeKey,
      seedComposeDraftFromDocument(savedDocument),
    )
  }

  if (baseSelected) {
    if (editing) {
      return (
        <ComposeEditorPanel
          document={project.options?.compose}
          onSave={onSaveProjectCompose}
          saving={saving}
          editView={editView}
          sessionKey={scopeKey}
          documentFacts={documentFacts}
          onOpenScopeConfig={onOpenScopeConfig}
          {...(draft
            ? { hideSave: true, onDraftChange: draft.onDraftChange }
            : {})}
        />
      )
    }
    return (
      <ProjectOverviewCompose
        projectId={projectId}
        orgId={orgId}
        environmentsCount={environmentsCount}
        projectServerCount={projectServerCount}
        storageCount={storageCount}
        services={services}
        containersByService={containersByService}
        isDirty={isDirty}
        draft={draft}
        overviewSource={overviewSource}
        onOverviewSourceChange={setOverviewSource}
        proposedDoc={overviewComposeDocument(
          isDirty,
          overviewSource,
          liveSnapshot,
          project.options?.compose,
        )}
        saving={saving}
        onSave={runOverviewSave}
        onDiscard={discardOverviewDraft}
      />
    )
  }

  if (!selectedEnvironment) {
    return (
      <ComposeEditorChrome nav={<ComposeSurfaceNav />}>
        <Text style={orgPanelStyles.muted}>Select an environment.</Text>
      </ComposeEditorChrome>
    )
  }

  if (loading) {
    return (
      <ComposeEditorChrome nav={<ComposeSurfaceNav />}>
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      </ComposeEditorChrome>
    )
  }

  if (editing) {
    const inheriting =
      resolveComposeOverlayState(selectedEnvironment.options?.compose).blank
      && !isDirty
      && overrideStartedKey !== scopeKey
    if (inheriting) {
      return (
        <ComposeInheritedPanel
          view={editView}
          projectCompose={project.options?.compose}
          projectYaml={seedComposeDraftFromDocument(project.options?.compose).yaml}
          canMutate={canMutate}
          onCreateOverride={() => setOverrideStartedKey(scopeKey)}
          onCopyProjectCompose={() => {
            const seeded = seedComposeDraftFromDocument(project.options?.compose)
            draftStore.setSnapshot(scopeKey, {
              draft: seeded.draft,
              yaml: seeded.yaml,
              baselineYaml:
                seedComposeDraftFromDocument(savedDocument).baselineYaml,
            })
            setOverrideStartedKey(scopeKey)
          }}
        />
      )
    }
    return (
      <ComposeEditorPanel
        document={selectedEnvironment.options?.compose}
        onSave={onSaveEnvironmentCompose}
        saving={saving}
        editView={editView}
        sessionKey={scopeKey}
        documentFacts={documentFacts}
        onOpenScopeConfig={onOpenScopeConfig}
        renderHostingEditor={(composeServiceName) => (
          <EnvironmentDetailBody
            orgId={orgId}
            projectId={projectId}
            environmentId={selectedEnvironment.id}
            embedded
            showComposeOverlay={false}
            sections={['hosting']}
            filterServiceNames={[composeServiceName]}
          />
        )}
        // Releases only exist per environment, so the fact is only offered on
        // the environment scope — the project document has no environment to
        // read a release list for.
        renderReleasesPanel={(composeServiceName) => (
          <ServiceReleasesPanel
            orgId={orgId}
            environmentId={selectedEnvironment.id}
            composeServiceName={composeServiceName}
            canManage={canMutate}
            collapsible={false}
          />
        )}
      />
    )
  }

  return (
    <EnvironmentOverviewCompose
      project={project}
      selectedEnvironment={selectedEnvironment}
      projectId={projectId}
      orgId={orgId}
      storageCount={storageCount}
      bindingsCount={bindingsCount}
      services={services}
      containersByService={containersByService}
      isStarted={isStarted}
      isDirty={isDirty}
      overviewSource={overviewSource}
      onOverviewSourceChange={setOverviewSource}
      liveSnapshot={liveSnapshot}
      saving={saving}
      onSave={runOverviewSave}
      onDiscard={discardOverviewDraft}
    />
  )
}

export function ComposeServicesTab() {
  const pathname = usePathname()
  const router = useRouter()
  const {
    orgId,
    projectId,
    project,
    environments,
    selectedEnvironment,
    selectedEnvironmentId,
    baseSelected,
    invalidateEnvironments,
    setError,
    canManage,
    isSystemProject,
    isWorkspaceKindResolved,
    projectAllowsMutations,
    draft,
  } = useProjectContext()
  const projectServerCount = project
    ? countDistinctProjectServers(project, environments)
    : 0
  const storageFilter = resolveStorageFilter(
    baseSelected,
    projectId,
    selectedEnvironmentId,
  )
  const storageQuery = useStorage(orgId, storageFilter ?? { projectId }, {
    enabled: !draft && storageFilter != null,
  })
  const storageCount = storageQuery.data?.storage.length ?? 0
  const bindingsQuery = useEnvironmentBindings(
    orgId,
    selectedEnvironmentId ?? '',
    { enabled: !draft && !baseSelected && Boolean(selectedEnvironmentId) },
  )
  const bindingsCount = bindingsQuery.data?.bindings.length ?? 0
  const persistProjectCompose = usePersistProjectCompose(orgId, projectId)
  const persistEnvironmentCompose = usePersistEnvironmentCompose(
    orgId,
    selectedEnvironmentId ?? '',
  )
  // A draft owns its section in local state — there is no URL to read it from.
  const activeTab = resolveComposeActiveTab(draft, pathname, projectId)
  const sectionView = resolveComposeSectionView(draft, pathname, projectId)

  const servicesEnabled = isComposeServicesQueryEnabled(
    draft,
    selectedEnvironmentId,
    baseSelected,
    projectAllowsMutations,
  )
  const servicesQuery = useServices(orgId, selectedEnvironmentId ?? undefined, {
    enabled: servicesEnabled,
  })
  const services = orEmptyArray(servicesQuery.data?.services)
  const serviceIds = useMemo(
    () => services.map((service) => service.id),
    [services],
  )
  const containersQuery = useContainersByServices(orgId, serviceIds, {
    enabled: servicesEnabled && serviceIds.length > 0,
  })
  const containersByService = containersQuery.containersByService
  const hostingsQuery = useHostingsByServices(orgId, serviceIds, {
    enabled: servicesEnabled && serviceIds.length > 0,
  })
  const loading = isComposeServicesLoading(
    servicesEnabled,
    servicesQuery.isLoading,
    serviceIds.length,
    containersQuery.isLoading,
  )
  const composeSaving =
    persistProjectCompose.isPending || persistEnvironmentCompose.isPending

  const documentFacts = useComposeDocumentFacts({
    orgId,
    project,
    selectedEnvironment,
    baseSelected,
    services,
    containersByService,
    hostingsByService: hostingsQuery.hostingsByService,
    storage: storageQuery.data?.storage ?? EMPTY_STORAGE,
    // Project scope is the shared compose, not a deployment — no status dots.
    showStatus: !baseSelected,
  })

  const openScopeConfig = useCallback(() => {
    router.push(
      projectComposeSectionHref(
        orgId,
        projectId,
        'settings',
        baseSelected ? null : selectedEnvironmentId,
      ) as Href,
    )
  }, [router, orgId, projectId, baseSelected, selectedEnvironmentId])

  const handleSaveProjectCompose = useCallback(
    async (compose: ComposeDocument) => {
      // A draft has no row to PATCH and shows no Save — the wizard's footer
      // Create button is the only commit path.
      if (draft) return
      setError(null)
      const result = await persistProjectCompose.run(compose)
      if (!result.ok && persistProjectCompose.actionError) {
        setError(persistProjectCompose.actionError)
      }
    },
    [draft, persistProjectCompose, setError],
  )

  const handleSaveEnvironmentCompose = useCallback(
    async (compose: ComposeDocument) => {
      if (!selectedEnvironmentId) return
      setError(null)
      const result = await persistEnvironmentCompose.run(compose)
      if (!result.ok && persistEnvironmentCompose.actionError) {
        setError(persistEnvironmentCompose.actionError)
        return
      }
      await invalidateEnvironments()
      await Promise.all([
        servicesQuery.refetch(),
        containersQuery.refetchAll(),
      ])
    },
    [
      selectedEnvironmentId,
      persistEnvironmentCompose,
      setError,
      invalidateEnvironments,
      servicesQuery,
      containersQuery,
    ],
  )

  useEffect(() => {
    if (servicesQuery.error instanceof Error) {
      setError(servicesQuery.error.message)
    }
  }, [servicesQuery.error, setError])

  if (!project) return null

  if (!isWorkspaceKindResolved) {
    return <Text style={orgPanelStyles.muted}>Loading project…</Text>
  }

  if (isSystemProject) {
    return <SystemProjectOverviewPanel />
  }

  const allContainers = Object.values(containersByService).flat()
  const isStarted =
    !baseSelected &&
    allContainers.some((container) => isActiveContainerStatus(container.status))

  return (
    <View style={styles.root}>
      {!canManage || !projectAllowsMutations ? (
        <Text style={orgPanelStyles.muted}>View only</Text>
      ) : null}

      <View style={styles.overviewCompose}>
        <ComposeScopeBanner />
        {composeSurfaceBody(
          activeTab,
          <ServicesPanelBody
            baseSelected={baseSelected}
            project={project}
            projectId={projectId}
            orgId={orgId}
            selectedEnvironment={selectedEnvironment}
            environmentsCount={environments.length}
            projectServerCount={projectServerCount}
            storageCount={storageCount}
            bindingsCount={bindingsCount}
            services={services}
            containersByService={containersByService}
            loading={loading}
            saving={composeSaving}
            isStarted={isStarted}
            sectionView={sectionView}
            draft={draft}
            canMutate={canManage && projectAllowsMutations}
            documentFacts={documentFacts}
            onOpenScopeConfig={openScopeConfig}
            onSaveProjectCompose={handleSaveProjectCompose}
            onSaveEnvironmentCompose={handleSaveEnvironmentCompose}
          />,
        )}
        {draft ? null : <OverviewEnvironmentsPanel />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  overviewCompose: { width: '100%', gap: spacing.md },
})

/** Short live commit per compose service, from the one unscoped releases read. */
function liveCommitsByService(
  releases: readonly ReleaseRecord[] | undefined,
): Map<string, string> {
  const byService = new Map<string, string>()
  for (const release of releases ?? []) {
    if (!release.isLive) continue
    byService.set(release.composeServiceName, release.commitSha.slice(0, 7))
  }
  return byService
}

/** Gutter facts per compose service name — status, hostname, live release. */
function serviceFactsByName(
  params: Readonly<{
    services: readonly ServiceRecord[]
    containersByService: Record<string, ContainerRecord[]>
    hostingsByService: Record<string, HostingRecord[]>
    liveCommitByService: ReadonlyMap<string, string>
    showStatus: boolean
  }>,
): Record<string, ComposeDocServiceFacts> {
  const byService: Record<string, ComposeDocServiceFacts> = {}
  for (const service of params.services) {
    const name = service.composeServiceName
    if (!name) continue
    const tone = serviceStatusTone(params.containersByService[service.id] ?? [])
    const liveCommit = params.liveCommitByService.get(name)
    byService[name] = {
      serviceId: service.id,
      hostname: params.hostingsByService[service.id]?.[0]?.name ?? null,
      ...(liveCommit ? { releaseLabel: `${liveCommit} live` } : {}),
      ...(params.showStatus
        ? { statusColor: tone.color, statusLabel: tone.label }
        : {}),
    }
  }
  return byService
}

/** Where each volume lives: its location server's label, else the provider name. */
function storageLabelsByVolume(
  storage: readonly StorageRecord[],
  servers: readonly ServerNameSource[] | undefined,
): Record<string, string> {
  const byVolume: Record<string, string> = {}
  for (const row of storage) {
    const location = row.copies[0]
    const locationServer = location?.serverId
      ? servers?.find((server) => server.id === location.serverId)
      : undefined
    const where =
      (locationServer ? serverDisplayName(locationServer) : null) ??
      location?.provider ??
      null
    if (where) byVolume[row.name] = where
  }
  return byVolume
}

/**
 * Live facts drawn in the Services lens gutter.
 *
 * Everything here is already fetched for the surface — status from containers,
 * hostnames from the hosting rows, placement from the effective server pin. At
 * Project scope there are no service rows (nothing is deployed there), so the
 * document falls back to compose-only facts, which is the honest reading.
 */
function useComposeDocumentFacts({
  orgId,
  project,
  selectedEnvironment,
  baseSelected,
  services,
  containersByService,
  hostingsByService,
  storage,
  showStatus,
}: Readonly<{
  orgId: string
  project: ProjectRecord | null
  selectedEnvironment: EnvironmentRecord | null
  baseSelected: boolean
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  hostingsByService: Record<string, HostingRecord[]>
  storage: readonly StorageRecord[]
  showStatus: boolean
}>): ComposeDocFacts {
  const serversQuery = useOrgServers(orgId)
  const servers = serversQuery.data?.servers
  // One unscoped read for the whole environment rather than one per service:
  // the releases endpoint already returns every Git-backed service, and the
  // gutter only needs the live row of each.
  const releasesQuery = useServiceReleases(
    orgId,
    selectedEnvironment?.id ?? '',
    undefined,
    { enabled: Boolean(selectedEnvironment) },
  )
  const releases = releasesQuery.data?.releases

  return useMemo(() => {
    const effectiveServerId = baseSelected
      ? project?.options?.defaultServerId ?? null
      : resolveEffectiveServerId(
          selectedEnvironment?.serverId ?? null,
          project?.options?.defaultServerId,
        )
    const placementServer = effectiveServerId
      ? servers?.find((row) => row.id === effectiveServerId)
      : undefined

    return {
      byService: serviceFactsByName({
        services,
        containersByService,
        hostingsByService,
        liveCommitByService: liveCommitsByService(releases),
        showStatus,
      }),
      placementLabel: placementServer
        ? serverDisplayName(placementServer)
        : null,
      storageByVolume: storageLabelsByVolume(storage, servers),
    }
  }, [
    services,
    containersByService,
    hostingsByService,
    storage,
    showStatus,
    baseSelected,
    project?.options?.defaultServerId,
    selectedEnvironment?.serverId,
    servers,
    releases,
  ])
}
