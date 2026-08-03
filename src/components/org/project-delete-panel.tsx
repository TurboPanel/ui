import { useEffect, useMemo, useState } from 'react'
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
  PROJECT_HAS_RUNNING_SERVICES_ERROR,
  type ContainerRecord,
  type EnvironmentRecord,
  type ProjectRecord,
} from '@/lib/instance-api'
import {
  isTerminalCommandStatus,
  useCommandsBatch,
  useContainersByEnvironments,
  useDeleteProject,
  useEnvironments,
  useStopEnvironmentMutation,
  type TrackedCommandEntry,
} from '@/lib/queries'
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

function StopStepSection({
  envRows,
  onStop,
}: Readonly<{
  envRows: EnvStopRow[]
  onStop: (environmentId: string) => void
}>) {
  return (
    <View style={styles.section}>
      <Text style={styles.stepLabel}>Step 1 — Stop running services</Text>
      <Text style={styles.stepCopy}>
        Stop every environment that still has active containers before the
        project can be deleted.
      </Text>
      <View style={styles.envList}>
        {envRows.map((row) => (
          <View key={row.environment.id} style={styles.envRow}>
            <View style={styles.envInfo}>
              <Text style={styles.envName}>
                {environmentLabel(row.environment)}
              </Text>
              <Text style={orgPanelStyles.muted}>
                {row.activeCount} active container
                {row.activeCount === 1 ? '' : 's'}
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
                {row.stopping ? 'Stopping…' : 'Stop services'}
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
  const environmentsQuery = useEnvironments(orgId, project.id)
  const environments = environmentsQuery.data?.environments ?? []
  const environmentIds = useMemo(
    () => environments.map((env) => env.id),
    [environments],
  )
  const containersQuery = useContainersByEnvironments(orgId, environmentIds, {
    enabled: environmentIds.length > 0,
  })
  const deleteProjectMutation = useDeleteProject(orgId)
  const stopEnvironmentMutation = useStopEnvironmentMutation(orgId)

  const [stopRows, setStopRows] = useState<
    Record<
      string,
      {
        stopping: boolean
        status: string | null
        error: string | null
        serverId: string | null
      }
    >
  >({})
  const [trackedCommands, setTrackedCommands] = useState<
    readonly TrackedCommandEntry[]
  >([])
  const [commandEnvById, setCommandEnvById] = useState<Record<string, string>>(
    {},
  )

  const commandsQuery = useCommandsBatch(orgId, trackedCommands)

  const [confirmText, setConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!commandsQuery.data) return
    for (const [index, command] of commandsQuery.data.entries()) {
      const entry = trackedCommands[index]
      if (!entry) continue
      const environmentId = commandEnvById[entry.commandId]
      if (!environmentId || !isTerminalCommandStatus(command.status)) continue

      if (command.status === 'succeeded') {
        void containersQuery.refetchAll()
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
            error: command.error ?? `Stop ${command.status}`,
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
  }, [commandsQuery.data, trackedCommands, commandEnvById, containersQuery])

  const envRows = useMemo(() => {
    const rows: EnvStopRow[] = []
    for (const environment of environments) {
      const containers = containersQuery.containersByEnv[environment.id] ?? []
      const active = containers.filter((container) =>
        isActiveContainerStatus(container.status),
      )
      if (active.length === 0) continue
      const stopState = stopRows[environment.id]
      rows.push({
        environment,
        activeCount: active.length,
        serverId:
          stopState?.serverId ?? resolveEnvServerId(environment, active),
        stopping: stopState?.stopping ?? false,
        status: stopState?.status ?? null,
        error: stopState?.error ?? null,
      })
    }
    return rows.sort((a, b) =>
      environmentLabel(a.environment).localeCompare(
        environmentLabel(b.environment),
      ),
    )
  }, [environments, containersQuery.containersByEnv, stopRows])

  const loading =
    environmentsQuery.isLoading ||
    (environmentIds.length > 0 && containersQuery.isLoading)

  const loadError =
    environmentsQuery.error instanceof Error
      ? environmentsQuery.error.message
      : null

  const hasActiveServices = envRows.length > 0
  const deleting = deleteProjectMutation.isPending
  const canDelete =
    !hasActiveServices &&
    confirmText.trim() === confirmName &&
    !deleting &&
    !loading

  const handleStop = async (environmentId: string) => {
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
      setStopRows((current) => ({
        ...current,
        [environmentId]: {
          stopping: false,
          status: null,
          error: stopEnvironmentMutation.actionError ?? 'Failed to stop services',
          serverId: current[environmentId]?.serverId ?? null,
        },
      }))
      return
    }
    const { commandId, serverId } = result.value
    if (!serverId) {
      setStopRows((current) => ({
        ...current,
        [environmentId]: {
          stopping: false,
          status: null,
          error: 'Stop queued but target server was not returned',
          serverId: null,
        },
      }))
      return
    }
    setStopRows((current) => ({
      ...current,
      [environmentId]: {
        stopping: true,
        status: 'Stopping services…',
        error: null,
        serverId,
      },
    }))
    setTrackedCommands((current) => [
      ...current,
      { serverId, commandId },
    ])
    setCommandEnvById((current) => ({
      ...current,
      [commandId]: environmentId,
    }))
  }

  const handleDelete = async () => {
    if (!canDelete) return
    setDeleteError(null)
    const result = await deleteProjectMutation.run(project.id)
    if (!result.ok) {
      const message = deleteProjectMutation.actionError ?? 'Failed to delete project'
      if (message.includes(PROJECT_HAS_RUNNING_SERVICES_ERROR)) {
        setDeleteError(
          'Services are still running. Stop every environment first.',
        )
        void containersQuery.refetchAll()
      } else {
        setDeleteError(message)
      }
      return
    }
    onDeleted()
  }

  let body = null
  if (loading) {
    body = (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={colors.accent} />
        <Text style={orgPanelStyles.muted}>Checking running services…</Text>
      </View>
    )
  } else if (hasActiveServices) {
    body = (
      <StopStepSection
        envRows={envRows}
        onStop={(environmentId) => void handleStop(environmentId)}
      />
    )
  } else {
    body = (
      <ConfirmStepSection
        confirmName={confirmName}
        confirmText={confirmText}
        onConfirmTextChange={setConfirmText}
        deleteError={deleteError}
        deleting={deleting}
      />
    )
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Delete project</Text>
      <Text style={styles.warning}>
        This is permanent and cannot be undone. Deleting removes all environments,
        services, hostings, containers, variables, and Docker volumes for stopped
        stacks under this project.
      </Text>

      {loadError ? <Text style={orgPanelStyles.error}>{loadError}</Text> : null}
      {body}

      <View style={styles.actions}>
        <Pressable
          style={styles.secondaryButton}
          onPress={onCancel}
          disabled={deleting}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        {!loading && !hasActiveServices ? (
          <Pressable
            style={[styles.dangerButton, !canDelete && styles.buttonDisabled]}
            disabled={!canDelete}
            onPress={() => void handleDelete()}
          >
            <Text style={styles.dangerButtonText}>
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </Text>
          </Pressable>
        ) : null}
      </View>
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
