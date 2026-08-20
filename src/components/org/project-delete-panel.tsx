import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  MANAGED_RUNTIME_PRESENT_ERROR,
  PROJECT_HAS_RUNNING_SERVICES_ERROR,
  type CommandRecord,
  type ContainerRecord,
  type EnvironmentRecord,
  type ProjectRecord,
} from '@/lib/instance-api'
import {
  isTerminalCommandStatus,
  useCommandsBatch,
  useContainersByEnvironments,
  useDeleteEnvironmentManagedMutation,
  useDeleteProject,
  useEnvironments,
  useOrganizationManaged,
  useStopEnvironmentMutation,
  type TrackedCommandEntry,
} from '@/lib/queries'
import { orEmptyArray } from '@/lib/or-empty-array'
import type { ManagedListRecord } from '@/lib/managed-services'
import { isManagedProject } from '@/lib/project-navigation'
import { colors, spacing } from '@/lib/theme'

const STOPPED_CONTAINER_STATUSES = new Set(['exited', 'dead', 'removing'])

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

function collectComposeDeleteRows(
  environments: readonly EnvironmentRecord[],
  containersByEnv: Record<string, ContainerRecord[]>,
  stopRows: Record<string, StopRowState>,
): EnvStopRow[] {
  const rows: EnvStopRow[] = []
  for (const environment of environments) {
    const containers = containersByEnv[environment.id] ?? []
    const active = containers.filter((container) =>
      isActiveContainerStatus(container.status),
    )
    if (active.length === 0) continue
    rows.push(
      withStopState(
        environment,
        active.length,
        resolveEnvServerId(environment, active),
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

function projectDeleteFailureCopy(
  message: string,
): { text: string; kind: 'managed' | 'compose' | 'other' } {
  if (message.includes(MANAGED_RUNTIME_PRESENT_ERROR)) {
    return {
      text: 'A managed database is still on the server. Destroy it first.',
      kind: 'managed',
    }
  }
  if (message.includes(PROJECT_HAS_RUNNING_SERVICES_ERROR)) {
    return {
      text: 'Services are still running. Stop every environment first.',
      kind: 'compose',
    }
  }
  return { text: message, kind: 'other' }
}

function isActiveContainerStatus(status: string | undefined): boolean {
  if (status === undefined || status.length === 0) return true
  return !STOPPED_CONTAINER_STATUSES.has(status)
}

function environmentLabel(environment: EnvironmentRecord): string {
  return environment.displayName?.trim() || 'Unnamed environment'
}

function projectConfirmName(project: ProjectRecord): string {
  return project.displayName?.trim() || 'Unnamed project'
}

function resolveEnvServerId(
  environment: EnvironmentRecord,
  containers: ContainerRecord[],
): string | null {
  if (environment.serverId) return environment.serverId
  return containers.find((row) => row.serverId)?.serverId ?? null
}

type StopStepCopy = Readonly<{
  stepLabel: string
  stepCopy: string
  countLabel: (count: number) => string
  actionLabel: string
  actionBusyLabel: string
}>

const COMPOSE_STOP_COPY: StopStepCopy = {
  stepLabel: 'Step 1 — Stop running services',
  stepCopy:
    'Stop every environment that still has active containers before the project can be deleted.',
  countLabel: (count) =>
    `${count} active container${count === 1 ? '' : 's'}`,
  actionLabel: 'Stop services',
  actionBusyLabel: 'Stopping…',
}

const MANAGED_DESTROY_COPY: StopStepCopy = {
  stepLabel: 'Step 1 — Destroy databases',
  stepCopy:
    'Destroy every managed database before the project can be deleted. This stops the containers and removes their data volumes.',
  countLabel: () => 'Still running on the server',
  actionLabel: 'Destroy database',
  actionBusyLabel: 'Destroying…',
}

function StopStepSection({
  envRows,
  onStop,
  copy,
}: Readonly<{
  envRows: EnvStopRow[]
  onStop: (environmentId: string) => void
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
              <Text style={orgPanelStyles.muted}>
                {copy.countLabel(row.activeCount)}
              </Text>
              {row.status ? (
                <Text style={orgPanelStyles.muted}>{row.status}</Text>
              ) : null}
              {row.error ? (
                <Text style={orgPanelStyles.error}>{row.error}</Text>
              ) : null}
            </View>
            <Pressable
              style={[
                styles.dangerButton,
                row.stopping && styles.buttonDisabled,
              ]}
              disabled={row.stopping}
              onPress={() => onStop(row.environment.id)}
            >
              <Text style={styles.dangerButtonText}>
                {row.stopping ? copy.actionBusyLabel : copy.actionLabel}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  )
}

function ConfirmStepSection({
  confirmName,
  confirmText,
  onConfirmTextChange,
  deleteError,
  deleting,
}: Readonly<{
  confirmName: string
  confirmText: string
  onConfirmTextChange: (value: string) => void
  deleteError: string | null
  deleting: boolean
}>) {
  return (
    <View style={styles.section}>
      <Text style={styles.stepLabel}>Step 2 — Confirm deletion</Text>
      <Text style={styles.stepCopy}>
        Type <Text style={styles.confirmName}>{confirmName}</Text> to
        permanently delete this project.
      </Text>
      <TextInput
        style={Platform.OS === 'web' ? styles.webInput : styles.input}
        value={confirmText}
        onChangeText={onConfirmTextChange}
        placeholder={confirmName}
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!deleting}
      />
      {deleteError ? <Text style={orgPanelStyles.error}>{deleteError}</Text> : null}
    </View>
  )
}

function isProjectDeleteLoading(input: Readonly<{
  managedProject: boolean
  environmentsLoading: boolean
  orgManagedLoading: boolean
  environmentCount: number
  containersLoading: boolean
}>): boolean {
  if (input.environmentsLoading) return true
  if (input.managedProject) return input.orgManagedLoading
  return input.environmentCount > 0 && input.containersLoading
}

function canConfirmProjectDelete(input: Readonly<{
  hasActiveServices: boolean
  confirmText: string
  confirmName: string
  deleting: boolean
  loading: boolean
}>): boolean {
  if (input.hasActiveServices || input.deleting || input.loading) return false
  return input.confirmText.trim() === input.confirmName
}

function projectDeleteWarning(managedProject: boolean): string {
  if (managedProject) {
    return 'This is permanent and cannot be undone. Destroying a database removes its containers and data volumes on the server, then deletes the project.'
  }
  return 'This is permanent and cannot be undone. Deleting removes all environments, services, hostings, containers, variables, and Docker volumes for stopped stacks under this project.'
}

function DeletePanelBody({
  loading,
  managedProject,
  hasActiveServices,
  envRows,
  onStop,
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
  confirmName: string
  confirmText: string
  onConfirmTextChange: (value: string) => void
  deleteError: string | null
  deleting: boolean
}>) {
  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={colors.accent} />
        <Text style={orgPanelStyles.muted}>
          {managedProject
            ? 'Checking managed databases…'
            : 'Checking running services…'}
        </Text>
      </View>
    )
  }
  if (hasActiveServices) {
    return (
      <StopStepSection
        envRows={envRows}
        onStop={onStop}
        copy={managedProject ? MANAGED_DESTROY_COPY : COMPOSE_STOP_COPY}
      />
    )
  }
  return (
    <ConfirmStepSection
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
      <Pressable
        style={styles.secondaryButton}
        onPress={onCancel}
        disabled={deleting}
      >
        <Text style={styles.secondaryButtonText}>Cancel</Text>
      </Pressable>
      {showDelete ? (
        <Pressable
          style={[styles.dangerButton, !canDelete && styles.buttonDisabled]}
          disabled={!canDelete}
          onPress={onDelete}
        >
          <Text style={styles.dangerButtonText}>
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function useSyncTerminalProjectDeleteCommands(input: Readonly<{
  commands: readonly CommandRecord[] | undefined
  trackedCommands: readonly TrackedCommandEntry[]
  commandEnvById: Record<string, string>
  managedProject: boolean
  refetchManaged: () => void
  refetchContainers: () => void
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
    refetchContainers,
    setStopRows,
    setTrackedCommands,
    setCommandEnvById,
  } = input

  useEffect(() => {
    if (!commands) return
    for (const [index, command] of commands.entries()) {
      const entry = trackedCommands[index]
      if (!entry) continue
      const environmentId = commandEnvById[entry.commandId]
      if (!environmentId || !isTerminalCommandStatus(command.status)) continue

      if (command.status === 'succeeded') {
        if (managedProject) {
          refetchManaged()
        } else {
          refetchContainers()
        }
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
            error: command.error ??
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
    refetchContainers,
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
  const environmentIds = useMemo(
    () => environments.map((env) => env.id),
    [environments],
  )
  const containersQuery = useContainersByEnvironments(orgId, environmentIds, {
    enabled: !managedProject && environmentIds.length > 0,
  })
  const orgManagedQuery = useOrganizationManaged(orgId, {
    enabled: managedProject,
  })
  const orgManaged = orEmptyArray(orgManagedQuery.data?.managed)
  const deleteProjectMutation = useDeleteProject(orgId)
  const stopEnvironmentMutation = useStopEnvironmentMutation(orgId)
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
  }, [orgManagedQuery])
  const refetchContainers = useCallback(() => {
    void containersQuery.refetchAll()
  }, [containersQuery])

  useSyncTerminalProjectDeleteCommands({
    commands: commandsQuery.data,
    trackedCommands,
    commandEnvById,
    managedProject,
    refetchManaged,
    refetchContainers,
    setStopRows,
    setTrackedCommands,
    setCommandEnvById,
  })

  const envRows = useMemo(() => {
    const rows = managedProject
      ? collectManagedDeleteRows(project.id, environments, orgManaged, stopRows)
      : collectComposeDeleteRows(
        environments,
        containersQuery.containersByEnv,
        stopRows,
      )
    return sortEnvStopRows(rows)
  }, [
    managedProject,
    orgManaged,
    project.id,
    environments,
    containersQuery.containersByEnv,
    stopRows,
  ])

  const loading = isProjectDeleteLoading({
    managedProject,
    environmentsLoading: environmentsQuery.isLoading,
    orgManagedLoading: orgManagedQuery.isLoading,
    environmentCount: environmentIds.length,
    containersLoading: containersQuery.isLoading,
  })

  const loadError =
    environmentsQuery.error instanceof Error
      ? environmentsQuery.error.message
      : null

  const hasActiveServices = envRows.length > 0
  const deleting = deleteProjectMutation.isPending
  const canDelete = canConfirmProjectDelete({
    hasActiveServices,
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

  const handleStopCompose = async (environmentId: string) => {
    setStopRows((current) => ({
      ...current,
      [environmentId]: {
        stopping: true,
        status: 'Queueing stop…',
        error: null,
        serverId: current[environmentId]?.serverId ?? null,
      },
    }))
    const result = await stopEnvironmentMutation.run(environmentId)
    if (!result.ok) {
      markStopFailed(
        environmentId,
        stopEnvironmentMutation.actionError ?? 'Failed to stop services',
      )
      return
    }
    const { commandId, serverId } = result.value
    if (!serverId) {
      markStopFailed(environmentId, 'Stop queued but target server was not returned')
      return
    }
    trackQueuedCommand(environmentId, serverId, commandId, 'Stopping services…')
  }

  const handleDestroyManaged = async (environmentId: string) => {
    setStopRows((current) => ({
      ...current,
      [environmentId]: {
        stopping: true,
        status: 'Queueing destroy…',
        error: null,
        serverId: current[environmentId]?.serverId ?? null,
      },
    }))
    const result = await destroyManagedMutation.run(environmentId)
    if (!result.ok) {
      markStopFailed(
        environmentId,
        destroyManagedMutation.actionError ?? 'Failed to destroy database',
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

  const handleStop = async (environmentId: string) => {
    if (managedProject) {
      await handleDestroyManaged(environmentId)
      return
    }
    await handleStopCompose(environmentId)
  }

  const handleDelete = async () => {
    if (!canDelete) return
    setDeleteError(null)
    const result = await deleteProjectMutation.run(project.id)
    if (!result.ok) {
      const message = deleteProjectMutation.actionError ?? 'Failed to delete project'
      const failure = projectDeleteFailureCopy(message)
      setDeleteError(failure.text)
      if (failure.kind === 'managed') void orgManagedQuery.refetch()
      if (failure.kind === 'compose') void containersQuery.refetchAll()
      return
    }
    onDeleted()
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Delete project</Text>
      <Text style={styles.warning}>{projectDeleteWarning(managedProject)}</Text>

      {loadError ? <Text style={orgPanelStyles.error}>{loadError}</Text> : null}
      <DeletePanelBody
        loading={loading}
        managedProject={managedProject}
        hasActiveServices={hasActiveServices}
        envRows={envRows}
        onStop={(environmentId) => void handleStop(environmentId)}
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  envName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderRadius: 6,
  },
  webInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderRadius: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  dangerButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  dangerButtonText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
