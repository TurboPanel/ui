import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, useRouter, type Href } from 'expo-router'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { OverviewEnvironmentsPanel } from '@/components/org/project/overview-environments-panel'
import { ProjectSectionTabs } from '@/components/org/project/project-section-tabs'
import { ProjectServerHeaderControl } from '@/components/org/project/project-server-pin'
import { EffectiveComposePanel } from '@/components/org/project/effective-compose-panel'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { ProjectVariablesSection } from '@/components/org/project-variables-section'
import { ProjectPrincipalsSection } from '@/components/org/project-detail-section'
import { ComposeBasePanel } from '@/components/org/compose-base-panel'
import { ComposeEditorChrome } from '@/components/org/compose-editor-section'
import {
  usePersistEnvironmentCompose,
  usePersistProjectCompose,
} from '@/components/org/compose-persistence'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import { StorageSection } from '@/components/org/storage-section'
import {
  type ComposeDocument,
  type ContainerRecord,
  type EnvironmentRecord,
  type ProjectRecord,
  type ServiceRecord,
} from '@/lib/instance-api'
import { useUpdateProject } from '@/lib/queries/projects'
import { useContainersByServices, useServices } from '@/lib/queries'
import {
  isActiveContainerStatus,
  serviceStatusTone,
} from '@/lib/container-status'
import {
  projectHostingHref,
  projectServiceHref,
  projectSettingsSubHref,
} from '@/lib/project-navigation'
import { chrome, colors, spacing } from '@/lib/theme'
import {
  buildProjectOptionsPatch,
  resolveEffectiveServerId,
} from '@/lib/project-options'

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
  toolbarLeading,
  toolbarTrailing,
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
  toolbarLeading?: ReactNode
  toolbarTrailing?: ReactNode
}>): ReactNode {
  if (baseSelected) {
    return (
      <ComposeBasePanel
        document={project.options?.compose}
        onSave={onSaveProjectCompose}
        saving={saving}
        defaultEditorView="editor"
        hideHeader
        toolbarLeading={toolbarLeading}
        toolbarTrailing={toolbarTrailing}
      />
    )
  }

  if (!selectedEnvironment) {
    return (
      <ComposeEditorChrome leading={toolbarLeading} trailing={toolbarTrailing}>
        <Text style={orgPanelStyles.muted}>Select an environment.</Text>
      </ComposeEditorChrome>
    )
  }

  if (loading) {
    return (
      <ComposeEditorChrome leading={toolbarLeading} trailing={toolbarTrailing}>
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      </ComposeEditorChrome>
    )
  }

  if (isStarted) {
    return (
      <ComposeEditorChrome leading={toolbarLeading} trailing={toolbarTrailing}>
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
      toolbarLeading={toolbarLeading}
      toolbarTrailing={toolbarTrailing}
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
  } = useProjectContext()
  const persistProjectCompose = usePersistProjectCompose(orgId, projectId)
  const persistEnvironmentCompose = usePersistEnvironmentCompose(
    orgId,
    selectedEnvironmentId ?? '',
  )
  const servicesEnabled = Boolean(selectedEnvironmentId) && !baseSelected
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

  const allContainers = Object.values(containersByService).flat()
  const isStarted =
    !baseSelected &&
    allContainers.some((container) => isActiveContainerStatus(container.status))

  return (
    <View style={styles.root}>
      {!canManage ? (
        <Text style={orgPanelStyles.muted}>View only</Text>
      ) : null}

      <View style={styles.overviewCompose}>
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
          toolbarLeading={<ProjectSectionTabs />}
          toolbarTrailing={<ProjectServerHeaderControl />}
        />
        <OverviewEnvironmentsPanel />
      </View>

      {!baseSelected && selectedEnvironment ? (
        <EffectiveComposePanel
          orgId={orgId}
          environmentId={selectedEnvironment.id}
          canManage={canManage}
          placementServerId={resolveEffectiveServerId(
            selectedEnvironment.serverId,
            project.options?.defaultServerId,
          )}
        />
      ) : null}
    </View>
  )
}

export function ComposeNetworkingTab() {
  const { orgId, projectId, selectedEnvironmentId } = useProjectContext()
  if (!selectedEnvironmentId) {
    return <Text style={orgPanelStyles.muted}>Select an environment.</Text>
  }
  // Environment detail already owns the hosting panel; reuse it and rely on
  // deep links for per-hosting drill-down from service list later.
  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.muted}>
        Hostnames and ports for the selected environment. Open a service for
        settings detail.
      </Text>
      <EnvironmentDetailBody
        orgId={orgId}
        projectId={projectId}
        environmentId={selectedEnvironmentId}
        embedded
        showComposeOverlay={false}
      />
      <Text style={styles.hint}>
        Tip: edit the shared stack on Overview (Project), then pin a server here
        before Deploy.
      </Text>
      {/* Keep hosting deep-link helper reachable for a11y/docs. */}
      <Text style={styles.srOnly}>
        {projectHostingHref(orgId, projectId, 'hosting')}
      </Text>
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

export function ComposeSettingsHub() {
  const { orgId, projectId, canOwn } = useProjectContext()
  const links: { sub: 'compose' | 'overrides' | 'variables' | 'principals' | 'naming' | 'workspace' | 'danger'; label: string; hint: string }[] = [
    {
      sub: 'compose',
      label: 'Base Compose',
      hint: 'Shared stack for every environment',
    },
    {
      sub: 'overrides',
      label: 'Environment overrides',
      hint: 'Per-environment compose overlay and deploy preview',
    },
    {
      sub: 'variables',
      label: 'Variables',
      hint: 'Project-scoped variables',
    },
    {
      sub: 'principals',
      label: 'System users',
      hint: 'Project principals and service assignments',
    },
    {
      sub: 'naming',
      label: 'Container naming',
      hint: 'UUID vs custom container names',
    },
    {
      sub: 'workspace',
      label: 'Workspace',
      hint: 'Move this project between workspaces',
    },
  ]
  if (canOwn) {
    links.push({
      sub: 'danger',
      label: 'Delete project',
      hint: 'Stop services and permanently delete',
    })
  }

  return (
    <View style={styles.root}>
      <SectionPanel title="Settings" hint="Project configuration">
        <View style={styles.list}>
          {links.map((link) => (
            <Link
              key={link.sub}
              href={
                projectSettingsSubHref(
                  orgId,
                  projectId,
                  link.sub,
                ) as Href
              }
              asChild
            >
              <Pressable
                style={StyleSheet.flatten([styles.row, webPointer])}
                accessibilityRole="link"
                accessibilityLabel={link.label}
              >
                <Text style={styles.rowTitle}>{link.label}</Text>
                <Text style={styles.rowMeta}>{link.hint}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </SectionPanel>
    </View>
  )
}

export function SettingsComposePanel() {
  const { orgId, projectId, project, setError, canManage } = useProjectContext()
  const persistProjectCompose = usePersistProjectCompose(orgId, projectId)
  if (!project) return null

  const handleSave = async (compose: ComposeDocument) => {
    setError(null)
    const result = await persistProjectCompose.run(compose)
    if (!result.ok && persistProjectCompose.actionError) {
      setError(persistProjectCompose.actionError)
    }
  }

  return (
    <SectionPanel
      title="Base Compose"
      hint="Shared stack — each environment can override"
      accent
    >
      {!canManage ? (
        <Text style={orgPanelStyles.muted}>View only</Text>
      ) : null}
      <ComposeBasePanel
        document={project.options?.compose}
        onSave={handleSave}
        saving={persistProjectCompose.isPending}
      />
    </SectionPanel>
  )
}

export function SettingsOverridesPanel() {
  const { orgId, projectId, selectedEnvironmentId } = useProjectContext()
  if (!selectedEnvironmentId) {
    return <Text style={orgPanelStyles.muted}>Select an environment.</Text>
  }
  return (
    <EnvironmentDetailBody
      orgId={orgId}
      projectId={projectId}
      environmentId={selectedEnvironmentId}
      embedded
    />
  )
}

export function SettingsPrincipalsPanel() {
  const { orgId, projectId, canManage } = useProjectContext()
  return (
    <ProjectPrincipalsSection
      orgId={orgId}
      projectId={projectId}
      canManage={canManage}
    />
  )
}

export function SettingsVariablesPanel() {
  const { orgId, projectId } = useProjectContext()
  return <ProjectVariablesSection orgId={orgId} projectId={projectId} />
}

export function SettingsNamingPanel() {
  const { orgId, projectId, project, setError, canManage } = useProjectContext()
  const updateProjectMutation = useUpdateProject(orgId, projectId)
  if (!project) return null
  const value = project.options?.containerNaming ?? 'uuid'

  const save = async (containerNaming: 'uuid' | 'custom') => {
    if (value === containerNaming) return
    setError(null)
    const options = buildProjectOptionsPatch(project, { containerNaming })
    const result = await updateProjectMutation.run({ options })
    if (!result.ok && updateProjectMutation.actionError) {
      setError(updateProjectMutation.actionError)
    }
  }

  const saving = updateProjectMutation.isPending

  return (
    <SectionPanel
      title="Container naming"
      hint="How Docker container_name values are generated at deploy"
    >
      {canManage ? (
        <View style={orgPanelStyles.segmentGroup}>
          {(
            [
              { mode: 'uuid' as const, label: 'UUID' },
              { mode: 'custom' as const, label: 'Custom' },
            ] as const
          ).map((option) => {
            const active = value === option.mode
            return (
              <Pressable
                key={option.mode}
                style={[
                  orgPanelStyles.segmentChip,
                  active && orgPanelStyles.segmentChipActive,
                  webPointer,
                  saving && styles.disabled,
                ]}
                disabled={saving}
                onPress={() => {
                  void save(option.mode)
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.label}
              >
                <Text
                  style={[
                    orgPanelStyles.segmentChipText,
                    active && orgPanelStyles.segmentChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : (
        <Text style={orgPanelStyles.detailLine}>
          {value === 'custom' ? 'Custom' : 'UUID'}
        </Text>
      )}
      {saving ? <Text style={orgPanelStyles.muted}>Saving…</Text> : null}
    </SectionPanel>
  )
}

export function SettingsWorkspacePanel() {
  const {
    orgId,
    projectId,
    project,
    workspaces,
    canOwn,
    setError,
  } = useProjectContext()
  const updateProjectMutation = useUpdateProject(orgId, projectId)
  if (!project) return null

  const sorted = [...workspaces].sort((a, b) =>
    (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id),
  )

  const move = async (workspaceId: string) => {
    if (workspaceId === project.workspaceId) return
    setError(null)
    const result = await updateProjectMutation.run({ workspaceId })
    if (!result.ok && updateProjectMutation.actionError) {
      setError(updateProjectMutation.actionError)
    }
  }

  const saving = updateProjectMutation.isPending

  return (
    <SectionPanel title="Workspace" hint="Move this project to another workspace">
      {canOwn ? (
        <View style={styles.list}>
          {sorted.map((ws) => {
            const selected = ws.id === project.workspaceId
            const label = ws.displayName?.trim() || 'Workspace'
            if (selected) {
              return (
                <View
                  key={ws.id}
                  style={[styles.row, styles.rowSelected]}
                  accessibilityState={{ selected: true }}
                >
                  <Text style={styles.rowTitle}>{label}</Text>
                </View>
              )
            }
            return (
              <Pressable
                key={ws.id}
                style={[styles.row, webPointer, saving && styles.disabled]}
                disabled={saving}
                onPress={() => {
                  void move(ws.id)
                }}
                accessibilityRole="button"
                accessibilityLabel={`Move to ${label}`}
              >
                <Text style={styles.rowTitle}>{label}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : (
        <Text style={orgPanelStyles.detailLine}>
          {sorted.find((ws) => ws.id === project.workspaceId)?.displayName ??
            project.workspaceId}
        </Text>
      )}
      {saving ? <Text style={orgPanelStyles.muted}>Moving…</Text> : null}
    </SectionPanel>
  )
}

export function SettingsDangerPanel() {
  const { orgId, project } = useProjectContext()
  const router = useRouter()
  if (!project) return null
  return (
    <ProjectDeletePanel
      orgId={orgId}
      project={project}
      onCancel={() => {
        router.push(`/${orgId}/projects/${project.id}/settings` as Href)
      }}
      onDeleted={() => {
        router.replace(`/${orgId}/projects` as Href)
      }}
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
  rowSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 13 },
  disabled: { opacity: 0.55 },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
})
