import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router'
import { HeaderChevron } from '@/components/header-chevron'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { ProjectPrincipalsSection } from '@/components/org/project-detail-section'
import { useProjectContext } from '@/components/org/project/project-context'
import { ProjectServerHeaderControl } from '@/components/org/project/project-server-pin'
import { ServerPinSelect } from '@/components/org/project/server-pin-select'
import { ProjectVariablesSection } from '@/components/org/project-variables-section'
import { SectionPanel } from '@/components/org/section-panel'
import { StorageSection } from '@/components/org/storage-section'
import type {
  EnvironmentRecord,
  OrgServerRecord,
  ProjectRecord,
  WorkspaceRecord,
} from '@/lib/instance-api'
import {
  parseProjectEnvironmentId,
  projectOverviewHref,
} from '@/lib/project-navigation'
import {
  buildProjectOptionsPatch,
  resolveEffectiveServerId,
} from '@/lib/project-options'
import {
  useDeleteEnvironment,
  useOrgServers,
  useUpdateEnvironment,
  useUpdateProject,
} from '@/lib/queries'
import { userWorkspaces } from '@/lib/system-inventory'
import { chrome, colors, spacing } from '@/lib/theme'

function serverDisplayLabel(server: OrgServerRecord): string {
  return (
    server.displayName?.trim() ||
    server.hostname?.trim() ||
    server.id.slice(0, 8)
  )
}

function SettingsSectionRow({
  title,
  scopeHint,
  expanded: controlledExpanded,
  onExpandedChange,
  children,
}: Readonly<{
  title: string
  scopeHint: string
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  children: ReactNode
}>) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false)
  const expanded = controlledExpanded ?? uncontrolledExpanded
  const setExpanded = (next: boolean) => {
    if (onExpandedChange) {
      onExpandedChange(next)
      return
    }
    setUncontrolledExpanded(next)
  }

  return (
    <SectionPanel
      title={title}
      hint={scopeHint}
      headerRight={
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer, styles.chevronBtn]}
          onPress={() => setExpanded(!expanded)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? `Collapse ${title}` : `Expand ${title}`}
        >
          <HeaderChevron size={12} color={colors.textMuted} open={expanded} />
        </Pressable>
      }
    >
      {expanded ? children : null}
    </SectionPanel>
  )
}

function ContainerNamingBody({
  project,
  canEdit,
  saving,
  onSave,
}: Readonly<{
  project: ProjectRecord
  canEdit: boolean
  saving: boolean
  onSave: (containerNaming: 'uuid' | 'custom') => void
}>) {
  const value = project.options?.containerNaming ?? 'uuid'
  if (!canEdit) {
    return (
      <Text style={orgPanelStyles.detailLine}>
        {value === 'custom' ? 'Custom' : 'UUID'}
      </Text>
    )
  }
  return (
    <>
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
                if (value === option.mode) return
                onSave(option.mode)
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
      {saving ? <Text style={orgPanelStyles.muted}>Saving…</Text> : null}
    </>
  )
}

function WorkspaceMoveBody({
  project,
  workspaces,
  canMove,
  saving,
  onMove,
}: Readonly<{
  project: ProjectRecord
  workspaces: readonly WorkspaceRecord[]
  canMove: boolean
  saving: boolean
  onMove: (workspaceId: string) => void
}>) {
  const sorted = [...workspaces].sort((a, b) =>
    (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id),
  )
  if (!canMove) {
    return (
      <Text style={orgPanelStyles.detailLine}>
        {sorted.find((ws) => ws.id === project.workspaceId)?.displayName ??
          project.workspaceId}
      </Text>
    )
  }
  return (
    <>
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
              onPress={() => onMove(ws.id)}
              accessibilityRole="button"
              accessibilityLabel={`Move to ${label}`}
            >
              <Text style={styles.rowTitle}>{label}</Text>
            </Pressable>
          )
        })}
      </View>
      {saving ? <Text style={orgPanelStyles.muted}>Moving…</Text> : null}
    </>
  )
}

function ProjectSettingsSections() {
  const {
    orgId,
    projectId,
    project,
    workspaces,
    canOwn,
    canManage,
    projectAllowsMutations,
    setError,
  } = useProjectContext()
  const router = useRouter()
  const updateProjectMutation = useUpdateProject(orgId, projectId)
  const [dangerExpanded, setDangerExpanded] = useState(false)
  const scopeHint = 'Applies to every environment'

  if (!project) return null

  const canEdit = canManage && projectAllowsMutations
  const canMove = canOwn && projectAllowsMutations

  return (
    <>
      <SettingsSectionRow title="Servers" scopeHint={scopeHint}>
        {canEdit ? (
          <ProjectServerHeaderControl />
        ) : (
          <Text style={orgPanelStyles.muted}>View only</Text>
        )}
      </SettingsSectionRow>

      <SettingsSectionRow title="Variables" scopeHint={scopeHint}>
        <ProjectVariablesSection orgId={orgId} projectId={projectId} />
      </SettingsSectionRow>

      <SettingsSectionRow title="Container naming" scopeHint={scopeHint}>
        <ContainerNamingBody
          project={project}
          canEdit={canEdit}
          saving={updateProjectMutation.isPending}
          onSave={(containerNaming) => {
            void (async () => {
              setError(null)
              const options = buildProjectOptionsPatch(project, {
                containerNaming,
              })
              const result = await updateProjectMutation.run({ options })
              if (!result.ok && updateProjectMutation.actionError) {
                setError(updateProjectMutation.actionError)
              }
            })()
          }}
        />
      </SettingsSectionRow>

      <SettingsSectionRow title="Workspace" scopeHint={scopeHint}>
        <WorkspaceMoveBody
          project={project}
          workspaces={userWorkspaces(workspaces)}
          canMove={canMove}
          saving={updateProjectMutation.isPending}
          onMove={(workspaceId) => {
            void (async () => {
              setError(null)
              const result = await updateProjectMutation.run({ workspaceId })
              if (!result.ok && updateProjectMutation.actionError) {
                setError(updateProjectMutation.actionError)
              }
            })()
          }}
        />
      </SettingsSectionRow>

      <SettingsSectionRow title="System users" scopeHint={scopeHint}>
        <ProjectPrincipalsSection
          orgId={orgId}
          projectId={projectId}
          canManage={canManage && projectAllowsMutations}
        />
      </SettingsSectionRow>

      <SettingsSectionRow
        title="Danger → Delete project"
        scopeHint={scopeHint}
        expanded={dangerExpanded}
        onExpandedChange={setDangerExpanded}
      >
        {canOwn && projectAllowsMutations ? (
          <ProjectDeletePanel
            orgId={orgId}
            project={project}
            onCancel={() => setDangerExpanded(false)}
            onDeleted={() => {
              router.replace(`/${orgId}/projects` as Href)
            }}
          />
        ) : (
          <Text style={orgPanelStyles.muted}>View only</Text>
        )}
      </SettingsSectionRow>
    </>
  )
}

function EnvironmentDeleteControl({
  selectedEnvironment,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const {
    orgId,
    projectId,
    environments,
    canOwn,
    setError,
    invalidateEnvironments,
    selectBaseCompose,
  } = useProjectContext()
  const deleteEnvironment = useDeleteEnvironment(orgId)
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    setArmed(false)
  }, [selectedEnvironment.id, environments.length])

  if (!canOwn) {
    return <Text style={orgPanelStyles.muted}>View only</Text>
  }

  if (environments.length <= 1) {
    return (
      <View style={styles.dangerRow}>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            styles.disabled,
            webPointer,
          ]}
          disabled
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          accessibilityLabel="Delete this environment"
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            Delete environment
          </Text>
        </Pressable>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={selectBaseCompose}
          accessibilityRole="link"
          accessibilityLabel="Open Project settings to delete the project"
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            Only environment — delete the project in Project settings → Danger
          </Text>
        </Pressable>
      </View>
    )
  }

  const removing = deleteEnvironment.isPending

  const handlePress = () => {
    if (removing) return
    if (!armed) {
      setArmed(true)
      return
    }
    void (async () => {
      setError(null)
      const deletedId = selectedEnvironment.id
      const result = await deleteEnvironment.run(deletedId)
      if (!result.ok) {
        if (deleteEnvironment.actionError) {
          setError(deleteEnvironment.actionError)
        }
        return
      }
      setArmed(false)
      await invalidateEnvironments()
      if (parseProjectEnvironmentId(pathname, projectId) === deletedId) {
        router.replace(projectOverviewHref(orgId, projectId) as Href)
      }
    })()
  }

  return (
    <View style={styles.dangerRow}>
      {armed ? (
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={() => setArmed(false)}
          accessibilityRole="button"
          accessibilityLabel="Cancel delete"
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={[
          orgPanelStyles.toolbarBtnSecondary,
          armed && styles.dangerArmed,
          removing && styles.disabled,
          webPointer,
        ]}
        onPress={handlePress}
        disabled={removing}
        accessibilityRole="button"
        accessibilityLabel={
          armed ? 'Confirm delete this environment' : 'Delete this environment'
        }
      >
        <Text
          style={[
            orgPanelStyles.toolbarBtnTextSecondary,
            armed && styles.dangerArmedText,
          ]}
        >
          {armed
            ? `Delete ${selectedEnvironment.displayName?.trim() || 'environment'}?`
            : 'Delete environment'}
        </Text>
      </Pressable>
    </View>
  )
}

function resolveInheritServerLabel(
  inheritedServer: OrgServerRecord | undefined,
  projectDefaultServerId: string | null,
): string {
  if (inheritedServer) {
    return `Inheriting project server: ${serverDisplayLabel(inheritedServer)}`
  }
  if (projectDefaultServerId) {
    return 'Inheriting project server'
  }
  return 'No project server set — pick a server for this environment'
}

function readFocusHostingId(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === 'string' && first.length > 0 ? first : null
  }
  return null
}

function EnvironmentSettingsSections({
  selectedEnvironment,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
}>) {
  const {
    orgId,
    projectId,
    project,
    canManage,
    projectAllowsMutations,
    setError,
  } = useProjectContext()
  const { hostingId: hostingIdParam } = useLocalSearchParams<{
    hostingId?: string | string[]
  }>()
  const focusHostingId = readFocusHostingId(hostingIdParam)
  const [networkingExpanded, setNetworkingExpanded] = useState(
    Boolean(focusHostingId),
  )
  const serversQuery = useOrgServers(orgId)
  const updateEnvironment = useUpdateEnvironment(
    orgId,
    selectedEnvironment.id,
  )
  const scopeHint = 'This environment only'
  const canEdit = canManage && projectAllowsMutations
  const servers = serversQuery.data?.servers ?? []
  const projectDefaultServerId = project?.options?.defaultServerId ?? null
  const inheritedServer = projectDefaultServerId
    ? servers.find((server) => server.id === projectDefaultServerId)
    : undefined
  const inheritLabel = resolveInheritServerLabel(
    inheritedServer,
    projectDefaultServerId,
  )

  useEffect(() => {
    if (focusHostingId) setNetworkingExpanded(true)
  }, [focusHostingId])

  return (
    <>
      <SettingsSectionRow title="Server" scopeHint={scopeHint}>
        {canEdit ? (
          <>
            {!selectedEnvironment.serverId ? (
              <Text style={orgPanelStyles.muted}>{inheritLabel}</Text>
            ) : null}
            <ServerPinSelect
              label="Server"
              hint="Pin a server for this environment, or clear to inherit the project default."
              placementServerId={selectedEnvironment.serverId}
              servers={servers}
              saving={updateEnvironment.isPending}
              allowClear={Boolean(selectedEnvironment.serverId)}
              onSelect={(serverId) => {
                void (async () => {
                  setError(null)
                  const result = await updateEnvironment.run({ serverId })
                  if (!result.ok && updateEnvironment.actionError) {
                    setError(updateEnvironment.actionError)
                  }
                })()
              }}
              onClear={() => {
                void (async () => {
                  setError(null)
                  const result = await updateEnvironment.run({
                    serverId: null,
                  })
                  if (!result.ok && updateEnvironment.actionError) {
                    setError(updateEnvironment.actionError)
                  }
                })()
              }}
            />
          </>
        ) : (
          <Text style={orgPanelStyles.muted}>View only</Text>
        )}
      </SettingsSectionRow>

      <SettingsSectionRow
        title="Networking"
        scopeHint={scopeHint}
        expanded={networkingExpanded}
        onExpandedChange={setNetworkingExpanded}
      >
        <EnvironmentDetailBody
          orgId={orgId}
          projectId={projectId}
          environmentId={selectedEnvironment.id}
          embedded
          showComposeOverlay={false}
          sections={['hosting']}
          focusHostingId={focusHostingId}
        />
      </SettingsSectionRow>

      <SettingsSectionRow title="Storage" scopeHint={scopeHint}>
        {canEdit ? (
          <StorageSection
            orgId={orgId}
            environmentId={selectedEnvironment.id}
            defaultServerId={resolveEffectiveServerId(
              selectedEnvironment.serverId,
              project?.options?.defaultServerId,
            )}
          />
        ) : (
          <Text style={orgPanelStyles.muted}>View only</Text>
        )}
      </SettingsSectionRow>

      <SettingsSectionRow title="Danger → Delete environment" scopeHint={scopeHint}>
        <EnvironmentDeleteControl selectedEnvironment={selectedEnvironment} />
      </SettingsSectionRow>
    </>
  )
}

/**
 * Scope-aware project / environment settings list on the compose Overview.
 * Collapsed by default; bodies reuse existing panels and hooks.
 */
export function ProjectSettingsArea() {
  const {
    project,
    baseSelected,
    selectedEnvironment,
    isSystemProject,
    projectAllowsMutations,
  } = useProjectContext()

  if (!project || isSystemProject) return null

  if (!projectAllowsMutations) {
    return (
      <View style={styles.root}>
        <Text style={styles.header}>Settings</Text>
        <Text style={orgPanelStyles.muted}>View only</Text>
      </View>
    )
  }

  const header = baseSelected
    ? 'Project settings — applies to every environment'
    : `${selectedEnvironment?.displayName?.trim() || 'Environment'} settings — this environment only`

  let body: ReactNode
  if (baseSelected) {
    body = <ProjectSettingsSections />
  } else if (selectedEnvironment) {
    body = (
      <EnvironmentSettingsSections selectedEnvironment={selectedEnvironment} />
    )
  } else {
    body = <Text style={orgPanelStyles.muted}>Select an environment.</Text>
  }

  return (
    <View style={styles.root}>
      <Text style={styles.header} accessibilityRole="header">
        {header}
      </Text>
      {body}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.md,
  },
  header: {
    color: colors.textTitle,
    fontSize: 15,
    fontWeight: '600',
  },
  chevronBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
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
  rowSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.55 },
  dangerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dangerArmed: {
    borderColor: colors.error,
  },
  dangerArmedText: {
    color: colors.error,
  },
})
