import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { ComposeScopeBanner } from '@/components/org/project/compose-scope-banner'
import { ComposeSavedView } from '@/components/org/project/compose-saved-view'
import { OverviewEnvironmentsPanel } from '@/components/org/project/overview-environments-panel'
import { ProjectSettingsArea } from '@/components/org/project-settings-area'
import { ComposeBasePanel } from '@/components/org/compose-base-panel'
import { ComposeEditorChrome } from '@/components/org/compose-editor-section'
import {
  usePersistEnvironmentCompose,
  usePersistProjectCompose,
} from '@/components/org/compose-persistence'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import { StorageSection } from '@/components/org/storage-section'
import { SystemProjectOverviewPanel } from '@/components/org/project/system-project-overview-panel'
import {
  isBlankComposeData,
  mergeComposeOverlay,
  normalizeCompose,
  resolveComposeOverlayState,
  type ComposeDocument,
} from '@/lib/compose'
import {
  type ContainerRecord,
  type EnvironmentRecord,
  type ProjectRecord,
  type ServiceRecord,
} from '@/lib/instance-api'
import { useContainersByServices, useServices } from '@/lib/queries'
import { isActiveContainerStatus } from '@/lib/container-status'
import { resolveEffectiveServerId } from '@/lib/project-options'
import { colors, spacing } from '@/lib/theme'

function QuietButton({
  label,
  onPress,
}: Readonly<{
  label: string
  onPress: () => void
}>) {
  return (
    <Pressable
      style={[styles.quietBtn, webPointer]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.quietBtnText}>{label}</Text>
    </Pressable>
  )
}

/** True when project compose has nothing to preview yet (fresh create / cleared). */
function isBlankComposeDocument(document: unknown): boolean {
  return isBlankComposeData(normalizeCompose(document).data)
}

function ServicesPanelBody({
  baseSelected,
  project,
  projectId,
  orgId,
  selectedEnvironment,
  services,
  containersByService,
  loading,
  saving,
  isStarted,
  editing,
  canEdit,
  onEdit,
  onCancelEdit,
  onSaveProjectCompose,
  onSaveEnvironmentCompose,
}: Readonly<{
  baseSelected: boolean
  project: ProjectRecord
  projectId: string
  orgId: string
  selectedEnvironment: EnvironmentRecord | null
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  loading: boolean
  saving: boolean
  isStarted: boolean
  editing: boolean
  canEdit: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSaveProjectCompose: (compose: ComposeDocument) => Promise<void>
  onSaveEnvironmentCompose: (compose: ComposeDocument) => Promise<void>
}>): ReactNode {
  const editTrailing = (
    <QuietButton label="Discard Changes" onPress={onCancelEdit} />
  )

  if (baseSelected) {
    if (editing) {
      return (
        <ComposeBasePanel
          document={project.options?.compose}
          onSave={onSaveProjectCompose}
          saving={saving}
          defaultEditorView="editor"
          hideHeader
          toolbarTrailing={editTrailing}
        />
      )
    }
    const hasServer = Boolean(project.options?.defaultServerId)
    return (
      <ComposeSavedView
        title="Compose - Project"
        document={project.options?.compose}
        hasServer={hasServer}
        canEdit={canEdit}
        onEdit={onEdit}
        orgId={orgId}
        projectId={projectId}
        services={services}
        containersByService={containersByService}
        showServiceStatus={false}
      />
    )
  }

  if (!selectedEnvironment) {
    return (
      <ComposeEditorChrome>
        <Text style={orgPanelStyles.muted}>Select an environment.</Text>
      </ComposeEditorChrome>
    )
  }

  if (loading) {
    return (
      <ComposeEditorChrome>
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      </ComposeEditorChrome>
    )
  }

  if (editing) {
    return (
      <ComposeBasePanel
        document={selectedEnvironment.options?.compose}
        onSave={onSaveEnvironmentCompose}
        saving={saving}
        defaultEditorView="editor"
        hideHeader
        toolbarTrailing={editTrailing}
      />
    )
  }

  const overlayState = resolveComposeOverlayState(
    selectedEnvironment.options?.compose,
  )
  const merged = mergeComposeOverlay(
    project.options?.compose,
    selectedEnvironment.options?.compose,
  )
  const effectiveServerId = resolveEffectiveServerId(
    selectedEnvironment.serverId,
    project.options?.defaultServerId,
  )
  const envLabel =
    selectedEnvironment.displayName?.trim() || 'Environment'
  const inheriting = overlayState.blank

  return (
    <ComposeSavedView
      title={`${envLabel} compose`}
      document={
        inheriting ? merged : selectedEnvironment.options?.compose
      }
      summaryDocument={merged}
      hasServer={Boolean(effectiveServerId)}
      canEdit={canEdit}
      inheritedCaption={
        inheriting ? 'Inherited from project compose' : null
      }
      onEdit={onEdit}
      orgId={orgId}
      projectId={projectId}
      services={services}
      containersByService={containersByService}
      showServiceStatus={isStarted}
    />
  )
}

export function ComposeServicesTab() {
  const {
    orgId,
    projectId,
    project,
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
  const persistProjectCompose = usePersistProjectCompose(orgId, projectId)
  const persistEnvironmentCompose = usePersistEnvironmentCompose(
    orgId,
    selectedEnvironmentId ?? '',
  )
  const [editing, setEditing] = useState(false)
  const canEdit = canManage && projectAllowsMutations
  const projectComposeBlank = isBlankComposeDocument(
    project?.options?.compose,
  )
  // After save/cancel of a blank draft, stay in view — blank is a valid
  // saved state (deploy gates on merged compose, not on save).
  const blankEditDismissedRef = useRef(false)

  useEffect(() => {
    blankEditDismissedRef.current = false
  }, [baseSelected, selectedEnvironmentId])

  useEffect(() => {
    // Fresh project compose has nothing to preview — open the editor once.
    if (
      baseSelected &&
      canEdit &&
      projectComposeBlank &&
      !blankEditDismissedRef.current
    ) {
      setEditing(true)
      return
    }
    if (!baseSelected || !projectComposeBlank) {
      setEditing(false)
    }
  }, [baseSelected, selectedEnvironmentId, canEdit, projectComposeBlank])

  const leaveComposeEdit = useCallback(() => {
    blankEditDismissedRef.current = true
    setEditing(false)
  }, [])

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
        return
      }
      if (result.ok) leaveComposeEdit()
    },
    [persistProjectCompose, setError, leaveComposeEdit],
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
      if (result.ok) leaveComposeEdit()
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
      leaveComposeEdit,
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
        <ComposeScopeBanner onCreateOverride={() => setEditing(true)} />
        <ServicesPanelBody
          baseSelected={baseSelected}
          project={project}
          projectId={projectId}
          orgId={orgId}
          selectedEnvironment={selectedEnvironment}
          services={services}
          containersByService={containersByService}
          loading={loading}
          saving={composeSaving}
          isStarted={isStarted}
          editing={editing}
          canEdit={canEdit}
          onEdit={() => setEditing(true)}
          onCancelEdit={leaveComposeEdit}
          onSaveProjectCompose={handleSaveProjectCompose}
          onSaveEnvironmentCompose={handleSaveEnvironmentCompose}
        />
        <OverviewEnvironmentsPanel />
      </View>

      <ProjectSettingsArea />
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
  quietBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quietBtnText: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '600',
  },
})
