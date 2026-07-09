import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import {
  COMMAND_POLL_MS,
  defaultServerCommandState,
  isTerminalCommandStatus,
  ServerCommandsPanel,
  type ActiveCommand,
  type ServerCommandState,
} from '@/components/org/server-commands-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchCommand,
  fetchOrgServers,
  fetchServersUpdateStatus,
  isForbiddenError,
  pingDaemon,
  rebootServer,
  resetServerUpdateStatus,
  setServerHostname,
  triggerAllServerUpdates,
  triggerServerUpdate,
  type OrgServerRecord,
  type ServerUpdateStatus,
} from '@/lib/instance-api'
import {
  formatElapsedSince,
  formatLocalDateTime,
} from '@/lib/format-datetime'
import { useCan } from '@/lib/query-client'
import {
  countryCodeToFlagEmoji,
  formatServerGeoCountryCode,
  formatServerGeoLocation,
} from '@/lib/server-geo'
import { colors, spacing } from '@/lib/theme'

type UpdateState = {
  loading: boolean
  triggering: boolean
  resetting: boolean
  data: ServerUpdateStatus | null
  error: string | null
}

type UpdateBadgeVariant =
  | 'updating'
  | 'error'
  | 'colocated'
  | 'unknown'
  | 'available'
  | 'current'

function resolveUpdateBadgeVariant(input: {
  status: ServerUpdateStatus['status'] | undefined
  targetStatus: ServerUpdateStatus['targetStatus'] | undefined
  updateAvailable: boolean | undefined
  colocated: boolean
  showUpdateErrorBadge: boolean
  runningVersionUnknown: boolean
}): UpdateBadgeVariant {
  if (input.status === 'updating') return 'updating'
  if (input.showUpdateErrorBadge) return 'error'
  if (input.colocated) return 'colocated'
  if (input.targetStatus === 'unknown' || input.runningVersionUnknown) {
    return 'unknown'
  }
  if (input.updateAvailable) return 'available'
  return 'current'
}

function updateBadgeLabel(
  variant: UpdateBadgeVariant,
  runningVersionUnknown: boolean,
): string {
  switch (variant) {
    case 'updating':
      return 'Update in progress'
    case 'error':
      return 'Update error'
    case 'colocated':
      return 'Co-located host'
    case 'unknown':
      return runningVersionUnknown ? 'Version unknown' : 'Target unavailable'
    case 'available':
      return 'Update available'
    case 'current':
      return 'Up to date'
  }
}

function updateButtonLabel(input: {
  isUpdateStatusLoading: boolean
  isUpdateInProgress: boolean
  connected: boolean
  targetKnown: boolean
  colocated: boolean
  updateAvailable: boolean | undefined
}): string {
  if (input.isUpdateStatusLoading) return 'Loading…'
  if (input.isUpdateInProgress) return 'Updating…'
  if (!input.connected) return 'Offline'
  if (!input.targetKnown) return 'Target unknown'
  if (input.colocated) return 'Not updatable'
  if (!input.updateAvailable) return 'Up to date'
  return 'Update'
}

function selectedUpdateButtonLabel(
  batchUpdating: boolean,
  selectedUpdatableCount: number,
): string {
  if (batchUpdating) return 'Updating…'
  if (selectedUpdatableCount > 0) return `Update (${selectedUpdatableCount})`
  return 'Update'
}

function resetUpdateButtonLabel(
  resetting: boolean,
  status: ServerUpdateStatus['status'] | undefined,
): string {
  if (resetting) return 'Resetting…'
  if (status === 'updating') return 'Clear stuck update'
  return 'Reset status'
}

function applyCommandPollResult(
  current: ServerCommandState,
  activeCommand: ActiveCommand,
  record: Awaited<ReturnType<typeof fetchCommand>>,
  onRebootSucceeded: () => void,
): ServerCommandState | null {
  if (current.activeCommand?.commandId !== activeCommand.commandId) {
    return null
  }

  const updated: ServerCommandState = {
    ...current,
    commandRecord: record,
  }

  if (!isTerminalCommandStatus(record.status)) {
    return updated
  }

  updated.activeCommand = null
  if (activeCommand.kind === 'ping') {
    updated.pingRunning = false
    if (record.status !== 'succeeded') {
      updated.pingError = record.error ?? `Ping ${record.status}`
    }
    return updated
  }
  if (activeCommand.kind === 'reboot') {
    updated.rebootRunning = false
    if (record.status !== 'succeeded') {
      updated.rebootError = record.error ?? `Reboot ${record.status}`
    } else {
      onRebootSucceeded()
    }
    return updated
  }

  updated.hostnameRunning = false
  if (record.status === 'succeeded') {
    onRebootSucceeded()
  } else {
    updated.hostnameError = record.error ?? `Hostname change ${record.status}`
  }
  return updated
}

function reportServersRefreshError(
  err: unknown,
  options: { silent?: boolean } | undefined,
  setError: (message: string) => void,
): void {
  if (!options?.silent) {
    setError(err instanceof Error ? err.message : 'Failed to load servers')
  }
}

async function pollSingleServerCommand(
  serverId: string,
  activeCommand: ActiveCommand,
  isCancelled: () => boolean,
  applyResult: (
    serverId: string,
    activeCommand: ActiveCommand,
    record: Awaited<ReturnType<typeof fetchCommand>>,
  ) => void,
  onError: (
    serverId: string,
    kind: ActiveCommand['kind'],
    err: unknown,
  ) => Promise<void>,
): Promise<void> {
  try {
    const record = await fetchCommand(serverId, activeCommand.commandId)
    if (isCancelled()) return
    applyResult(serverId, activeCommand, record)
  } catch (err) {
    if (isCancelled()) return
    await onError(serverId, activeCommand.kind, err)
  }
}

function mergeCommandPollState(
  prev: Map<string, ServerCommandState>,
  serverId: string,
  activeCommand: ActiveCommand,
  record: Awaited<ReturnType<typeof fetchCommand>>,
  onRefresh: () => void,
): Map<string, ServerCommandState> {
  const current = prev.get(serverId)
  if (!current) return prev
  const updated = applyCommandPollResult(
    current,
    activeCommand,
    record,
    onRefresh,
  )
  if (!updated) return prev
  const next = new Map(prev)
  next.set(serverId, updated)
  return next
}

const defaultUpdateState: UpdateState = {
  loading: false,
  triggering: false,
  resetting: false,
  data: null,
  error: null,
}

async function pollInFlightCommands(
  commandStates: Map<string, ServerCommandState>,
  isCancelled: () => boolean,
  applyResult: (
    serverId: string,
    activeCommand: ActiveCommand,
    record: Awaited<ReturnType<typeof fetchCommand>>,
  ) => void,
  onError: (
    serverId: string,
    kind: ActiveCommand['kind'],
    err: unknown,
  ) => Promise<void>,
): Promise<void> {
  for (const [serverId, state] of commandStates.entries()) {
    if (!state.activeCommand) continue
    await pollSingleServerCommand(
      serverId,
      state.activeCommand,
      isCancelled,
      applyResult,
      onError,
    )
  }
}

function isColocatedServer(
  server: OrgServerRecord,
  updateData?: ServerUpdateStatus | null,
): boolean {
  return (
    server.colocatedWithInstance === true ||
    updateData?.colocatedWithInstance === true ||
    updateData?.updateBlocked === true
  )
}

function shortCommit(commit?: string | null): string {
  return commit ? commit.slice(0, 12) : 'Unknown'
}

function deriveServerUpdateViewModel(
  server: OrgServerRecord,
  updateState: UpdateState,
) {
  const updateData = updateState.data
  const colocated = isColocatedServer(server, updateData)
  const isUpdateStatusLoading = updateState.loading && updateData === null
  const isUpdateInProgress =
    updateState.triggering ||
    updateState.resetting ||
    updateData?.status === 'updating'
  const canResetUpdateStatus =
    updateData?.canResetUpdateStatus === true && !updateState.resetting
  const showUpdateErrorBadge =
    updateData?.status === 'error' && !updateData?.updateAvailable
  const targetKnown = updateData?.targetStatus === 'ok'
  const runningVersionUnknown =
    targetKnown &&
    server.connected &&
    !colocated &&
    !updateData?.current?.commit
  const badgeVariant = resolveUpdateBadgeVariant({
    status: updateData?.status,
    targetStatus: updateData?.targetStatus,
    updateAvailable: updateData?.updateAvailable,
    colocated,
    showUpdateErrorBadge,
    runningVersionUnknown,
  })

  return {
    updateData,
    colocated,
    isUpdateStatusLoading,
    isUpdateInProgress,
    canResetUpdateStatus,
    targetKnown,
    runningVersionUnknown,
    badgeVariant,
  }
}

// The servers list reflects coarse presence from the Postgres projection, which
// changes about as often as one daemon heartbeat. Poll it slowly rather than at
// a constant 5s; a push-based update path can replace this entirely later.
const SERVERS_REFRESH_MS = 30_000
// Only poll per-server update status while an update is actively in progress.
const UPDATE_PROGRESS_POLL_MS = 5_000

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

const EMPTY_CELL = '—'

function checkboxMark(checked: boolean, indeterminate: boolean) {
  if (indeterminate) {
    return <Text style={styles.checkboxMark}>−</Text>
  }
  if (checked) {
    return <Text style={styles.checkboxMark}>✓</Text>
  }
  return null
}

function formatLocationCell(geo: OrgServerRecord['geo']): string {
  const flag = countryCodeToFlagEmoji(geo?.country)
  const location = formatServerGeoLocation(geo)
  const countryCode = formatServerGeoCountryCode(geo)
  const parts = [location, countryCode].filter(Boolean)
  if (!flag && parts.length === 0) return EMPTY_CELL
  const trailing = parts.join(', ')
  if (flag && trailing) return `${flag} ${trailing}`
  return flag || trailing || EMPTY_CELL
}

function formatConnectedSinceCell(
  connected: boolean,
  connectedAt: string | null,
): string {
  if (!connected || !connectedAt) return EMPTY_CELL
  return `${formatLocalDateTime(connectedAt)} (${formatElapsedSince(connectedAt)})`
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  onPress,
  accessibilityLabel,
}: Readonly<{
  checked: boolean
  indeterminate?: boolean
  onPress: () => void
  accessibilityLabel: string
}>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: indeterminate ? 'mixed' : checked }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={styles.checkboxHit}
    >
      <View
        style={[
          styles.checkbox,
          (checked || indeterminate) && styles.checkboxChecked,
        ]}
      >
        {checkboxMark(checked, indeterminate)}
      </View>
    </Pressable>
  )
}

export function ServersOverviewSection({ orgId }: Readonly<{ orgId: string }>) {
  const { handleUnauthorized } = useAuth()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updateStates, setUpdateStates] = useState<Map<string, UpdateState>>(
    new Map(),
  )
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [commandStates, setCommandStates] = useState<
    Map<string, ServerCommandState>
  >(new Map())

  const commandStatesRef = useRef(commandStates)
  commandStatesRef.current = commandStates

  const isServerUpdatable = (server: OrgServerRecord): boolean => {
    const state = updateStates.get(server.id)
    return (
      server.connected &&
      !isColocatedServer(server, state?.data) &&
      state?.data?.targetStatus === 'ok' &&
      state.data.updateAvailable === true &&
      !state.triggering &&
      state.data.status !== 'updating'
    )
  }

  const isTerminalUpdateState = (status: ServerUpdateStatus): boolean => {
    if (status.updateBlocked) return true
    if (status.status === 'error') return true
    if (status.status === 'updating') return false
    if (status.targetStatus === 'unknown') return true
    if (!status.updateAvailable) return true
    if (
      status.current?.commit &&
      status.target?.commit &&
      status.current.commit === status.target.commit
    ) {
      return true
    }
    return status.status === 'idle'
  }

  const mergeUpdateEntry = (
    prev: Map<string, UpdateState>,
    serverId: string,
    data: ServerUpdateStatus,
    options?: { preserveTriggering?: boolean; loading?: boolean },
  ): Map<string, UpdateState> => {
    const current = prev.get(serverId)
    const preserveTriggering =
      options?.preserveTriggering &&
      (current?.triggering ?? false) &&
      !isTerminalUpdateState(data)
    return new Map(prev).set(serverId, {
      loading: options?.loading ?? false,
      triggering: preserveTriggering || data.status === 'updating',
      resetting: false,
      data,
      error: null,
    })
  }

  const loadAllUpdateData = async (
    serverIds: string[],
    options?: { silent?: boolean },
  ): Promise<void> => {
    if (serverIds.length === 0) return

    if (!options?.silent) {
      setUpdateStates((prev) => {
        let next = prev
        for (const serverId of serverIds) {
          const current = prev.get(serverId)
          next = new Map(next).set(serverId, {
            loading: true,
            triggering: current?.triggering ?? false,
            resetting: current?.resetting ?? false,
            data: current?.data ?? null,
            error: null,
          })
        }
        return next
      })
    }

    try {
      const batch = await fetchServersUpdateStatus()
      setUpdateStates((prev) => {
        let next = prev
        for (const entry of batch.servers) {
          if (!serverIds.includes(entry.serverId)) continue
          next = mergeUpdateEntry(next, entry.serverId, entry, {
            preserveTriggering: options?.silent,
          })
        }
        return next
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      if (!options?.silent) {
        const message =
          err instanceof Error ? err.message : 'Failed to load update status'
        setUpdateStates((prev) => {
          let next = prev
          for (const serverId of serverIds) {
            const current = prev.get(serverId)
            next = new Map(next).set(serverId, {
              loading: false,
              triggering: current?.triggering ?? false,
              resetting: false,
              data: current?.data ?? null,
              error: message,
            })
          }
          return next
        })
      }
    }
  }

  const loadUpdateData = async (
    serverId: string,
    options?: { silent?: boolean },
  ): Promise<void> => {
    await loadAllUpdateData([serverId], options)
  }

  const handleTriggerUpdate = async (serverId: string): Promise<void> => {
    const current = updateStates.get(serverId)
    setUpdateStates((prev) =>
      new Map(prev).set(serverId, {
        loading: current?.loading ?? false,
        triggering: true,
        resetting: false,
        data: current?.data ?? null,
        error: null,
      }),
    )
    try {
      await triggerServerUpdate(serverId)
      void loadUpdateData(serverId, { silent: true })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      const message =
        err instanceof Error ? err.message : 'Failed to trigger update'
      setUpdateStates((prev) =>
        new Map(prev).set(serverId, {
          loading: false,
          triggering: false,
          resetting: false,
          data: current?.data ?? null,
          error: message,
        }),
      )
    }
  }

  const handleTriggerSelectedUpdates = async (): Promise<void> => {
    const targets = servers.filter(
      (server) => selectedIds.has(server.id) && isServerUpdatable(server),
    )
    if (targets.length === 0) return

    setBatchUpdating(true)
    setUpdateStates((prev) => {
      let next = prev
      for (const server of targets) {
        const current = prev.get(server.id)
        next = new Map(next).set(server.id, {
          loading: current?.loading ?? false,
          triggering: true,
          resetting: false,
          data: current?.data ?? null,
          error: null,
        })
      }
      return next
    })

    try {
      await triggerAllServerUpdates()
      void loadAllUpdateData(
        targets.map((server) => server.id),
        { silent: true },
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      const message =
        err instanceof Error ? err.message : 'Failed to trigger updates'
      setUpdateStates((prev) => {
        let next = prev
        for (const server of targets) {
          const current = prev.get(server.id)
          next = new Map(next).set(server.id, {
            loading: false,
            triggering: false,
            resetting: false,
            data: current?.data ?? null,
            error: message,
          })
        }
        return next
      })
    } finally {
      setBatchUpdating(false)
    }
  }

  const handleResetUpdateStatus = async (serverId: string): Promise<void> => {
    const current = updateStates.get(serverId)
    setUpdateStates((prev) =>
      new Map(prev).set(serverId, {
        loading: current?.loading ?? false,
        triggering: false,
        resetting: true,
        data: current?.data ?? null,
        error: null,
      }),
    )
    try {
      const result = await resetServerUpdateStatus(serverId)
      setUpdateStates((prev) =>
        mergeUpdateEntry(prev, serverId, result, { loading: false }),
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      const message =
        err instanceof Error ? err.message : 'Failed to reset update status'
      setUpdateStates((prev) =>
        new Map(prev).set(serverId, {
          loading: false,
          triggering: false,
          resetting: false,
          data: current?.data ?? null,
          error: message,
        }),
      )
    }
  }

  const refreshServers = async (options?: {
    silent?: boolean
    isCancelled?: () => boolean
  }): Promise<void> => {
    if (!options?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const result = await fetchOrgServers()
      if (options?.isCancelled?.()) return
      setServers(result.servers)
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev
        const next = new Set<string>()
        for (const server of result.servers) {
          if (prev.has(server.id)) next.add(server.id)
        }
        return next.size === prev.size ? prev : next
      })
    } catch (err) {
      if (options?.isCancelled?.()) return
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        setError(
          err instanceof Error ? err.message : 'Access to servers was denied',
        )
      } else {
        reportServersRefreshError(err, options, setError)
      }
    } finally {
      if (!options?.silent && !options?.isCancelled?.()) {
        setLoading(false)
      }
    }
  }

  const getCommandState = (serverId: string): ServerCommandState =>
    commandStates.get(serverId) ?? defaultServerCommandState()

  const patchCommandState = (
    serverId: string,
    patch: Partial<ServerCommandState>,
  ): void => {
    setCommandStates((prev) => {
      const next = new Map(prev)
      const current = prev.get(serverId) ?? defaultServerCommandState()
      next.set(serverId, { ...current, ...patch })
      return next
    })
  }

  const handleCommandPollError = async (
    serverId: string,
    kind: ActiveCommand['kind'],
    err: unknown,
  ): Promise<void> => {
    if (isForbiddenError(err)) {
      await handleUnauthorized()
    }
    const message = err instanceof Error ? err.message : 'Command poll failed'
    if (kind === 'ping') {
      patchCommandState(serverId, {
        pingError: message,
        pingRunning: false,
        activeCommand: null,
      })
    } else if (kind === 'reboot') {
      patchCommandState(serverId, {
        rebootError: message,
        rebootRunning: false,
        activeCommand: null,
      })
    } else {
      patchCommandState(serverId, {
        hostnameError: message,
        hostnameRunning: false,
        activeCommand: null,
      })
    }
  }

  const handlePing = async (serverId: string): Promise<void> => {
    patchCommandState(serverId, {
      pingError: null,
      commandRecord: null,
      pingRunning: true,
    })
    try {
      const result = await pingDaemon(serverId)
      patchCommandState(serverId, {
        activeCommand: { commandId: result.commandId, kind: 'ping' },
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      patchCommandState(serverId, {
        pingError: err instanceof Error ? err.message : 'Failed to ping daemon',
        pingRunning: false,
      })
    }
  }

  const handleReboot = async (serverId: string): Promise<void> => {
    patchCommandState(serverId, {
      rebootError: null,
      commandRecord: null,
      rebootRunning: true,
    })
    try {
      const result = await rebootServer(serverId)
      patchCommandState(serverId, {
        activeCommand: { commandId: result.commandId, kind: 'reboot' },
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      patchCommandState(serverId, {
        rebootError:
          err instanceof Error ? err.message : 'Failed to reboot server',
        rebootRunning: false,
      })
    }
  }

  const handleSetHostname = async (
    serverId: string,
    hostname: string,
  ): Promise<void> => {
    if (!hostname) {
      patchCommandState(serverId, { hostnameError: 'Hostname is required' })
      return
    }

    patchCommandState(serverId, {
      hostnameError: null,
      commandRecord: null,
      hostnameRunning: true,
    })
    try {
      const result = await setServerHostname(serverId, hostname)
      patchCommandState(serverId, {
        activeCommand: { commandId: result.commandId, kind: 'hostname' },
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      patchCommandState(serverId, {
        hostnameError:
          err instanceof Error ? err.message : 'Failed to change hostname',
        hostnameRunning: false,
      })
    }
  }

  const inFlightCommandsKey = [...commandStates.entries()]
    .filter(([, state]) => state.activeCommand !== null)
    .map(([serverId, state]) => `${serverId}:${state.activeCommand!.commandId}`)
    .sort((a, b) => a.localeCompare(b))
    .join(',')

  // Single timer polls every in-flight command; re-runs only when that set changes.
  useEffect(() => {
    if (!inFlightCommandsKey) return

    let cancelled = false

    const onPollRefresh = (): void => {
      void refreshServers({ silent: true })
    }

    const applyPollResult = (
      serverId: string,
      activeCommand: ActiveCommand,
      record: Awaited<ReturnType<typeof fetchCommand>>,
    ): void => {
      setCommandStates((prev) =>
        mergeCommandPollState(
          prev,
          serverId,
          activeCommand,
          record,
          onPollRefresh,
        ),
      )
    }

    const runPoll = (): void => {
      void pollInFlightCommands(
        commandStatesRef.current,
        () => cancelled,
        applyPollResult,
        handleCommandPollError,
      )
    }

    runPoll()
    const timer = setInterval(runPoll, COMMAND_POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlightCommandsKey, handleUnauthorized])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      await refreshServers({ isCancelled: () => cancelled })
    }

    void load()
    const timer = setInterval(
      () => void refreshServers({ silent: true, isCancelled: () => cancelled }),
      SERVERS_REFRESH_MS,
    )

    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, handleUnauthorized])

  // Fetch update status in one batch when servers first appear.
  useEffect(() => {
    const pendingIds = servers
      .map((server) => server.id)
      .filter((serverId) => !updateStates.has(serverId))
    if (pendingIds.length === 0) return
    void loadAllUpdateData(pendingIds, { silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers])

  // While an update is actively in progress, poll just those servers until they
  // reach a terminal state; the effect re-runs and clears the timer once none
  // remain in progress.
  useEffect(() => {
    const inProgressIds = [...updateStates.entries()]
      .filter(([, state]) => state.triggering || state.data?.status === 'updating')
      .map(([serverId]) => serverId)
    if (inProgressIds.length === 0) return

    const timer = setInterval(() => {
      void loadAllUpdateData(inProgressIds, { silent: true })
    }, UPDATE_PROGRESS_POLL_MS)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStates])

  const selectedUpdatableCount = servers.filter(
    (server) => selectedIds.has(server.id) && isServerUpdatable(server),
  ).length

  const allSelected =
    servers.length > 0 && servers.every((server) => selectedIds.has(server.id))
  const someSelected = selectedIds.size > 0 && !allSelected

  const toggleSelectAll = (): void => {
    if (allSelected) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(servers.map((server) => server.id)))
  }

  const toggleSelected = (serverId: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(serverId)) next.delete(serverId)
      else next.add(serverId)
      return next
    })
  }

  const toggleExpanded = (serverId: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(serverId)) next.delete(serverId)
      else next.add(serverId)
      return next
    })
  }

  const anyUpdateInProgress =
    batchUpdating ||
    [...updateStates.values()].some(
      (state) => state.triggering || state.data?.status === 'updating',
    )

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Servers overview</Text>
      <Text style={styles.copy}>
        Hosts assigned to your organization. Connection status refreshes
        periodically.
      </Text>

      <SectionPanel title="Your servers" hint={`Organization ${orgId}`}>
        {canManage ? (
          <View style={styles.batchUpdateRow}>
            <TouchableOpacity
              style={[
                styles.updateButton,
                (anyUpdateInProgress ||
                  batchUpdating ||
                  selectedUpdatableCount === 0) &&
                  styles.updateButtonDisabled,
              ]}
              onPress={() => void handleTriggerSelectedUpdates()}
              disabled={
                anyUpdateInProgress ||
                batchUpdating ||
                selectedUpdatableCount === 0
              }
            >
              {batchUpdating ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : null}
              <Text style={styles.updateButtonText}>
                {selectedUpdateButtonLabel(
                  batchUpdating,
                  selectedUpdatableCount,
                )}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {(() => {
          if (loading && servers.length === 0) {
            return <Text style={orgPanelStyles.muted}>Loading…</Text>
          }
          if (servers.length === 0) {
            return (
              <Text style={orgPanelStyles.muted}>
                No servers are assigned to this organization yet.
              </Text>
            )
          }
          return (
            <ScrollView
              horizontal
              nestedScrollEnabled
              style={styles.tableScroll}
              contentContainerStyle={styles.tableScrollContent}
            >
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                  <View style={[styles.tableCell, styles.colName]}>
                    <Text style={styles.tableHeaderText}>Name / UUID</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colLocation]}>
                    <Text style={styles.tableHeaderText}>Location</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colLinux]}>
                    <Text style={styles.tableHeaderText}>Linux</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colIp]}>
                    <Text style={styles.tableHeaderText}>IP address</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colConnected]}>
                    <Text style={styles.tableHeaderText}>Connected Since</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colStatus]}>
                    <Text style={styles.tableHeaderText}>Status</Text>
                  </View>
                  <View style={[styles.tableCell, styles.colCheck]}>
                    <SelectionCheckbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onPress={toggleSelectAll}
                      accessibilityLabel="Select all servers"
                    />
                  </View>
                </View>
                {servers.map((server) => (
                  <OrgServerTableRow
                    key={server.id}
                    server={server}
                    selected={selectedIds.has(server.id)}
                    expanded={expandedIds.has(server.id)}
                    updateState={
                      updateStates.get(server.id) ?? defaultUpdateState
                    }
                    canManage={canManage}
                    commandState={getCommandState(server.id)}
                    onToggleSelected={() => toggleSelected(server.id)}
                    onToggleExpanded={() => toggleExpanded(server.id)}
                    onTriggerUpdate={handleTriggerUpdate}
                    onResetUpdateStatus={handleResetUpdateStatus}
                    onPing={handlePing}
                    onSetHostname={handleSetHostname}
                    onReboot={handleReboot}
                  />
                ))}
              </View>
            </ScrollView>
          )
        })()}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  batchUpdateRow: {
    marginBottom: spacing.sm,
    alignSelf: 'stretch',
  },
  tableScroll: {
    width: '100%',
    alignSelf: 'stretch',
  },
  tableScrollContent: {
    flexGrow: 1,
    minWidth: '100%',
  },
  table: {
    flexGrow: 1,
    width: '100%',
    minWidth: 980,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRowWrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  tableHeaderRow: {
    backgroundColor: colors.bgSecondary,
  },
  tableRowExpanded: {
    borderBottomWidth: 0,
  },
  tableCell: {
    justifyContent: 'center',
    minWidth: 0,
  },
  tableHeaderText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  colName: {
    flex: 2.2,
    minWidth: 180,
    gap: 2,
  },
  colLocation: {
    flex: 1.4,
    minWidth: 120,
  },
  colLinux: {
    flex: 1.4,
    minWidth: 120,
  },
  colIp: {
    flex: 1.2,
    minWidth: 110,
  },
  colConnected: {
    flex: 1.8,
    minWidth: 150,
  },
  colStatus: {
    flex: 0.9,
    minWidth: 90,
  },
  colCheck: {
    width: 40,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
  },
  nameButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  expandChevron: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 3,
    width: 12,
  },
  nameText: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  uuidText: {
    color: colors.textDim,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  cellText: {
    color: colors.textBody,
    fontSize: 13,
  },
  cellTextMuted: {
    color: colors.textDim,
    fontSize: 13,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusOnline: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  statusOffline: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusTextOnline: {
    color: colors.accent,
  },
  statusTextOffline: {
    color: colors.textDim,
  },
  checkboxHit: {
    padding: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  checkboxMark: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  expandedPanel: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgInset,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  updatePanel: {
    gap: spacing.xs,
  },
  errorText: {
    color: colors.errorText,
    fontSize: 12,
  },
  updateHeading: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  updateBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  updateBadgeAvailable: {
    borderColor: colors.pending,
    backgroundColor: colors.bgSecondary,
  },
  updateBadgeUpdating: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  updateBadgeError: {
    borderColor: colors.error,
    backgroundColor: colors.bgSecondary,
  },
  updateBadgeCurrent: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  updateBadgeUnknown: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  updateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  updateBadgeTextAvailable: {
    color: colors.pending,
  },
  updateBadgeTextUpdating: {
    color: colors.accent,
  },
  updateBadgeTextError: {
    color: colors.error,
  },
  updateBadgeTextCurrent: {
    color: colors.textDim,
  },
  updateBadgeTextUnknown: {
    color: colors.textDim,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgActive,
  },
  updateButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  resetUpdateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  resetUpdateButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  updateButtonDisabled: {
    opacity: 0.5,
  },
  updateButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  cellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
})

function OrgServerTableRow({
  server,
  selected,
  expanded,
  updateState,
  canManage,
  commandState,
  onToggleSelected,
  onToggleExpanded,
  onTriggerUpdate,
  onResetUpdateStatus,
  onPing,
  onSetHostname,
  onReboot,
}: Readonly<{
  server: OrgServerRecord
  selected: boolean
  expanded: boolean
  updateState: UpdateState
  canManage: boolean
  commandState: ServerCommandState
  onToggleSelected: () => void
  onToggleExpanded: () => void
  onTriggerUpdate: (serverId: string) => Promise<void>
  onResetUpdateStatus: (serverId: string) => Promise<void>
  onPing: (serverId: string) => Promise<void>
  onSetHostname: (serverId: string, hostname: string) => Promise<void>
  onReboot: (serverId: string) => Promise<void>
}>) {
  const viewModel = deriveServerUpdateViewModel(server, updateState)
  const location = formatLocationCell(server.geo)
  const linux = server.osDisplay?.trim() || EMPTY_CELL
  const ip =
    server.connected && server.remoteAddress
      ? server.remoteAddress
      : EMPTY_CELL
  const connectedSince = formatConnectedSinceCell(
    server.connected,
    server.connectedAt,
  )

  return (
    <View style={styles.tableRowWrap}>
      <View
        style={[styles.tableRow, expanded ? styles.tableRowExpanded : null]}
      >
        <View style={[styles.tableCell, styles.colName]}>
          <Pressable
            onPress={onToggleExpanded}
            style={styles.nameButton}
            accessibilityRole="button"
            accessibilityLabel={
              expanded ? 'Collapse server details' : 'Expand server details'
            }
          >
            <Text style={styles.expandChevron}>{expanded ? '▾' : '▸'}</Text>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.nameText} numberOfLines={1}>
                {serverTitle(server)}
              </Text>
              <Text style={styles.uuidText} selectable numberOfLines={1}>
                {server.id}
              </Text>
            </View>
          </Pressable>
        </View>
        <View style={[styles.tableCell, styles.colLocation]}>
          <Text
            style={location === EMPTY_CELL ? styles.cellTextMuted : styles.cellText}
            numberOfLines={2}
          >
            {location}
          </Text>
        </View>
        <View style={[styles.tableCell, styles.colLinux]}>
          <Text
            style={linux === EMPTY_CELL ? styles.cellTextMuted : styles.cellText}
            numberOfLines={2}
          >
            {linux}
          </Text>
        </View>
        <View style={[styles.tableCell, styles.colIp]}>
          <Text
            style={ip === EMPTY_CELL ? styles.cellTextMuted : styles.cellText}
            selectable={ip !== EMPTY_CELL}
            numberOfLines={1}
          >
            {ip}
          </Text>
        </View>
        <View style={[styles.tableCell, styles.colConnected]}>
          <Text
            style={
              connectedSince === EMPTY_CELL
                ? styles.cellTextMuted
                : styles.cellText
            }
            numberOfLines={2}
          >
            {connectedSince}
          </Text>
        </View>
        <View style={[styles.tableCell, styles.colStatus]}>
          <View
            style={[
              styles.statusBadge,
              server.connected ? styles.statusOnline : styles.statusOffline,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                server.connected
                  ? styles.statusTextOnline
                  : styles.statusTextOffline,
              ]}
            >
              {server.connected ? 'Running' : 'Offline'}
            </Text>
          </View>
        </View>
        <View style={[styles.tableCell, styles.colCheck]}>
          <SelectionCheckbox
            checked={selected}
            onPress={onToggleSelected}
            accessibilityLabel={`Select ${serverTitle(server)}`}
          />
        </View>
      </View>
      {expanded ? (
        <View style={styles.expandedPanel}>
          {viewModel.colocated ? (
            <Text style={orgPanelStyles.muted}>
              This server runs on the same host as the control plane. Remote
              trunk updates are disabled — use local git instead.
            </Text>
          ) : null}
          <ServerUpdatePanel
            server={server}
            updateState={updateState}
            updateData={viewModel.updateData}
            colocated={viewModel.colocated}
            canManage={canManage}
            isUpdateStatusLoading={viewModel.isUpdateStatusLoading}
            isUpdateInProgress={viewModel.isUpdateInProgress}
            canResetUpdateStatus={viewModel.canResetUpdateStatus}
            targetKnown={viewModel.targetKnown}
            runningVersionUnknown={viewModel.runningVersionUnknown}
            badgeVariant={viewModel.badgeVariant}
            onTriggerUpdate={onTriggerUpdate}
            onResetUpdateStatus={onResetUpdateStatus}
          />
          <ServerCommandsPanel
            server={server}
            canManage={canManage}
            showReboot={!viewModel.colocated}
            commandState={commandState}
            onPing={() => void onPing(server.id)}
            onSetHostname={(hostname) =>
              void onSetHostname(server.id, hostname)
            }
            onReboot={() => void onReboot(server.id)}
          />
        </View>
      ) : null}
    </View>
  )
}

function ServerUpdateStatus({
  updateData,
  colocated,
  isUpdateStatusLoading,
  runningVersionUnknown,
  badgeVariant,
}: Readonly<{
  updateData: ServerUpdateStatus | null
  colocated: boolean
  isUpdateStatusLoading: boolean
  runningVersionUnknown: boolean
  badgeVariant: UpdateBadgeVariant
}>) {
  const badgePresentation = pickUpdateBadgeStyles(badgeVariant, styles)

  if (isUpdateStatusLoading) {
    return (
      <View style={styles.cellRow}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={orgPanelStyles.muted}>Loading update status…</Text>
      </View>
    )
  }

  if (!updateData) return null

  return (
    <>
      <View style={[styles.updateBadge, badgePresentation.container]}>
        <Text style={[styles.updateBadgeText, badgePresentation.text]}>
          {updateBadgeLabel(badgeVariant, runningVersionUnknown)}
        </Text>
      </View>
      {updateData.lastUpdateError && updateData.updateAvailable && !colocated ? (
        <Text style={orgPanelStyles.muted}>
          Last attempt: {updateData.lastUpdateError}
        </Text>
      ) : null}
    </>
  )
}

function ServerUpdateActions({
  server,
  updateState,
  updateData,
  colocated,
  canManage,
  isUpdateStatusLoading,
  isUpdateInProgress,
  canResetUpdateStatus,
  targetKnown,
  onTriggerUpdate,
  onResetUpdateStatus,
}: Readonly<{
  server: OrgServerRecord
  updateState: UpdateState
  updateData: ServerUpdateStatus | null
  colocated: boolean
  canManage: boolean
  isUpdateStatusLoading: boolean
  isUpdateInProgress: boolean
  canResetUpdateStatus: boolean
  targetKnown: boolean
  onTriggerUpdate: (serverId: string) => Promise<void>
  onResetUpdateStatus: (serverId: string) => Promise<void>
}>) {
  if (!canManage) return null

  const updateButtonDisabled =
    isUpdateStatusLoading ||
    isUpdateInProgress ||
    !server.connected ||
    !targetKnown ||
    colocated ||
    !updateData?.updateAvailable

  return (
    <View style={styles.updateButtonRow}>
      <TouchableOpacity
        style={[
          styles.updateButton,
          updateButtonDisabled && styles.updateButtonDisabled,
        ]}
        onPress={() => void onTriggerUpdate(server.id)}
        disabled={updateButtonDisabled}
      >
        {isUpdateStatusLoading ||
        (isUpdateInProgress && updateState.triggering) ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : null}
        <Text style={styles.updateButtonText}>
          {updateButtonLabel({
            isUpdateStatusLoading,
            isUpdateInProgress:
              updateState.triggering || updateData?.status === 'updating',
            connected: server.connected,
            targetKnown,
            colocated,
            updateAvailable: updateData?.updateAvailable,
          })}
        </Text>
      </TouchableOpacity>

      {canResetUpdateStatus ? (
        <TouchableOpacity
          style={[
            styles.resetUpdateButton,
            updateState.resetting && styles.updateButtonDisabled,
          ]}
          onPress={() => void onResetUpdateStatus(server.id)}
          disabled={updateState.resetting}
        >
          {updateState.resetting ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : null}
          <Text style={styles.resetUpdateButtonText}>
            {resetUpdateButtonLabel(
              updateState.resetting,
              updateData?.status,
            )}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function ServerUpdatePanel({
  server,
  updateState,
  updateData,
  colocated,
  canManage,
  isUpdateStatusLoading,
  isUpdateInProgress,
  canResetUpdateStatus,
  targetKnown,
  runningVersionUnknown,
  badgeVariant,
  onTriggerUpdate,
  onResetUpdateStatus,
}: Readonly<{
  server: OrgServerRecord
  updateState: UpdateState
  updateData: ServerUpdateStatus | null
  colocated: boolean
  canManage: boolean
  isUpdateStatusLoading: boolean
  isUpdateInProgress: boolean
  canResetUpdateStatus: boolean
  targetKnown: boolean
  runningVersionUnknown: boolean
  badgeVariant: UpdateBadgeVariant
  onTriggerUpdate: (serverId: string) => Promise<void>
  onResetUpdateStatus: (serverId: string) => Promise<void>
}>) {
  return (
    <View style={styles.updatePanel}>
      <Text style={styles.updateHeading}>Daemon version</Text>

      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Running: </Text>
        {shortCommit(updateData?.current?.commit)}
      </Text>

      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Trunk: </Text>
        {updateData?.targetStatus === 'unknown'
          ? 'Unknown'
          : shortCommit(updateData?.target?.commit)}
      </Text>

      {updateData?.targetStatus === 'unknown' && updateData.targetError ? (
        <Text style={orgPanelStyles.muted}>{updateData.targetError}</Text>
      ) : null}

      {updateData?.updateBlocked && updateData.updateBlockedReason ? (
        <Text style={orgPanelStyles.muted}>
          {updateData.updateBlockedReason}
        </Text>
      ) : null}

      <ServerUpdateStatus
        updateData={updateData}
        colocated={colocated}
        isUpdateStatusLoading={isUpdateStatusLoading}
        runningVersionUnknown={runningVersionUnknown}
        badgeVariant={badgeVariant}
      />

      <ServerUpdateActions
        server={server}
        updateState={updateState}
        updateData={updateData}
        colocated={colocated}
        canManage={canManage}
        isUpdateStatusLoading={isUpdateStatusLoading}
        isUpdateInProgress={isUpdateInProgress}
        canResetUpdateStatus={canResetUpdateStatus}
        targetKnown={targetKnown}
        onTriggerUpdate={onTriggerUpdate}
        onResetUpdateStatus={onResetUpdateStatus}
      />

      {updateState.error ? (
        <Text style={styles.errorText}>{updateState.error}</Text>
      ) : null}
    </View>
  )
}

function pickUpdateBadgeStyles(
  variant: UpdateBadgeVariant,
  s: typeof styles,
): { container: object; text: object } {
  switch (variant) {
    case 'updating':
      return {
        container: s.updateBadgeUpdating,
        text: s.updateBadgeTextUpdating,
      }
    case 'error':
      return {
        container: s.updateBadgeError,
        text: s.updateBadgeTextError,
      }
    case 'colocated':
    case 'current':
      return {
        container: s.updateBadgeCurrent,
        text: s.updateBadgeTextCurrent,
      }
    case 'unknown':
      return {
        container: s.updateBadgeUnknown,
        text: s.updateBadgeTextUnknown,
      }
    case 'available':
      return {
        container: s.updateBadgeAvailable,
        text: s.updateBadgeTextAvailable,
      }
  }
}
