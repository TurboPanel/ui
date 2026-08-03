import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, useRouter, type Href } from 'expo-router'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { EffectiveComposePanel } from '@/components/org/project/effective-compose-panel'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { ProjectVariablesSection } from '@/components/org/project-variables-section'
import { ProjectPrincipalsSection } from '@/components/org/project-detail-section'
import { ComposeBasePanel } from '@/components/org/compose-base-panel'
import {
  persistEnvironmentCompose,
  persistProjectCompose,
} from '@/components/org/compose-persistence'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import { StorageSection } from '@/components/org/storage-section'
import {
  fetchContainers,
  fetchVisibleServices,
  isForbiddenError,
  updateProject,
  type ComposeDocument,
  type ContainerRecord,
  type ServiceRecord,
} from '@/lib/instance-api'
import {
  isActiveContainerStatus,
  serviceStatusTone,
} from '@/lib/container-status'
import {
  projectHostingHref,
  projectServiceHref,
  projectSettingsSubHref,
} from '@/lib/project-navigation'
import { useAuth } from '@/lib/auth-context'
import { chrome, colors, spacing } from '@/lib/theme'
import { buildProjectOptionsPatch, mergeProjectOptionsLocal } from '@/lib/project-options'

export function ComposeServicesTab() {
  const {
    orgId,
    projectId,
    project,
    setProject,
    selectedEnvironment,
    selectedEnvironmentId,
    baseSelected,
    refreshEnvironments,
    setError,
    canManage,
  } = useProjectContext()
  const { handleUnauthorized } = useAuth()
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [containersByService, setContainersByService] = useState<
    Record<string, ContainerRecord[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [overlayDraft, setOverlayDraft] = useState<ComposeDocument | null>(null)
  const [servicesReloadToken, setServicesReloadToken] = useState(0)

  useEffect(() => {
    setOverlayDraft(null)
  }, [selectedEnvironmentId, baseSelected])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!selectedEnvironmentId || baseSelected) {
        setServices([])
        setContainersByService({})
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const result = await fetchVisibleServices(selectedEnvironmentId)
        if (cancelled) return
        setServices(result.services)
        const entries = await Promise.all(
          result.services.map(async (service) => {
            const { containers } = await fetchContainers({ serviceId: service.id })
            return [service.id, containers] as const
          }),
        )
        if (!cancelled) {
          setContainersByService(Object.fromEntries(entries))
        }
      } catch (err) {
        if (cancelled) return
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to load services')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [
    selectedEnvironmentId,
    baseSelected,
    servicesReloadToken,
    handleUnauthorized,
    setError,
  ])

  if (!project) return null

  if (baseSelected) {
    return (
      <View style={styles.root}>
        {!canManage ? (
          <Text style={orgPanelStyles.muted}>View only</Text>
        ) : null}
        <SectionPanel
          title="Services"
          hint="Shared setup every environment starts from"
          accent
        >
          <ComposeBasePanel
            document={project.options?.compose}
            onSave={(compose) =>
              persistProjectCompose({
                projectId,
                project,
                compose,
                setProject,
                setError,
                setSaving,
                handleUnauthorized,
              })
            }
            saving={saving}
            defaultEditorView="editor"
          />
          <Text style={orgPanelStyles.muted}>
            Pick an environment to start it, or edit its overlay.
          </Text>
        </SectionPanel>
      </View>
    )
  }

  if (!selectedEnvironment) {
    return <Text style={orgPanelStyles.muted}>Select an environment.</Text>
  }

  const allContainers = Object.values(containersByService).flat()
  const isStarted = allContainers.some((container) =>
    isActiveContainerStatus(container.status),
  )
  const environmentName =
    selectedEnvironment.displayName?.trim() || 'this environment'

  const saveEnvironmentCompose = (compose: ComposeDocument) =>
    persistEnvironmentCompose({
      environmentId: selectedEnvironment.id,
      compose,
      setError,
      setSaving,
      handleUnauthorized,
      onSaved: async () => {
        await refreshEnvironments()
        setServicesReloadToken((token) => token + 1)
      },
    })

  if (loading) {
    return <Text style={orgPanelStyles.muted}>Loading…</Text>
  }

  return (
    <View style={styles.root}>
      {!canManage ? (
        <Text style={orgPanelStyles.muted}>View only</Text>
      ) : null}

      {!isStarted ? (
        <SectionPanel
          title="Services"
          hint={`Settings for ${environmentName} only — on top of the shared setup`}
          accent
        >
          <ComposeBasePanel
            document={selectedEnvironment.options?.compose}
            onSave={saveEnvironmentCompose}
            saving={saving}
            defaultEditorView="editor"
            onDraftChange={setOverlayDraft}
          />
        </SectionPanel>
      ) : (
        <SectionPanel
          title="Services"
          hint={`Running status in ${environmentName}`}
          accent
        >
          {services.length === 0 ? (
            <Text style={orgPanelStyles.muted}>No services yet.</Text>
          ) : (
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
                    href={
                      projectServiceHref(
                        orgId,
                        projectId,
                        service.id,
                      ) as Href
                    }
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
          )}
        </SectionPanel>
      )}

      <EffectiveComposePanel
        environmentId={selectedEnvironment.id}
        environmentName={environmentName}
        projectCompose={project.options?.compose}
        savedOverlay={selectedEnvironment.options?.compose}
        overlayDraft={overlayDraft}
        canManage={canManage}
        placementServerId={selectedEnvironment.serverId}
      />
    </View>
  )
}

export function ComposeEnvironmentsTab() {
  const { orgId, projectId, selectedEnvironmentId } = useProjectContext()
  if (!selectedEnvironmentId) {
    return <Text style={orgPanelStyles.muted}>No environment selected.</Text>
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
      />
      <Text style={styles.hint}>
        Tip: use Settings → Base Compose for the shared stack, then pin a
        server here before Deploy.
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
  const { projectId, project, setProject, setError, canManage } =
    useProjectContext()
  const { handleUnauthorized } = useAuth()
  const [saving, setSaving] = useState(false)
  if (!project) return null

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
        onSave={(compose) =>
          persistProjectCompose({
            projectId,
            project,
            compose,
            setProject,
            setError,
            setSaving,
            handleUnauthorized,
          })
        }
        saving={saving}
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
  const { projectId, canManage } = useProjectContext()
  return (
    <ProjectPrincipalsSection projectId={projectId} canManage={canManage} />
  )
}

export function SettingsVariablesPanel() {
  const { orgId, projectId } = useProjectContext()
  return <ProjectVariablesSection orgId={orgId} projectId={projectId} />
}

export function SettingsNamingPanel() {
  const { projectId, project, setProject, setError, canManage } =
    useProjectContext()
  const { handleUnauthorized } = useAuth()
  const [saving, setSaving] = useState(false)
  if (!project) return null
  const value = project.options?.containerNaming ?? 'uuid'

  const save = async (containerNaming: 'uuid' | 'custom') => {
    if (value === containerNaming) return
    setSaving(true)
    setError(null)
    try {
      const options = buildProjectOptionsPatch(project, { containerNaming })
      await updateProject(projectId, { options })
      setProject({
        ...project,
        options: mergeProjectOptionsLocal(project.options, options),
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to save container naming',
      )
    } finally {
      setSaving(false)
    }
  }

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
    project,
    workspaces,
    canOwn,
    setProject,
    setError,
  } = useProjectContext()
  const { handleUnauthorized } = useAuth()
  const [saving, setSaving] = useState(false)
  if (!project) return null

  const sorted = [...workspaces].sort((a, b) =>
    (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id),
  )

  const move = async (workspaceId: string) => {
    if (workspaceId === project.workspaceId) return
    setSaving(true)
    setError(null)
    try {
      await updateProject(project.id, { workspaceId })
      setProject({ ...project, workspaceId })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to move project')
    } finally {
      setSaving(false)
    }
  }

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
  const { handleUnauthorized } = useAuth()
  const router = useRouter()
  if (!project) return null
  return (
    <ProjectDeletePanel
      project={project}
      onCancel={() => {
        router.push(`/${orgId}/projects/${project.id}/settings` as Href)
      }}
      onDeleted={() => {
        router.replace(`/${orgId}/projects` as Href)
      }}
      onUnauthorized={handleUnauthorized}
    />
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
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
