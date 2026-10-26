import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ConfirmButton, LoadingState, TextField } from '@/components/ui'
import {
  MANAGED_RUNTIME_PRESENT_ERROR,
  type CommandStatusRecord,
  type DeletePlan,
  type EnvironmentRecord,
  type ProjectRecord,
} from '@/lib/instance-api'
import {
  commandStatusById,
  isTerminalCommandStatus,
  useCommandsBatch,
  useDeleteEnvironmentManagedMutation,
  useDeleteProject,
  useEnvironments,
  useOrganizationManaged,
  useProjectDeletePreview,
  type TrackedCommandEntry,
} from '@/lib/queries'
import { DeletePlanList } from '@/components/org/delete-plan-list'
import { deleteFailureMessage } from '@/lib/delete-plan'
import { commandErrorLine } from '@/lib/command-error'
import { orEmptyArray } from '@/lib/or-empty-array'
import type { ManagedListRecord } from '@/lib/managed-services'
import { isManagedProject } from '@/lib/project-navigation'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

type EnvStopRow = {
  environment: EnvironmentRecord
  activeCount: number
  serverId: string | null
  stopping: boolean
  status: string | null
  error: string | null
}

type StopRowState = {
  stopping: boolean
  status: string | null
  error: string | null
  serverId: string | null
}

function withStopState(
  environment: EnvironmentRecord,
  activeCount: number,
  serverId: string | null,
  stopState: StopRowState | undefined,
): EnvStopRow {
  return {
    environment,
    activeCount,
    serverId: stopState?.serverId ?? serverId,
    stopping: stopState?.stopping ?? false,
    status: stopState?.status ?? null,
    error: stopState?.error ?? null,
  }
}

function collectManagedDeleteRows(
  projectId: string,
  environments: readonly EnvironmentRecord[],
  orgManaged: readonly ManagedListRecord[],
  stopRows: Record<string, StopRowState>,
): EnvStopRow[] {
  const environmentsById = new Map(
    environments.map((environment) => [environment.id, environment]),
  )
  const rows: EnvStopRow[] = []
  for (const cluster of orgManaged) {
    if (cluster.projectId !== projectId || !cluster.environmentId) continue
    const environment = environmentsById.get(cluster.environmentId)
    if (!environment) continue
    rows.push(
      withStopState(
        environment,
        1,
        cluster.serverId ?? environment.serverId,
        stopRows[environment.id],
      ),
    )
  }
  return rows
}

function sortEnvStopRows(rows: EnvStopRow[]): EnvStopRow[] {
  return rows.sort((a, b) =>
    environmentLabel(a.environment).localeCompare(
      environmentLabel(b.environment),
    ),
  )
}

function environmentLabel(environment: EnvironmentRecord): string {
  return environment.name?.trim() || 'Unnamed environment'
}

function projectConfirmName(project: ProjectRecord): string {
  return project.name?.trim() || 'Unnamed project'
}

type StopStepCopy = Readonly<{
  stepLabel: string
  stepCopy: string
  countLabel: (count: number) => string
  actionLabel: string
  actionBusyLabel: string
  /** The second press: the action destroys data, so it always confirms. */
  confirmLabel: string
  confirmPrompt: string
}>

export const MANAGED_DESTROY_COPY: StopStepCopy = {
  stepLabel: 'Destroy databases',
  stepCopy:
    'Destroy every managed database before the project can be deleted. This stops the containers and removes their data volumes.',
  countLabel: () => 'Still running on the server',
  actionLabel: 'Destroy database',
  actionBusyLabel: 'Destroying…',
  confirmLabel: 'Destroy it',
  confirmPrompt: 'Destroy the databases in this environment and their data?',
}

export function StopStepSection({
  envRows,
  onStop,
  onForceDestroy,
  copy,
}: Readonly<{
  envRows: EnvStopRow[]
  onStop: (environmentId: string) => void
  onForceDestroy?: (environmentId: string) => void
  copy: StopStepCopy
}>) {
  return (
    <View style={styles.section}>
      <Text style={styles.stepLabel}>{copy.stepLabel}</Text>
      <Text style={styles.stepCopy}>{copy.stepCopy}</Text>
      <View style={styles.envList}>
        {envRows.map((row) => (
          <View key={row.environment.id} style={styles.envRow}>
            <View style={styles.envInfo}>
              <Text style={styles.envName}>
                {environmentLabel(row.environment)}
              </Text>
              <Text style={panelStyles.muted}>
                {copy.countLabel(row.activeCount)}
              </Text>
              {row.status ? (
                <Text style={panelStyles.muted}>{row.status}</Text>
              ) : null}
              {row.error ? (
                <Text style={panelStyles.error}>{row.error}</Text>
              ) : null}
            </View>
            <View style={styles.envActions}>
              <ConfirmButton
                label={row.stopping ? copy.actionBusyLabel : copy.actionLabel}
                confirmLabel={copy.confirmLabel}
                prompt={copy.confirmPrompt}
                busy={row.stopping}
                onConfirm={() => onStop(row.environment.id)}
              />
              {row.error && onForceDestroy ? (
                <ConfirmButton
                  label="Force destroy"
                  confirmLabel="Confirm force"
                  prompt="Removes the database records immediately and tears down what it can. Leftover containers on unreachable servers must be cleaned up manually."
                  onConfirm={() => onForceDestroy(row.environment.id)}
                />
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function ConfirmStepSection({
  plan,
  confirmName,
  confirmText,
  onConfirmTextChange,
  deleteError,
  deleting,
}: Readonly<{
  plan: DeletePlan | undefined
  confirmName: string
  confirmText: string
  onConfirmTextChange: (value: string) => void
  deleteError: string | null
  deleting: boolean
}>) {
  return (
    <View style={styles.section}>
      <Text style={styles.stepLabel}>What will be removed</Text>
      {plan ? <DeletePlanList plan={plan} /> : null}
      <Text style={styles.stepLabel}>Confirm deletion</Text>
      <Text style={styles.stepCopy}>
        Type <Text style={styles.confirmName}>{confirmName}</Text> to
        permanently delete this project.
      </Text>
      <TextField
        label="Project name"
        value={confirmText}
        onChangeText={onConfirmTextChange}
        placeholder={confirmName}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!deleting}
      />
      {deleteError ? <Text style={panelStyles.error}>{deleteError}</Text> : null}
    </View>
  )
}

function isProjectDeleteLoading(input: Readonly<{
  managedProject: boolean
  environmentsLoading: boolean
  orgManagedLoading: boolean
  previewLoading: boolean
}>): boolean {
  if (input.environmentsLoading || input.previewLoading) return true
  return input.managedProject && input.orgManagedLoading
}

function canConfirmProjectDelete(input: Readonly<{
  hasActiveServices: boolean
  blocked: boolean
  confirmText: string
  confirmName: string
  deleting: boolean
  loading: boolean
}>): boolean {
  if (input.hasActiveServices || input.blocked || input.deleting || input.loading) return false
  return input.confirmText.trim() === input.confirmName
}

function projectDeleteWarning(managedProject: boolean): string {
  if (managedProject) {
    return 'This is permanent and cannot be undone. Destroying a database removes its containers and data volumes on the server, then deletes the project.'
  }
  return 'This is permanent and cannot be undone. Deleting stops every environment, then removes its services, domains, variables and folders on your servers, and the Hosting Accounts nothing else uses. Volumes set to keep their data stay.'
}

function DeletePanelBody({
  loading,
  managedProject,
  hasActiveServices,
  envRows,
  onStop,
  onForceDestroy,
  plan,
  confirmName,
  confirmText,
  onConfirmTextChange,
  deleteError,
  deleting,
}: Readonly<{
  loading: boolean
  managedProject: boolean
  hasActiveServices: boolean
  envRows: EnvStopRow[]
  onStop: (environmentId: string) => void
  onForceDestroy?: (environmentId: string) => void
  plan: DeletePlan | undefined
  confirmName: string
  confirmText: string
  onConfirmTextChange: (value: string) => void
  deleteError: string | null
  deleting: boolean
}>) {
  if (loading) {
    return (
      <LoadingState
        label={
          managedProject
            ? 'Checking managed databases…'
            : 'Checking what the project owns…'
        }
      />
    )
  }
  if (hasActiveServices) {
    return (
      <StopStepSection
        envRows={envRows}
        onStop={onStop}
        onForceDestroy={managedProject ? onForceDestroy : undefined}
        copy={MANAGED_DESTROY_COPY}
      />
    )
  }
  return (
    <ConfirmStepSection
      plan={plan}
      confirmName={confirmName}
      confirmText={confirmText}
      onConfirmTextChange={onConfirmTextChange}
      deleteError={deleteError}
      deleting={deleting}
    />
  )
}

function ProjectDeleteActions({
  deleting,
  showDelete,
  canDelete,
  onCancel,
  onDelete,
}: Readonly<{
  deleting: boolean
  showDelete: boolean
  canDelete: boolean
  onCancel: () => void
  onDelete: () => void
}>) {
  return (
    <View style={styles.actions}>
      <Button
        label="Cancel"
        variant="secondary"
        size="sm"
        disabled={deleting}
        onPress={onCancel}
      />
      {showDelete ? (
        <Button
          label="Delete permanently"
          busyLabel="Deleting…"
          variant="danger"
          size="sm"
          disabled={!canDelete}
          busy={deleting}
          onPress={onDelete}
        />
      ) : null}
    </View>
  )
}

function useSyncTerminalProjectDeleteCommands(input: Readonly<{
  commands: readonly CommandStatusRecord[] | undefined
  trackedCommands: readonly TrackedCommandEntry[]
  commandEnvById: Record<string, string>
  managedProject: boolean
  refetchManaged: () => void
  setStopRows: Dispatch<SetStateAction<Record<string, StopRowState>>>
  setTrackedCommands: Dispatch<SetStateAction<readonly TrackedCommandEntry[]>>
  setCommandEnvById: Dispatch<SetStateAction<Record<string, string>>>
}>) {
  const {
    commands,
    trackedCommands,
    commandEnvById,
    managedProject,
    refetchManaged,
    setStopRows,
    setTrackedCommands,
    setCommandEnvById,
  } = input

  useEffect(() => {
    if (!commands) return
    // Join on command id: unreadable ids are dropped from the batched response.
    const commandsById = commandStatusById(commands)
    for (const entry of trackedCommands) {
      const command = commandsById.get(entry.commandId)
      if (!command) continue
      const environmentId = commandEnvById[entry.commandId]
      if (!environmentId || !isTerminalCommandStatus(command.status)) continue

      if (command.status === 'succeeded') {
        refetchManaged()
        setStopRows((current) => ({
          ...current,
          [environmentId]: {
            stopping: false,
            status: null,
            error: null,
            serverId: entry.serverId,
          },
        }))
      } else {
        setStopRows((current) => ({
          ...current,
          [environmentId]: {
            stopping: false,
            status: null,
            error: commandErrorLine(command) ??
              `${managedProject ? 'Destroy' : 'Stop'} ${command.status}`,
            serverId: entry.serverId,
          },
        }))
      }
      setTrackedCommands((current) =>
        current.filter((row) => row.commandId !== entry.commandId),
      )
      setCommandEnvById((current) => {
        const next = { ...current }
        delete next[entry.commandId]
        return next
      })
    }
  }, [
    commands,
    trackedCommands,
    commandEnvById,
    managedProject,
    refetchManaged,
    setStopRows,
    setTrackedCommands,
    setCommandEnvById,
  ])
}

export function ProjectDeletePanel({
  orgId,
  project,
  onCancel,
  onDeleted,
}: Readonly<{
  orgId: string
  project: ProjectRecord
  onCancel: () => void
  onDeleted: () => void
}>) {
  const confirmName = projectConfirmName(project)
  const managedProject = isManagedProject(project)
  const environmentsQuery = useEnvironments(orgId, project.id)
  const environments = orEmptyArray(environmentsQuery.data?.environments)
  const previewQuery = useProjectDeletePreview(orgId, project.id)
  const plan = previewQuery.data
  const orgManagedQuery = useOrganizationManaged(orgId, {
    enabled: managedProject,
  })
  const orgManaged = orEmptyArray(orgManagedQuery.data?.managed)
  const deleteProjectMutation = useDeleteProject(orgId)
  const destroyManagedMutation = useDeleteEnvironmentManagedMutation(orgId)

  const [stopRows, setStopRows] = useState<Record<string, StopRowState>>({})
  const [trackedCommands, setTrackedCommands] = useState<
    readonly TrackedCommandEntry[]
  >([])
  const [commandEnvById, setCommandEnvById] = useState<Record<string, string>>(
    {},
  )

  const commandsQuery = useCommandsBatch(orgId, trackedCommands)

  const [confirmText, setConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const refetchManaged = useCallback(() => {
    void orgManagedQuery.refetch()
    void previewQuery.refetch()
  }, [orgManagedQuery, previewQuery])

  useSyncTerminalProjectDeleteCommands({
    commands: commandsQuery.data,
    trackedCommands,
    commandEnvById,
    managedProject,
    refetchManaged,
    setStopRows,
    setTrackedCommands,
    setCommandEnvById,
  })

  // Only managed databases need their own step: they are destroyed with
  // their own confirmation. Everything else goes with the delete itself.
  const envRows = useMemo(
    () =>
      managedProject
        ? sortEnvStopRows(
          collectManagedDeleteRows(project.id, environments, orgManaged, stopRows),
        )
        : [],
    [managedProject, orgManaged, project.id, environments, stopRows],
  )

  const loading = isProjectDeleteLoading({
    managedProject,
    environmentsLoading: environmentsQuery.isLoading,
    orgManagedLoading: orgManagedQuery.isLoading,
    previewLoading: previewQuery.isLoading,
  })

  const queryError = environmentsQuery.error ?? previewQuery.error
  const loadError =
    queryError instanceof Error
      ? deleteFailureMessage(queryError, 'Could not read what this project owns. Try again.')
      : null

  const hasActiveServices = envRows.length > 0
  const deleting = deleteProjectMutation.isPending
  const canDelete = canConfirmProjectDelete({
    hasActiveServices,
    blocked: !plan || plan.blockers.length > 0,
    confirmText,
    confirmName,
    deleting,
    loading,
  })

  const markStopFailed = (environmentId: string, error: string) => {
    setStopRows((current) => ({
      ...current,
      [environmentId]: {
        stopping: false,
        status: null,
        error,
        serverId: current[environmentId]?.serverId ?? null,
      },
    }))
  }

  const trackQueuedCommand = (
    environmentId: string,
    serverId: string,
    commandId: string,
    status: string,
  ) => {
    setStopRows((current) => ({
      ...current,
      [environmentId]: {
        stopping: true,
        status,
        error: null,
        serverId,
      },
    }))
    setTrackedCommands((current) => [...current, { serverId, commandId }])
    setCommandEnvById((current) => ({
      ...current,
      [commandId]: environmentId,
    }))
  }

  const handleDestroyManaged = async (
    environmentId: string,
    options?: { force?: boolean },
  ) => {
    setStopRows((current) => ({
      ...current,
      [environmentId]: {
        stopping: true,
        status: 'Queueing destroy…',
        error: null,
        serverId: current[environmentId]?.serverId ?? null,
      },
    }))
    const result = await destroyManagedMutation.run(
      options?.force ? { environmentId, force: true } : environmentId,
    )
    if (!result.ok) {
      markStopFailed(
        environmentId,
        result.error
          ? userErrorMessage(result.cause ?? new Error(result.error), '')
          : 'Failed to destroy database',
      )
      return
    }
    if (result.value.deleted) {
      void orgManagedQuery.refetch()
      setStopRows((current) => {
        const next = { ...current }
        delete next[environmentId]
        return next
      })
      return
    }
    const { commandId, serverId } = result.value
    if (!commandId || !serverId) {
      markStopFailed(
        environmentId,
        'Destroy queued but target server was not returned',
      )
      return
    }
    trackQueuedCommand(
      environmentId,
      serverId,
      commandId,
      'Destroying database…',
    )
  }


  const handleDelete = async () => {
    if (!canDelete) return
    setDeleteError(null)
    const result = await deleteProjectMutation.run(project.id)
    if (!result.ok) {
      setDeleteError(
        deleteFailureMessage(
          result.cause ?? result.error,
          'The project could not be deleted. Try again.',
        ),
      )
      // Whatever refused it may have changed (a server came back, a database went).
      void previewQuery.refetch()
      if (result.error?.includes(MANAGED_RUNTIME_PRESENT_ERROR)) void orgManagedQuery.refetch()
      return
    }
    onDeleted()
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Delete project</Text>
      <Text style={styles.warning}>{projectDeleteWarning(managedProject)}</Text>

      {loadError ? <Text style={panelStyles.error}>{loadError}</Text> : null}
      <DeletePanelBody
        loading={loading}
        managedProject={managedProject}
        hasActiveServices={hasActiveServices}
        envRows={envRows}
        onStop={(environmentId) => void handleDestroyManaged(environmentId)}
        onForceDestroy={(environmentId) =>
          void handleDestroyManaged(environmentId, { force: true })}
        plan={plan}
        confirmName={confirmName}
        confirmText={confirmText}
        onConfirmTextChange={setConfirmText}
        deleteError={deleteError}
        deleting={deleting}
      />

      <ProjectDeleteActions
        deleting={deleting}
        showDelete={!loading && !hasActiveServices}
        canDelete={canDelete}
        onCancel={onCancel}
        onDelete={() => void handleDelete()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    padding: spacing.md,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  warning: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  section: {
    gap: spacing.sm,
  },
  stepLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  stepCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  confirmName: {
    color: colors.text,
    fontWeight: '700',
  },
  envList: {
    gap: spacing.sm,
  },
  envRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    padding: spacing.sm,
    backgroundColor: colors.bg,
  },
  envInfo: {
    flex: 1,
    gap: 2,
  },
  envActions: {
    gap: spacing.xs,
    alignItems: 'flex-end',
  },
  envName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
})
