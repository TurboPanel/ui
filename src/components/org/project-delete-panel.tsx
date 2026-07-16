import { useEffect, useState } from 'react'
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
import { readComposePlacementServerId } from '@/lib/compose'
import {
  deleteProject,
  fetchCommand,
  fetchContainers,
  fetchVisibleEnvironments,
  fetchVisibleServices,
  isForbiddenError,
  PROJECT_HAS_RUNNING_SERVICES_ERROR,
  stopEnvironment,
  type ContainerRecord,
  type EnvironmentRecord,
  type ProjectRecord,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

const TERMINAL_STATUSES = new Set([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
])

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

function readMetadataServerId(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || typeof metadata.serverId !== 'string') return null
  const trimmed = metadata.serverId.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveEnvServerId(
  environment: EnvironmentRecord,
  containers: ContainerRecord[],
): string | null {
  try {
    const placement = environment.options?.compose
      ? readComposePlacementServerId(environment.options.compose)
      : null
    if (placement) return placement
  } catch {
    // ignore invalid compose
  }
  const fromMeta = readMetadataServerId(environment.metadata)
  if (fromMeta) return fromMeta
  return containers.find((row) => row.serverId)?.serverId ?? null
}

async function loadActiveEnvRows(projectId: string): Promise<EnvStopRow[]> {
  const { environments } = await fetchVisibleEnvironments(projectId)
  const rows: EnvStopRow[] = []

  for (const environment of environments) {
    const { services } = await fetchVisibleServices(environment.id)
    const containerLists = await Promise.all(
      services.map((service) => fetchContainers(service.id)),
    )
    const containers = containerLists.flatMap((result) => result.containers)
    const active = containers.filter((container) =>
      isActiveContainerStatus(container.metadata?.status),
    )
    if (active.length === 0) continue
    rows.push({
      environment,
      activeCount: active.length,
      serverId: resolveEnvServerId(environment, active),
      stopping: false,
      status: null,
      error: null,
    })
  }

  return rows.sort((a, b) =>
    environmentLabel(a.environment).localeCompare(environmentLabel(b.environment)),
  )
}

async function waitForTerminalCommand(serverId: string, commandId: string) {
  let command = await fetchCommand(serverId, commandId)
  while (!TERMINAL_STATUSES.has(command.status)) {
    await new Promise<void>((resolve) => setTimeout(resolve, 2000))
    command = await fetchCommand(serverId, commandId)
  }
  return command
}

function patchEnvRow(
  rows: EnvStopRow[],
  environmentId: string,
  patch: Partial<EnvStopRow>,
): EnvStopRow[] {
  return rows.map((row) =>
    row.environment.id === environmentId ? { ...row, ...patch } : row,
  )
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
  project,
  onCancel,
  onDeleted,
  onUnauthorized,
}: Readonly<{
  project: ProjectRecord
  onCancel: () => void
  onDeleted: () => void
  onUnauthorized: () => Promise<void>
}>) {
  const confirmName = projectConfirmName(project)
  const [loading, setLoading] = useState(true)
  const [envRows, setEnvRows] = useState<EnvStopRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setEnvRows(await loadActiveEnvRows(project.id))
    } catch (err) {
      if (isForbiddenError(err)) {
        await onUnauthorized()
        return
      }
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load environment status',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const rows = await loadActiveEnvRows(project.id)
        if (!cancelled) setEnvRows(rows)
      } catch (err) {
        if (cancelled) return
        if (isForbiddenError(err)) {
          await onUnauthorized()
          return
        }
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load environment status',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [project.id, onUnauthorized])

  const hasActiveServices = envRows.length > 0
  const canDelete =
    !hasActiveServices &&
    confirmText.trim() === confirmName &&
    !deleting &&
    !loading

  const handleStop = async (environmentId: string) => {
    setEnvRows((current) =>
      patchEnvRow(current, environmentId, {
        stopping: true,
        error: null,
        status: 'Queueing stop…',
      }),
    )
    try {
      const result = await stopEnvironment(environmentId)
      if (!result.serverId) {
        throw new Error('Stop queued but target server was not returned')
      }
      setEnvRows((current) =>
        patchEnvRow(current, environmentId, {
          status: 'Stopping services…',
          serverId: result.serverId ?? null,
        }),
      )
      const command = await waitForTerminalCommand(
        result.serverId,
        result.commandId,
      )
      if (command.status !== 'succeeded') {
        throw new Error(command.error ?? `Stop ${command.status}`)
      }
      await refresh()
    } catch (err) {
      if (isForbiddenError(err)) {
        await onUnauthorized()
        return
      }
      setEnvRows((current) =>
        patchEnvRow(current, environmentId, {
          stopping: false,
          status: null,
          error: err instanceof Error ? err.message : 'Failed to stop services',
        }),
      )
    }
  }

  const handleDelete = async () => {
    if (!canDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteProject(project.id)
      onDeleted()
    } catch (err) {
      if (isForbiddenError(err)) {
        await onUnauthorized()
        return
      }
      const message =
        err instanceof Error ? err.message : 'Failed to delete project'
      if (message.includes(PROJECT_HAS_RUNNING_SERVICES_ERROR)) {
        setDeleteError(
          'Services are still running. Stop every environment first.',
        )
        await refresh()
      } else {
        setDeleteError(message)
      }
    } finally {
      setDeleting(false)
    }
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
