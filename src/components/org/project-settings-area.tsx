import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { panelStyles } from '@/components/ui/panel-styles'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  Button,
  ButtonRow,
  ConfirmButton,
  SectionPanel,
  SettingRow,
  Toggle,
} from '@/components/ui'
import { VariablesSection } from '@/components/org/variables-section'
import type {
  EnvironmentRecord,
  ProjectRecord,
  WorkspaceRecord,
} from '@/lib/instance-api'
import {
  parseProjectEnvironmentId,
  projectOverviewHref,
} from '@/lib/project-navigation'
import { buildProjectOptionsPatch } from '@/lib/project-options'
import {
  useDeleteEnvironment,
  useUpdateProject,
  useVariables,
} from '@/lib/queries'
import { userWorkspaces } from '@/lib/system-inventory'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

type ProjectAddKind = 'variables'
type EnvironmentAddKind = 'variables'

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
      <Text style={panelStyles.detailLine}>
        {keepOriginal
          ? 'Keep original container names'
          : 'Rename containers (default)'}
      </Text>
    )
  }

  return (
    <View style={styles.namingBlock}>
      <SettingRow
        label="Keep original container names"
        description="By default TurboPanel renames containers so you can run multiple instances of this project."
      >
        <Toggle
          value={keepOriginal}
          busy={saving}
          accessibilityLabel="Keep original container names"
          onValueChange={(next) => onSave(next ? 'custom' : 'uuid')}
        />
      </SettingRow>
      {keepOriginal ? (
        <View style={panelStyles.calloutWarning}>
          <Text style={panelStyles.calloutWarningText}>
            Keeping original names disables rolling updates. We rename
            containers by default so multiple instances of this project can run
            side by side.
          </Text>
        </View>
      ) : null}
      {saving ? <Text style={panelStyles.muted}>Saving…</Text> : null}
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
    (a.name ?? a.id).localeCompare(b.name ?? b.id),
  )
  if (!canMove) {
    return (
      <Text style={panelStyles.detailLine}>
        {sorted.find((ws) => ws.id === project.workspaceId)?.name ??
          project.workspaceId}
      </Text>
    )
  }
  return (
    <>
      <View style={styles.list}>
        {sorted.map((ws) => {
          const selected = ws.id === project.workspaceId
          const label = ws.name?.trim() || 'Workspace'
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
      {saving ? <Text style={panelStyles.muted}>Moving…</Text> : null}
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
 * Project-scope settings body for the Settings tab.
 * Add chips reveal resource sections; workspace, naming, and delete are always
 * available. Server placement is the Servers tab; storage is the Storage tab.
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
  const [opened, setOpened] = useState<ReadonlySet<ProjectAddKind>>(
    () => new Set(),
  )
  const [addSeed, setAddSeed] = useState<Partial<Record<ProjectAddKind, number>>>(
    {},
  )
  // Bumped to remount the collapsed danger panel (cancel re-collapses it).
  const [dangerSeed, setDangerSeed] = useState(0)
  const scopeHint = 'Applies to every environment'

  if (!project) return null

  if (!projectAllowsMutations) {
    return <Text style={panelStyles.muted}>View only</Text>
  }

  const canEdit = canManage && projectAllowsMutations
  const canMove = canOwn && projectAllowsMutations
  const hasVariables = (variablesQuery.data?.variables?.length ?? 0) > 0

  const showVariables = hasVariables || opened.has('variables')

  const openKind = (kind: ProjectAddKind) => {
    openAddKind(kind, setOpened, setAddSeed)
  }

  const pendingAdds: { kind: ProjectAddKind; label: string }[] = []
  if (!showVariables) {
    pendingAdds.push({ kind: 'variables', label: 'Add Variable' })
  }

  return (
    <View style={styles.panelBody}>
      <AddToolbarRow
        canEdit={canEdit}
        pendingAdds={pendingAdds}
        onOpen={openKind}
      />

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

      <SectionPanel
        key={`danger-${dangerSeed}`}
        title="Danger → Delete project"
        hint={scopeHint}
        collapsible
        defaultCollapsed
      >
        {canOwn && projectAllowsMutations ? (
          <ProjectDeletePanel
            orgId={orgId}
            project={project}
            onCancel={() => setDangerSeed((seed) => seed + 1)}
            onDeleted={() => {
              onDeleted?.()
              router.replace(`/${orgId}/projects` as Href)
            }}
          />
        ) : (
          <Text style={panelStyles.muted}>View only</Text>
        )}
      </SectionPanel>
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

  if (!canOwn) {
    return <Text style={panelStyles.muted}>View only</Text>
  }

  if (environments.length <= 1) {
    return (
      <ButtonRow>
        <Button
          label="Delete environment"
          variant="secondary"
          size="sm"
          disabled
          accessibilityLabel="Delete this environment"
          onPress={() => {}}
        />
        <Pressable
          style={[panelStyles.toolbarBtnSecondary, webPointer]}
          onPress={onOpenProjectSettings}
          disabled={!onOpenProjectSettings}
          accessibilityRole="button"
          accessibilityLabel="Open Project settings to delete the project"
        >
          <Text style={panelStyles.toolbarBtnTextSecondary}>
            Only environment — delete the project from Project → Settings
          </Text>
        </Pressable>
      </ButtonRow>
    )
  }

  const removing = deleteEnvironment.isPending

  const handleDelete = () => {
    if (removing) return
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
      await invalidateEnvironments()
      if (parseProjectEnvironmentId(pathname, projectId) === deletedId) {
        router.replace(projectOverviewHref(orgId, projectId) as Href)
      }
    })()
  }

  return (
    <ConfirmButton
      key={`${selectedEnvironment.id}:${environments.length}`}
      label="Delete environment"
      prompt={`Delete ${selectedEnvironment.name?.trim() || 'environment'}?`}
      confirmLabel="Delete environment"
      busy={removing}
      onConfirm={handleDelete}
    />
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
 * Environment-scope settings body for the Settings tab.
 * Storage, Hosting, and Servers are their own surface tabs; what is left is
 * what only this environment owns — its variable overrides, and deleting it.
 */
export function EnvironmentSettingsPanel({
  selectedEnvironment,
  onOpenProjectSettings,
}: Readonly<{
  selectedEnvironment: EnvironmentRecord
  onOpenProjectSettings?: () => void
}>) {
  const { orgId, canManage, projectAllowsMutations } = useProjectContext()
  const variablesQuery = useVariables(orgId, {
    environmentId: selectedEnvironment.id,
  })
  const [opened, setOpened] = useState<ReadonlySet<EnvironmentAddKind>>(
    () => new Set(),
  )
  const [addSeed, setAddSeed] = useState<
    Partial<Record<EnvironmentAddKind, number>>
  >({})
  const scopeHint = 'This environment only'
  const canEdit = canManage && projectAllowsMutations
  const hasVariables = (variablesQuery.data?.variables?.length ?? 0) > 0
  const showVariables = hasVariables || opened.has('variables')

  if (!projectAllowsMutations) {
    return <Text style={panelStyles.muted}>View only</Text>
  }

  const pendingAdds: { kind: EnvironmentAddKind; label: string }[] = []
  if (!showVariables) {
    pendingAdds.push({ kind: 'variables', label: 'Add Variable' })
  }

  return (
    <View style={styles.panelBody}>
      <AddToolbarRow
        canEdit={canEdit}
        pendingAdds={pendingAdds}
        onOpen={(kind) => {
          openAddKind(kind, setOpened, setAddSeed)
        }}
      />

      {showVariables ? (
        <ResourceSection title="Variables" hint={scopeHint}>
          <VariablesSection
            key={`variables-${addSeed.variables ?? 0}`}
            orgId={orgId}
            parentField={{ environmentId: selectedEnvironment.id }}
            embedded
            showPresets
            initialShowAdd={opened.has('variables') && !hasVariables}
          />
        </ResourceSection>
      ) : null}

      <SectionPanel
        title="Danger → Delete environment"
        hint={scopeHint}
        collapsible
        defaultCollapsed
      >
        <EnvironmentDeleteControl
          selectedEnvironment={selectedEnvironment}
          onOpenProjectSettings={onOpenProjectSettings}
        />
      </SectionPanel>
    </View>
  )
}

/** Parse `?hostingId=` for focusing a hosting row on the Hosting tab. */
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
    borderRadius: 8,
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
})
