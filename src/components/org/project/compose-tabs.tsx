import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname } from 'expo-router'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  composeDraftScopeKey,
  composeFullYaml,
  isComposeDraftDirty,
  reconcileComposeDraft,
  resolveComposeDraftSnapshot,
  seedComposeDraftFromDocument,
  useComposeDraftStore,
} from '@/components/org/project/compose-draft-context'
import { useProjectContext } from '@/components/org/project/project-context'
import { ComposeScopeBanner } from '@/components/org/project/compose-scope-banner'
import {
  ComposeSavedView,
  type OverviewComposeSource,
} from '@/components/org/project/compose-saved-view'
import type { InventoryStripItem } from '@/components/org/project/compose-inventory-strip'
import { OverviewEnvironmentsPanel } from '@/components/org/project/overview-environments-panel'
import { ComposeBasePanel } from '@/components/org/compose-base-panel'
import {
  ComposeEditorChrome,
  ComposeSurfaceSectionTabs,
} from '@/components/org/compose-editor-section'
import {
  usePersistEnvironmentCompose,
  usePersistProjectCompose,
} from '@/components/org/compose-persistence'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import { StorageSection } from '@/components/org/storage-section'
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
  type ProjectRecord,
  type ServiceRecord,
} from '@/lib/instance-api'
import { parseComposeEditView } from '@/lib/project-navigation'
import { useContainersByServices, useServices } from '@/lib/queries'
import { useEnvironmentBindings } from '@/lib/queries/bindings'
import { useStorage } from '@/lib/queries/storage'
import { isActiveContainerStatus } from '@/lib/container-status'
import {
  countDistinctProjectServers,
  resolveEffectiveServerId,
} from '@/lib/project-options'
import { chrome, spacing } from '@/lib/theme'

function inventoryItem(
  key: string,
  value: number,
  noun: string,
  pluralNoun?: string,
): InventoryStripItem {
  return pluralNoun ? { key, value, noun, pluralNoun } : { key, value, noun }
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

function OverviewSaveButton({
  saving,
  disabled,
  onSave,
}: Readonly<{
  saving: boolean
  disabled: boolean
  onSave: () => void
}>) {
  return (
    <Pressable
      style={[
        styles.saveButton,
        webPointer,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onSave}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={saving ? 'Saving…' : 'Save'}
    >
      <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
    </Pressable>
  )
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
): ReactNode {
  if (!isDirty && !saving) return undefined
  return (
    <OverviewSaveButton
      saving={saving}
      disabled={saving || !isDirty}
      onSave={onSave}
    />
  )
}

function ComposeEditorPanel({
  document,
  onSave,
  saving,
  editView,
  sessionKey,
}: Readonly<{
  document: unknown
  onSave: (compose: ComposeDocument) => Promise<void>
  saving: boolean
  editView: ComposeEditorView
  sessionKey: string
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
  overviewSource,
  onOverviewSourceChange,
  proposedDoc,
  saving,
  onSave,
}: Readonly<{
  projectId: string
  orgId: string
  environmentsCount: number
  projectServerCount: number
  storageCount: number
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  isDirty: boolean
  overviewSource: OverviewComposeSource
  onOverviewSourceChange: (source: OverviewComposeSource) => void
  proposedDoc: unknown
  saving: boolean
  onSave: () => void
}>) {
  const projectSummary = summarizeComposeDocument(proposedDoc)
  const inventory: InventoryStripItem[] = [
    inventoryItem('environments', environmentsCount, 'environment'),
    inventoryItem('servers', projectServerCount, 'server'),
    inventoryItem('services', projectSummary.services, 'service'),
    inventoryItem('networks', projectSummary.networks, 'network'),
    inventoryItem('volumes', projectSummary.volumes, 'volume'),
    inventoryItem('storage', storageCount, 'storage volume', 'storage volumes'),
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
      toolbarTrailing={overviewSaveTrailing(isDirty, saving, onSave)}
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
    inventoryItem('servers', effectiveServerId ? 1 : 0, 'server'),
    inventoryItem('services', envSummary.services, 'service'),
    inventoryItem('networks', envSummary.networks, 'network'),
    inventoryItem('volumes', envSummary.volumes, 'volume'),
    inventoryItem('storage', storageCount, 'storage volume', 'storage volumes'),
    inventoryItem('bindings', bindingsCount, 'binding'),
  ]
  return (
    <ComposeSavedView
      document={inheriting ? merged : proposedOverlay}
      summaryDocument={merged}
      inventory={inventory}
      inheritedCaption={
        inheriting ? 'Inherited from project compose' : null
      }
      orgId={orgId}
      projectId={projectId}
      services={services}
      containersByService={containersByService}
      showServiceStatus={isStarted}
      draftSource={isDirty ? overviewSource : undefined}
      onDraftSourceChange={isDirty ? onOverviewSourceChange : undefined}
      toolbarTrailing={overviewSaveTrailing(isDirty, saving, onSave)}
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
  /** null = Overview (saved view); editor/visual = Compose/Services tabs. */
  sectionView: ComposeEditorView | null
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

  if (baseSelected) {
    if (editing) {
      return (
        <ComposeEditorPanel
          document={project.options?.compose}
          onSave={onSaveProjectCompose}
          saving={saving}
          editView={editView}
          sessionKey={scopeKey}
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
      />
    )
  }

  if (!selectedEnvironment) {
    return (
      <ComposeEditorChrome tabs={<ComposeSurfaceSectionTabs />}>
        <Text style={orgPanelStyles.muted}>Select an environment.</Text>
      </ComposeEditorChrome>
    )
  }

  if (loading) {
    return (
      <ComposeEditorChrome tabs={<ComposeSurfaceSectionTabs />}>
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      </ComposeEditorChrome>
    )
  }

  if (editing) {
    return (
      <ComposeEditorPanel
        document={selectedEnvironment.options?.compose}
        onSave={onSaveEnvironmentCompose}
        saving={saving}
        editView={editView}
        sessionKey={scopeKey}
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
    />
  )
}

export function ComposeServicesTab() {
  const pathname = usePathname()
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
    enabled: storageFilter != null,
  })
  const storageCount = storageQuery.data?.storage.length ?? 0
  const bindingsQuery = useEnvironmentBindings(
    orgId,
    selectedEnvironmentId ?? '',
    { enabled: !baseSelected && Boolean(selectedEnvironmentId) },
  )
  const bindingsCount = bindingsQuery.data?.bindings.length ?? 0
  const persistProjectCompose = usePersistProjectCompose(orgId, projectId)
  const persistEnvironmentCompose = usePersistEnvironmentCompose(
    orgId,
    selectedEnvironmentId ?? '',
  )
  const sectionView = parseComposeEditView(pathname, projectId)

  const servicesEnabled =
    Boolean(selectedEnvironmentId) && !baseSelected && projectAllowsMutations
  const servicesQuery = useServices(orgId, selectedEnvironmentId ?? undefined, {
    enabled: servicesEnabled,
  })
  const services = servicesQuery.data?.services ?? []
  const serviceIds = useMemo(
    () => services.map((service) => service.id),
    [services],
  )
  const containersQuery = useContainersByServices(orgId, serviceIds, {
    enabled: servicesEnabled && serviceIds.length > 0,
  })
  const containersByService = containersQuery.containersByService
  const loading =
    servicesEnabled &&
    (servicesQuery.isLoading ||
      (serviceIds.length > 0 && containersQuery.isLoading))
  const composeSaving =
    persistProjectCompose.isPending || persistEnvironmentCompose.isPending

  const handleSaveProjectCompose = useCallback(
    async (compose: ComposeDocument) => {
      setError(null)
      const result = await persistProjectCompose.run(compose)
      if (!result.ok && persistProjectCompose.actionError) {
        setError(persistProjectCompose.actionError)
      }
    },
    [persistProjectCompose, setError],
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
          onSaveProjectCompose={handleSaveProjectCompose}
          onSaveEnvironmentCompose={handleSaveEnvironmentCompose}
        />
        <OverviewEnvironmentsPanel />
      </View>
    </View>
  )
}

export function ComposeNetworkingTab() {
  const { orgId, projectId, selectedEnvironmentId } = useProjectContext()
  if (!selectedEnvironmentId) {
    return <Text style={orgPanelStyles.muted}>Select an environment.</Text>
  }
  // Environment detail already owns the hosting panel; reuse it. Standalone
  // page chrome is retired — routes redirect to the current scope path; this
  // body is kept for Settings-area parity (hosting only).
  return (
    <View style={styles.root}>
      <EnvironmentDetailBody
        orgId={orgId}
        projectId={projectId}
        environmentId={selectedEnvironmentId}
        embedded
        showComposeOverlay={false}
        sections={['hosting']}
      />
    </View>
  )
}

export function ComposeStorageTab() {
  const { orgId, selectedEnvironment } = useProjectContext()
  if (!selectedEnvironment) {
    return <Text style={orgPanelStyles.muted}>Select an environment.</Text>
  }
  return (
    <StorageSection
      orgId={orgId}
      environmentId={selectedEnvironment.id}
      defaultServerId={selectedEnvironment.serverId}
    />
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  overviewCompose: { width: '100%', gap: spacing.md },
  saveButton: {
    borderRadius: 6,
    backgroundColor: chrome.accent,
    paddingHorizontal: 12,
    paddingVertical: 0,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: chrome.onAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  buttonDisabled: { opacity: 0.6 },
})
