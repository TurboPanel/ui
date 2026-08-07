import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, type Href } from 'expo-router'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { ComposeScopeBanner } from '@/components/org/project/compose-scope-banner'
import { OverviewEnvironmentsPanel } from '@/components/org/project/overview-environments-panel'
import { EffectiveComposePanel } from '@/components/org/project/effective-compose-panel'
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
  type ComposeDocument,
  type ContainerRecord,
  type EnvironmentRecord,
  type ProjectRecord,
  type ServiceRecord,
} from '@/lib/instance-api'
import { useContainersByServices, useServices } from '@/lib/queries'
import {
  isActiveContainerStatus,
  serviceStatusTone,
} from '@/lib/container-status'
import { projectServiceHref } from '@/lib/project-navigation'
import { colors, spacing } from '@/lib/theme'
import { resolveEffectiveServerId } from '@/lib/project-options'

function ServicesStatusList({
  orgId,
  projectId,
  services,
  containersByService,
}: Readonly<{
  orgId: string
  projectId: string
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
}>) {
  if (services.length === 0) {
    return <Text style={orgPanelStyles.muted}>No services yet.</Text>
  }
  return (
    <View style={styles.list}>
      {services.map((service) => {
        const label =
          service.displayName?.trim() ||
          service.composeServiceName ||
          'Service'
        const tone = serviceStatusTone(containersByService[service.id] ?? [])
        return (
          <Link
            key={service.id}
            href={projectServiceHref(orgId, projectId, service.id) as Href}
            asChild
          >
            <Pressable
              style={StyleSheet.flatten([
                styles.row,
                styles.statusRow,
                webPointer,
              ])}
              accessibilityRole="link"
              accessibilityLabel={`${label}, ${tone.label}`}
            >
              <View
                style={[styles.statusDot, { backgroundColor: tone.color }]}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <View style={styles.statusTextCol}>
                <Text style={styles.rowTitle}>{label}</Text>
                <Text style={styles.rowMeta}>{tone.label}</Text>
              </View>
            </Pressable>
          </Link>
        )
      })}
    </View>
  )
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
  onSaveProjectCompose: (compose: ComposeDocument) => Promise<void>
  onSaveEnvironmentCompose: (compose: ComposeDocument) => Promise<void>
}>): ReactNode {
  if (baseSelected) {
    return (
      <ComposeBasePanel
        document={project.options?.compose}
        onSave={onSaveProjectCompose}
        saving={saving}
        defaultEditorView="editor"
        hideHeader
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

  if (isStarted) {
    return (
      <ComposeEditorChrome>
        <ServicesStatusList
          orgId={orgId}
          projectId={projectId}
          services={services}
          containersByService={containersByService}
        />
      </ComposeEditorChrome>
    )
  }

  return (
    <ComposeBasePanel
      document={selectedEnvironment.options?.compose}
      onSave={onSaveEnvironmentCompose}
      saving={saving}
      defaultEditorView="editor"
      hideHeader
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
          services={services}
          containersByService={containersByService}
          loading={loading}
          saving={composeSaving}
          isStarted={isStarted}
          onSaveProjectCompose={handleSaveProjectCompose}
          onSaveEnvironmentCompose={handleSaveEnvironmentCompose}
        />
        <OverviewEnvironmentsPanel />
      </View>

      <EffectiveComposePanel
        orgId={orgId}
        environmentId={baseSelected ? null : (selectedEnvironment?.id ?? null)}
        canManage={canManage && projectAllowsMutations}
        placementServerId={
          baseSelected
            ? (project.options?.defaultServerId ?? null)
            : resolveEffectiveServerId(
                selectedEnvironment?.serverId ?? null,
                project.options?.defaultServerId,
              )
        }
        projectCompose={project.options?.compose}
        environmentCompose={
          baseSelected ? undefined : selectedEnvironment?.options?.compose
        }
      />

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
  list: { gap: spacing.xs },
  row: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
    gap: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
  },
  statusTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: 13 },
})
