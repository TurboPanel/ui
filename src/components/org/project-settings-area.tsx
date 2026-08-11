import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { SectionPanel } from '@/components/org/section-panel'
import { StorageSection } from '@/components/org/storage-section'
import { VariablesSection } from '@/components/org/variables-section'
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
  useHostingsByServices,
  useOrgServers,
  useProjectPrincipals,
  useServices,
  useStorage,
  useUpdateEnvironment,
  useUpdateProject,
  useVariables,
} from '@/lib/queries'
import { userWorkspaces } from '@/lib/system-inventory'
import { chrome, colors, spacing } from '@/lib/theme'

type ProjectAddKind = 'server' | 'variables' | 'principals'
type EnvironmentAddKind = 'server' | 'networking' | 'storage'

function openAddKind<K extends string>(
  kind: K,
  setOpened: (updater: (current: ReadonlySet<K>) => ReadonlySet<K>) => void,
  setAddSeed: (
    updater: (
      current: Partial<Record<K, number>>,
    ) => Partial<Record<K, number>>,
  ) => void,
) {
  setOpened((current) => {
    if (current.has(kind)) return current
    const next = new Set(current)
    next.add(kind)
    return next
  })
  setAddSeed((current) => ({
    ...current,
    [kind]: (current[kind] ?? 0) + 1,
  }))
}

function serverDisplayLabel(server: OrgServerRecord): string {
  return (
    server.displayName?.trim() ||
    server.hostname?.trim() ||
    server.id.slice(0, 8)
  )
}

function AddChip({
  label,
  onPress,
  disabled,
}: Readonly<{
  label: string
  onPress: () => void
  disabled?: boolean
}>) {
  return (
    <Pressable
      style={[styles.addChip, disabled && styles.disabled, webPointer]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.addPlus}>+</Text>
      <Text style={styles.addLabel}>{label}</Text>
    </Pressable>
  )
}

function ResourceSection({
  title,
  hint,
  children,
}: Readonly<{
  title: string
  hint: string
  children: ReactNode
}>) {
  return (
    <SectionPanel title={title} hint={hint}>
      {children}
    </SectionPanel>
  )
}

function DangerSection({
  title,
  hint,
  expanded,
  onExpandedChange,
  children,
}: Readonly<{
  title: string
  hint: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  children: ReactNode
}>) {
  return (
    <SectionPanel
      title={title}
      hint={hint}
      headerRight={
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer, styles.chevronBtn]}
          onPress={() => onExpandedChange(!expanded)}
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

/**
 * Default `uuid` renames containers so multiple project instances can coexist
 * (and so rolling updates can run later). `custom` keeps compose names and
 * disables that path.
 */
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
  const keepOriginal = (project.options?.containerNaming ?? 'uuid') === 'custom'

  if (!canEdit) {
    return (
      <Text style={orgPanelStyles.detailLine}>
        {keepOriginal
          ? 'Keep original container names'
          : 'Rename containers (default)'}
      </Text>
    )
  }

  return (
    <View style={styles.namingBlock}>
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>Keep original container names</Text>
          <Text style={orgPanelStyles.muted}>
            By default TurboPanel renames containers so you can run multiple
            instances of this project.
          </Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: keepOriginal, disabled: saving }}
          accessibilityLabel="Keep original container names"
          disabled={saving}
          onPress={() => {
            onSave(keepOriginal ? 'uuid' : 'custom')
          }}
          style={[
            styles.toggle,
            keepOriginal ? styles.toggleOn : styles.toggleOff,
            saving && styles.disabled,
            webPointer,
          ]}
        >
          <Text style={styles.toggleText}>{keepOriginal ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>
      {keepOriginal ? (
        <View style={orgPanelStyles.calloutWarning}>
          <Text style={orgPanelStyles.calloutWarningText}>
            Keeping original names disables rolling updates. We rename
            containers by default so multiple instances of this project can run
            side by side.
          </Text>
        </View>
      ) : null}
      {saving ? <Text style={orgPanelStyles.muted}>Saving…</Text> : null}
    </View>
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

function AddToolbarRow<K extends string>({
  canEdit,
  pendingAdds,
  onOpen,
}: Readonly<{
  canEdit: boolean
  pendingAdds: readonly { kind: K; label: string }[]
  onOpen: (kind: K) => void
}>) {
  if (!canEdit || pendingAdds.length === 0) return null
  return (
    <View style={styles.addRow}>
      {pendingAdds.map((item) => (
        <AddChip
          key={item.kind}
          label={item.label}
          onPress={() => onOpen(item.kind)}
        />
      ))}
    </View>
  )
}

/**
 * Project-scope settings body for the scope-chip settings dropdown.
 * Add chips reveal resource sections; workspace, naming, and delete are always
 * available in the panel.
 */
export function ProjectSettingsPanel({
  onDeleted,
}: Readonly<{
  onDeleted?: () => void
}>) {
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
  const variablesQuery = useVariables(orgId, { projectId })
  const principalsQuery = useProjectPrincipals(orgId, projectId)
  const [opened, setOpened] = useState<ReadonlySet<ProjectAddKind>>(
    () => new Set(),
  )
  const [addSeed, setAddSeed] = useState<Partial<Record<ProjectAddKind, number>>>(
    {},
  )
  const [dangerExpanded, setDangerExpanded] = useState(false)
  const scopeHint = 'Applies to every environment'

  if (!project) return null

  if (!projectAllowsMutations) {
    return <Text style={orgPanelStyles.muted}>View only</Text>
  }

  const canEdit = canManage && projectAllowsMutations
  const canMove = canOwn && projectAllowsMutations
  const hasServer = Boolean(project.options?.defaultServerId)
  const hasVariables = (variablesQuery.data?.variables?.length ?? 0) > 0
  const hasPrincipals = (principalsQuery.data?.principals?.length ?? 0) > 0

  const showServer = hasServer || opened.has('server')
  const showVariables = hasVariables || opened.has('variables')
  const showPrincipals = hasPrincipals || opened.has('principals')

  const openKind = (kind: ProjectAddKind) => {
    openAddKind(kind, setOpened, setAddSeed)
  }

  const pendingAdds: { kind: ProjectAddKind; label: string }[] = []
  if (!showServer) pendingAdds.push({ kind: 'server', label: 'Add Server' })
  if (!showVariables) {
    pendingAdds.push({ kind: 'variables', label: 'Add Variable' })
  }
  if (!showPrincipals) {
    pendingAdds.push({ kind: 'principals', label: 'Add System user' })
  }

  return (
    <View style={styles.panelBody}>
      <AddToolbarRow
        canEdit={canEdit}
        pendingAdds={pendingAdds}
        onOpen={openKind}
      />

      {showServer ? (
        <ResourceSection title="Servers" hint={scopeHint}>
          {canEdit ? (
            <ProjectServerHeaderControl />
          ) : (
            <Text style={orgPanelStyles.muted}>View only</Text>
          )}
        </ResourceSection>
      ) : null}

      {showVariables ? (
        <ResourceSection title="Variables" hint={scopeHint}>
          <VariablesSection
            key={`variables-${addSeed.variables ?? 0}`}
            orgId={orgId}
            parentField={{ projectId }}
            embedded
            showPresets
            initialShowAdd={opened.has('variables') && !hasVariables}
          />
        </ResourceSection>
      ) : null}

      {showPrincipals ? (
        <ResourceSection title="System users" hint={scopeHint}>
          <ProjectPrincipalsSection
            orgId={orgId}
            projectId={projectId}
            canManage={canManage && projectAllowsMutations}
            embedded
          />
        </ResourceSection>
      ) : null}

      <SectionPanel
        title="Workspace"
        hint="Which workspace this project belongs to — not per service"
      >
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
      </SectionPanel>

      <SectionPanel title="Container naming" hint={scopeHint}>
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
      </SectionPanel>

      <DangerSection
        title="Danger → Delete project"
        hint={scopeHint}
        expanded={dangerExpanded}
        onExpandedChange={setDangerExpanded}
      >
        {canOwn && projectAllowsMutations ? (
          <ProjectDeletePanel
            orgId={orgId}
            project={project}
            onCancel={() => setDangerExpanded(false)}
            onDeleted={() => {
              onDeleted?.()
              router.replace(`/${orgId}/projects` as Href)
            }}
          />
        ) : (
          <Text style={orgPanelStyles.muted}>View only</Text>
        )}
      </DangerSection>
    </View>
  )
}

function EnvironmentDeleteControl({
  selectedEnvironment,
  onOpenProjectSettings,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
  onOpenProjectSettings?: () => void
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
          onPress={onOpenProjectSettings}
          disabled={!onOpenProjectSettings}
          accessibilityRole="button"
          accessibilityLabel="Open Project settings to delete the project"
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            Only environment — delete the project under Project settings (gear)
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

function EnvironmentServerPinBody({
  selectedEnvironment,
  canEdit,
  inheritLabel,
  servers,
  saving,
  onSelect,
  onClear,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
  canEdit: boolean
  inheritLabel: string
  servers: OrgServerRecord[]
  saving: boolean
  onSelect: (serverId: string) => void
  onClear: () => void
}>) {
  if (!canEdit) {
    return <Text style={orgPanelStyles.muted}>View only</Text>
  }
  return (
    <>
      {!selectedEnvironment.serverId ? (
        <Text style={orgPanelStyles.muted}>{inheritLabel}</Text>
      ) : null}
      <ServerPinSelect
        label="Server"
        hint="Pin a server for this environment, or clear to inherit the project default."
        placementServerId={selectedEnvironment.serverId}
        servers={servers}
        saving={saving}
        allowClear={Boolean(selectedEnvironment.serverId)}
        onSelect={onSelect}
        onClear={onClear}
      />
    </>
  )
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

/**
 * Environment-scope settings body for the scope-chip settings dropdown.
 * Add chips reveal resource sections; delete is always available.
 */
export function EnvironmentSettingsPanel({
  selectedEnvironment,
  onOpenProjectSettings,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
  onOpenProjectSettings?: () => void
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
  const [opened, setOpened] = useState<ReadonlySet<EnvironmentAddKind>>(
    () => new Set(focusHostingId ? (['networking'] as EnvironmentAddKind[]) : []),
  )
  const [addSeed, setAddSeed] = useState<Partial<Record<EnvironmentAddKind, number>>>(
    {},
  )
  const [dangerExpanded, setDangerExpanded] = useState(false)
  const serversQuery = useOrgServers(orgId)
  const servicesQuery = useServices(orgId, selectedEnvironment.id)
  const serviceIds = useMemo(
    () => (servicesQuery.data?.services ?? []).map((service) => service.id),
    [servicesQuery.data?.services],
  )
  const hostingsQuery = useHostingsByServices(orgId, serviceIds)
  const storageQuery = useStorage(orgId, {
    environmentId: selectedEnvironment.id,
  })
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
  const hasServer = Boolean(selectedEnvironment.serverId)
  const hasNetworking = useMemo(
    () =>
      Object.values(hostingsQuery.hostingsByService).some(
        (rows) => rows.length > 0,
      ),
    [hostingsQuery.hostingsByService],
  )
  const hasStorage = (storageQuery.data?.storage?.length ?? 0) > 0

  useEffect(() => {
    if (!focusHostingId) return
    setOpened((current) => {
      if (current.has('networking')) return current
      const next = new Set(current)
      next.add('networking')
      return next
    })
  }, [focusHostingId])

  if (!projectAllowsMutations) {
    return <Text style={orgPanelStyles.muted}>View only</Text>
  }

  const showServer = hasServer || opened.has('server')
  const showNetworking =
    hasNetworking || Boolean(focusHostingId) || opened.has('networking')
  const showStorage = hasStorage || opened.has('storage')

  const openKind = (kind: EnvironmentAddKind) => {
    openAddKind(kind, setOpened, setAddSeed)
  }

  const pendingAdds: { kind: EnvironmentAddKind; label: string }[] = []
  if (!showServer) pendingAdds.push({ kind: 'server', label: 'Add Server' })
  if (!showNetworking) {
    pendingAdds.push({ kind: 'networking', label: 'Add Network' })
  }
  if (!showStorage) {
    pendingAdds.push({ kind: 'storage', label: 'Add Storage' })
  }

  return (
    <View style={styles.panelBody}>
      <AddToolbarRow
        canEdit={canEdit}
        pendingAdds={pendingAdds}
        onOpen={openKind}
      />

      {showServer ? (
        <ResourceSection title="Server" hint={scopeHint}>
          <EnvironmentServerPinBody
            selectedEnvironment={selectedEnvironment}
            canEdit={canEdit}
            inheritLabel={inheritLabel}
            servers={servers}
            saving={updateEnvironment.isPending}
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
        </ResourceSection>
      ) : null}

      {showNetworking ? (
        <EnvironmentDetailBody
          orgId={orgId}
          projectId={projectId}
          environmentId={selectedEnvironment.id}
          embedded
          showComposeOverlay={false}
          sections={['hosting']}
          focusHostingId={focusHostingId}
        />
      ) : null}

      {showStorage ? (
        <ResourceSection title="Storage" hint={scopeHint}>
          {canEdit ? (
            <StorageSection
              key={`storage-${addSeed.storage ?? 0}`}
              orgId={orgId}
              environmentId={selectedEnvironment.id}
              defaultServerId={resolveEffectiveServerId(
                selectedEnvironment.serverId,
                project?.options?.defaultServerId,
              )}
              embedded
              initialShowAdd={opened.has('storage') && !hasStorage}
            />
          ) : (
            <Text style={orgPanelStyles.muted}>View only</Text>
          )}
        </ResourceSection>
      ) : null}

      <DangerSection
        title="Danger → Delete environment"
        hint={scopeHint}
        expanded={dangerExpanded}
        onExpandedChange={setDangerExpanded}
      >
        <EnvironmentDeleteControl
          selectedEnvironment={selectedEnvironment}
          onOpenProjectSettings={onOpenProjectSettings}
        />
      </DangerSection>
    </View>
  )
}

/** Parse `?hostingId=` for auto-opening environment settings. */
export function readHostingIdParam(
  value: string | string[] | undefined,
): string | null {
  return readFocusHostingId(value)
}

const styles = StyleSheet.create({
  panelBody: {
    width: '100%',
    gap: spacing.md,
  },
  addRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    minWidth: 44,
  },
  addPlus: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 16,
  },
  addLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  namingBlock: {
    gap: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  toggle: {
    minWidth: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: chrome.accent,
  },
  toggleOff: {
    backgroundColor: colors.border,
  },
  toggleText: {
    color: colors.text,
    fontSize: 13,
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
