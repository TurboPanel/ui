import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Link, useRouter, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import { useQueryClient } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { TurboPanelLogoMark } from '@/components/brand/turbopanel-logo'
import { SectionPanel } from '@/components/org/section-panel'
import {
  defaultServerCommandState,
  isTerminalCommandStatus,
  ServerCommandsPanel,
  type ActiveCommand,
  type ServerCommandState,
} from '@/components/org/server-commands-panel'
import { ServerMetricsSection } from '@/components/org/server-metrics-section'
import { ServerNetworkSection } from '@/components/org/server-network-section'
import { ServerSystemComponentPanel } from '@/components/org/server-system-component-panel'
import { ServerTimeSection } from '@/components/org/server-time-section'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { formatLocalDateTime } from '@/lib/format-datetime'
import {
  defaultOrgDashboardHref,
  SERVER_DETAIL_TAB_IDS,
  SERVER_DETAIL_TAB_LABELS,
  type ServerDetailTabId,
} from '@/lib/org-navigation'
import {
  formatServerDeleteBlockedError,
  isForbiddenError,
  type CommandEnqueueResponse,
  type CommandRecord,
  type OrgServerRecord,
  type ServerDetailRecord,
  type ServerOsLogoKey,
  type ServerUpdateStatus,
} from '@/lib/instance-api'
import { useCommandsBatch } from '@/lib/queries/commands'
import {
  useDeleteServer,
  usePingDaemon,
  useRebootServer,
  useResetServerUpdateStatus,
  useServerDetail,
  useServerUpdateStatus,
  useSetServerHostname,
  useTriggerServerUpdate,
} from '@/lib/queries/servers'
import { useCan, queryKeys } from '@/lib/query-client'
import { osLogoSource } from '@/lib/os-logos'
import {
  resolveServerConnectionStatus,
  serverConnectionStatusLabel,
  type ServerConnectionStatus,
} from '@/lib/server-connection-status'
import {
  countryCodeToFlagEmoji,
  formatServerGeoAsn,
  formatServerGeoCountryCode,
  formatServerGeoLocation,
} from '@/lib/server-geo'
import { chrome, colors, spacing } from '@/lib/theme'

type DetailActiveCommand = ActiveCommand

type DetailPollCommand = {
  commandId: string
  kind: ActiveCommand['kind'] | 'timezone' | 'ntp' | 'systemRestart'
  /** When kind is systemRestart — invalidate this environment's containers. */
  environmentId?: string
}

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

function parseTabParam(raw: string | string[] | undefined): ServerDetailTabId {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value && (SERVER_DETAIL_TAB_IDS as readonly string[]).includes(value)) {
    return value as ServerDetailTabId
  }
  return 'overview'
}

function serverTitle(server: Pick<OrgServerRecord, 'displayName' | 'hostname' | 'id'>): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function shortCommit(commit?: string | null): string {
  return commit ? commit.slice(0, 12) : 'Unknown'
}

function resolveOsLogoKey(server: OrgServerRecord): ServerOsLogoKey | null {
  if (server.osLogo) return server.osLogo
  const id = server.os?.id?.toLowerCase()
  if (server.os?.variant === 'raspberry-pi-os') return 'raspberry-pi-os'
  if (id === 'debian') return 'debian'
  return null
}

function isColocatedServer(
  server: ServerDetailRecord,
  updateData?: ServerUpdateStatus | null,
): boolean {
  return (
    server.colocatedWithInstance === true ||
    updateData?.colocatedWithInstance === true ||
    updateData?.updateBlocked === true
  )
}

function connectionStatusDotStyle(status: ServerConnectionStatus) {
  switch (status) {
    case 'online':
      return styles.statusDotOnline
    case 'initializing':
      return styles.statusDotInitializing
    case 'offline':
      return styles.statusDotOffline
  }
}

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
      return 'Co-located daemon'
    case 'unknown':
      return runningVersionUnknown ? 'Version unknown' : 'Target unavailable'
    case 'available':
      return 'Update available'
    case 'current':
      return 'Up to date'
  }
}

function applyDetailCommandPollResult(
  current: ServerCommandState,
  activeCommand: DetailActiveCommand,
  record: CommandRecord,
  onSucceeded: () => void,
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
      onSucceeded()
    }
    return updated
  }

  updated.hostnameRunning = false
  if (record.status === 'succeeded') {
    onSucceeded()
  } else {
    updated.hostnameError = record.error ?? `Hostname change ${record.status}`
  }
  return updated
}

function DetailTabBody({
  tab,
  orgId,
  serverId,
  server,
  canManage,
  commandState,
  timezoneCommandInFlight,
  timezonePollError,
  ntpCommandInFlight,
  ntpPollError,
  updateState,
  updateVm,
  onPing,
  onSetHostname,
  onReboot,
  onTriggerUpdate,
  onResetUpdate,
  onEnqueueCommand,
  systemRestartInFlight,
  systemRestartPollError,
  deletePanel,
}: Readonly<{
  tab: ServerDetailTabId
  orgId: string
  serverId: string
  server: ServerDetailRecord
  canManage: boolean
  commandState: ServerCommandState
  timezoneCommandInFlight: boolean
  timezonePollError: string | null
  ntpCommandInFlight: boolean
  ntpPollError: string | null
  updateState: UpdateState
  updateVm: ReturnType<typeof deriveServerUpdateViewModel>
  onPing: () => void
  onSetHostname: (hostname: string) => void
  onReboot: () => void
  onTriggerUpdate: () => void
  onResetUpdate: () => void
  onEnqueueCommand: (
    response: CommandEnqueueResponse,
    kind: 'timezone' | 'ntp' | 'systemRestart',
    meta?: Readonly<{ environmentId?: string }>,
  ) => void
  systemRestartInFlight: boolean
  systemRestartPollError: string | null
  deletePanel: ReactNode
}>): ReactNode {
  switch (tab) {
    case 'overview':
      return <ServerOverviewTab server={server} />
    case 'control':
      return (
        <ServerControlTab
          orgId={orgId}
          server={server}
          canManage={canManage}
          commandState={commandState}
          updateState={updateState}
          viewModel={updateVm}
          onPing={onPing}
          onSetHostname={onSetHostname}
          onReboot={onReboot}
          onTriggerUpdate={onTriggerUpdate}
          onResetUpdate={onResetUpdate}
          systemRestartInFlight={systemRestartInFlight}
          systemRestartPollError={systemRestartPollError}
          onEnqueueRestart={(response, environmentId) => {
            onEnqueueCommand(response, 'systemRestart', { environmentId })
          }}
          deletePanel={deletePanel}
        />
      )
    case 'time':
      return (
        <ServerTimeSection
          orgId={orgId}
          server={server}
          canManage={canManage}
          timezoneCommandInFlight={timezoneCommandInFlight}
          timezonePollError={timezonePollError}
          ntpCommandInFlight={ntpCommandInFlight}
          ntpPollError={ntpPollError}
          onEnqueueCommand={onEnqueueCommand}
        />
      )
    case 'network':
      return <ServerNetworkSection orgId={orgId} server={server} />
    case 'metrics':
      return (
        <ServerMetricsSection orgId={orgId} serverId={serverId} embedded />
      )
    default:
      return <ServerOverviewTab server={server} />
  }
}

function deriveServerUpdateViewModel(
  server: ServerDetailRecord,
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

function isControlCommandKind(
  kind: DetailPollCommand['kind'],
): kind is ActiveCommand['kind'] {
  return kind === 'ping' || kind === 'hostname' || kind === 'reboot'
}

function removePollCommandById(
  prev: DetailPollCommand[],
  commandId: string,
): DetailPollCommand[] {
  return prev.filter((item) => item.commandId !== commandId)
}

function applyTerminalPollSuccess(
  entry: DetailPollCommand,
  record: CommandRecord,
  handlers: Readonly<{
    onRefreshServer: () => void
    setCommandState: Dispatch<SetStateAction<ServerCommandState>>
    setTimezonePollError: (error: string | null) => void
    setNtpPollError: (error: string | null) => void
    setSystemRestartPollError: (error: string | null) => void
    invalidateSystemContainers: (environmentId: string | undefined) => void
  }>,
): void {
  if (isControlCommandKind(entry.kind)) {
    handlers.setCommandState((prev) => {
      const active = prev.activeCommand
      if (active?.commandId !== entry.commandId) {
        return prev
      }
      return (
        applyDetailCommandPollResult(prev, active, record, handlers.onRefreshServer) ??
        prev
      )
    })
    return
  }

  if (entry.kind === 'timezone') {
    if (record.status === 'succeeded') {
      handlers.setTimezonePollError(null)
      handlers.onRefreshServer()
      return
    }
    handlers.setTimezonePollError(
      record.error ?? `Timezone change ${record.status}`,
    )
    return
  }

  if (entry.kind === 'systemRestart') {
    if (record.status === 'succeeded') {
      handlers.setSystemRestartPollError(null)
      handlers.invalidateSystemContainers(entry.environmentId)
      return
    }
    handlers.setSystemRestartPollError(
      record.error ?? `System restart ${record.status}`,
    )
    return
  }

  if (record.status === 'succeeded') {
    handlers.setNtpPollError(null)
    handlers.onRefreshServer()
    return
  }
  handlers.setNtpPollError(record.error ?? `NTP change ${record.status}`)
}

function applyPollFailure(
  entry: DetailPollCommand,
  err: unknown,
  handlers: Readonly<{
    patchCommand: (patch: Partial<ServerCommandState>) => void
    setTimezonePollError: (error: string | null) => void
    setNtpPollError: (error: string | null) => void
    setSystemRestartPollError: (error: string | null) => void
  }>,
): void {
  if (isControlCommandKind(entry.kind)) {
    handlers.patchCommand({
      activeCommand: null,
      pingRunning: false,
      hostnameRunning: false,
      rebootRunning: false,
    })
    return
  }
  if (entry.kind === 'timezone') {
    handlers.setTimezonePollError(
      err instanceof Error ? err.message : 'Failed to poll timezone command',
    )
    return
  }
  if (entry.kind === 'systemRestart') {
    handlers.setSystemRestartPollError(
      err instanceof Error ? err.message : 'Failed to poll system restart',
    )
    return
  }
  handlers.setNtpPollError(
    err instanceof Error ? err.message : 'Failed to poll NTP command',
  )
}

type PollHandlers = Readonly<{
  onRefreshServer: () => void
  setCommandState: Dispatch<SetStateAction<ServerCommandState>>
  setTimezonePollError: (error: string | null) => void
  setNtpPollError: (error: string | null) => void
  setSystemRestartPollError: (error: string | null) => void
  invalidateSystemContainers: (environmentId: string | undefined) => void
  patchCommand: (patch: Partial<ServerCommandState>) => void
}>

function renderServerDeletePanel(input: Readonly<{
  canManage: boolean
  colocated: boolean
  deleting: boolean
  deleteError: string | null
  confirmingDelete: boolean
  onRequestConfirm: () => void
  onCancel: () => void
  onConfirm: () => void
}>): ReactNode {
  if (!input.canManage) return null
  if (input.colocated) {
    return (
      <Text style={orgPanelStyles.muted}>
        The co-located control plane server cannot be deleted.
      </Text>
    )
  }
  return (
    <ServerDeletePanel
      deleting={input.deleting}
      deleteError={input.deleteError}
      confirming={input.confirmingDelete}
      onRequestConfirm={input.onRequestConfirm}
      onCancel={input.onCancel}
      onConfirm={input.onConfirm}
    />
  )
}

function ServerDetailLoading(): ReactNode {
  return (
    <View style={styles.loadingRow}>
      <ActivityIndicator size="small" color={colors.accent} />
      <Text style={orgPanelStyles.muted}>Loading server…</Text>
    </View>
  )
}

function ServerDetailError({ message }: Readonly<{ message: string }>): ReactNode {
  return <Text style={orgPanelStyles.error}>{message}</Text>
}

export function ServerDetailSection({
  orgId,
  serverId,
}: Readonly<{ orgId: string; serverId: string }>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string | string[] }>()
  const activeTab = parseTabParam(tabParam)

  const serverQuery = useServerDetail(orgId, serverId)
  const updateStatusQuery = useServerUpdateStatus(orgId, serverId)
  const triggerUpdateMutation = useTriggerServerUpdate(orgId, serverId)
  const resetUpdateMutation = useResetServerUpdateStatus(orgId, serverId)
  const pingMutation = usePingDaemon(orgId, serverId)
  const hostnameMutation = useSetServerHostname(orgId, serverId)
  const rebootMutation = useRebootServer(orgId, serverId)
  const deleteMutation = useDeleteServer(orgId)

  const [commandState, setCommandState] = useState<ServerCommandState>(
    defaultServerCommandState(),
  )
  const [pollCommands, setPollCommands] = useState<DetailPollCommand[]>([])
  const [timezonePollError, setTimezonePollError] = useState<string | null>(null)
  const [ntpPollError, setNtpPollError] = useState<string | null>(null)
  const [systemRestartPollError, setSystemRestartPollError] = useState<
    string | null
  >(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const server = serverQuery.data

  const updateState = useMemo((): UpdateState => {
    const data = updateStatusQuery.data ?? null
    let error: string | null = null
    if (triggerUpdateMutation.actionError) {
      error = triggerUpdateMutation.actionError
    } else if (resetUpdateMutation.actionError) {
      error = resetUpdateMutation.actionError
    } else if (updateStatusQuery.error instanceof Error) {
      error = updateStatusQuery.error.message
    }
    return {
      loading: updateStatusQuery.isLoading,
      triggering:
        triggerUpdateMutation.isPending || data?.status === 'updating',
      resetting: resetUpdateMutation.isPending,
      data,
      error,
    }
  }, [
    updateStatusQuery.data,
    updateStatusQuery.isLoading,
    updateStatusQuery.error,
    triggerUpdateMutation.isPending,
    triggerUpdateMutation.actionError,
    resetUpdateMutation.isPending,
    resetUpdateMutation.actionError,
  ])

  const commandBatchEntries = useMemo(
    () =>
      pollCommands.map((entry) => ({
        serverId,
        commandId: entry.commandId,
      })),
    [pollCommands, serverId],
  )

  const commandsQuery = useCommandsBatch(orgId, commandBatchEntries)
  const processedCommandIdsRef = useRef<Set<string>>(new Set())

  const invalidateServer = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).servers.detail(serverId),
    })
  }

  const patchCommand = (patch: Partial<ServerCommandState>) => {
    setCommandState((prev) => ({ ...prev, ...patch }))
  }

  const registerPollCommand = (entry: DetailPollCommand) => {
    processedCommandIdsRef.current.delete(entry.commandId)
    setPollCommands((prev) =>
      prev.some((item) => item.commandId === entry.commandId)
        ? prev
        : [...prev, entry],
    )
  }

  const timezoneCommandInFlight = pollCommands.some((item) => item.kind === 'timezone')
  const ntpCommandInFlight = pollCommands.some((item) => item.kind === 'ntp')
  const systemRestartInFlight = pollCommands.some(
    (item) => item.kind === 'systemRestart',
  )

  const invalidateSystemContainers = (environmentId: string | undefined) => {
    if (!environmentId) return
    void queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).containers.list({ environmentId }),
    })
  }

  useEffect(() => {
    const records = commandsQuery.data
    if (!records || records.length === 0) return

    const pollHandlers: PollHandlers = {
      onRefreshServer: invalidateServer,
      setCommandState,
      setTimezonePollError,
      setNtpPollError,
      setSystemRestartPollError,
      invalidateSystemContainers,
      patchCommand,
    }

    for (let index = 0; index < pollCommands.length; index += 1) {
      const entry = pollCommands[index]
      const record = records[index]
      if (!entry || !record) continue
      if (!isTerminalCommandStatus(record.status)) continue
      if (processedCommandIdsRef.current.has(entry.commandId)) continue

      processedCommandIdsRef.current.add(entry.commandId)
      applyTerminalPollSuccess(entry, record, pollHandlers)
      setPollCommands((prev) => removePollCommandById(prev, entry.commandId))
    }
  }, [commandsQuery.data, pollCommands, serverId])

  useEffect(() => {
    if (!commandsQuery.error || pollCommands.length === 0) return

    const pollHandlers: PollHandlers = {
      onRefreshServer: invalidateServer,
      setCommandState,
      setTimezonePollError,
      setNtpPollError,
      setSystemRestartPollError,
      invalidateSystemContainers,
      patchCommand,
    }

    for (const entry of pollCommands) {
      applyPollFailure(entry, commandsQuery.error, pollHandlers)
    }
    setPollCommands([])
  }, [commandsQuery.error, pollCommands])

  const setTab = (tabId: ServerDetailTabId) => {
    router.setParams({ tab: tabId })
  }

  if (serverQuery.isLoading && !server) {
    return <ServerDetailLoading />
  }

  if (serverQuery.isError || !server) {
    const message =
      serverQuery.error instanceof Error
        ? serverQuery.error.message
        : 'Failed to load server'
    return <ServerDetailError message={message} />
  }

  const updateVm = deriveServerUpdateViewModel(server, updateState)
  const flag = countryCodeToFlagEmoji(server.geo?.country)
  const logo = osLogoSource(resolveOsLogoKey(server))
  const title = serverTitle(server)
  const hostname = server.hostname?.trim()
  const connectedVia = resolveConnectedViaLabel(server)
  const connectionStatus = resolveServerConnectionStatus(server)

  const onPing = () => {
    patchCommand({ pingError: null, pingRunning: true, commandRecord: null })
    pingMutation.mutate(undefined, {
      onSuccess: (result) => {
        const entry: ActiveCommand = { commandId: result.commandId, kind: 'ping' }
        registerPollCommand(entry)
        patchCommand({ activeCommand: entry })
      },
      onError: (err) => {
        if (isForbiddenError(err)) return
        patchCommand({
          pingError: err instanceof Error ? err.message : 'Ping failed',
          pingRunning: false,
        })
      },
    })
  }

  const onSetHostname = (host: string) => {
    if (!host) {
      patchCommand({ hostnameError: 'Hostname is required' })
      return
    }
    patchCommand({ hostnameError: null, hostnameRunning: true, commandRecord: null })
    hostnameMutation.mutate(host, {
      onSuccess: (result) => {
        const entry: ActiveCommand = {
          commandId: result.commandId,
          kind: 'hostname',
        }
        registerPollCommand(entry)
        patchCommand({ activeCommand: entry })
      },
      onError: (err) => {
        if (isForbiddenError(err)) return
        patchCommand({
          hostnameError:
            err instanceof Error ? err.message : 'Hostname change failed',
          hostnameRunning: false,
        })
      },
    })
  }

  const onReboot = () => {
    patchCommand({ rebootError: null, rebootRunning: true, commandRecord: null })
    rebootMutation.mutate(undefined, {
      onSuccess: (result) => {
        const entry: ActiveCommand = { commandId: result.commandId, kind: 'reboot' }
        registerPollCommand(entry)
        patchCommand({ activeCommand: entry })
      },
      onError: (err) => {
        if (isForbiddenError(err)) return
        patchCommand({
          rebootError: err instanceof Error ? err.message : 'Reboot failed',
          rebootRunning: false,
        })
      },
    })
  }

  const onTriggerUpdate = () => {
    triggerUpdateMutation.mutate()
  }

  const onResetUpdate = () => {
    resetUpdateMutation.mutate()
  }

  const deletePanel = renderServerDeletePanel({
    canManage,
    colocated: updateVm.colocated,
    deleting: deleteMutation.isPending,
    deleteError,
    confirmingDelete,
    onRequestConfirm: () => setConfirmingDelete(true),
    onCancel: () => setConfirmingDelete(false),
    onConfirm: () => {
      setConfirmingDelete(false)
      setDeleteError(null)
      deleteMutation.mutate(serverId, {
        onSuccess: () => {
          router.replace(defaultOrgDashboardHref(orgId))
        },
        onError: (err) => {
          if (isForbiddenError(err)) return
          setDeleteError(formatServerDeleteBlockedError(err))
        },
      })
    },
  })

  return (
    <View style={styles.root}>
      <Link href={defaultOrgDashboardHref(orgId)} asChild>
        <Pressable style={({ pressed }) => [styles.backLink, pressed && styles.pressed, webPointer]}>
          <Text style={styles.backText}>← Fleet</Text>
        </Pressable>
      </Link>

      <View style={styles.header}>
        {logo ? (
          <Image source={logo} style={styles.osLogo} contentFit="contain" />
        ) : null}
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {hostname && hostname !== title ? (
            <Text style={styles.hostname}>{hostname}</Text>
          ) : null}
          <View style={styles.headerMeta}>
            <View
              style={[
                styles.statusDot,
                connectionStatusDotStyle(connectionStatus),
              ]}
            />
            <Text style={styles.statusLabel}>
              {serverConnectionStatusLabel(connectionStatus)}
            </Text>
            {flag ? <Text style={styles.flag}>{flag}</Text> : null}
            {updateVm.colocated ? (
              <View
                style={styles.instanceDaemonBadge}
                accessibilityRole="text"
                accessibilityLabel="Instance Daemon"
              >
                <TurboPanelLogoMark
                  size={12}
                  square
                  accessibilityLabel=""
                />
                <Text style={styles.instanceDaemonBadgeText}>Instance Daemon</Text>
              </View>
            ) : null}
          </View>
          {connectedVia ? (
            <Text style={styles.connectedVia}>{connectedVia}</Text>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={orgPanelStyles.segmentGroup}>
          {SERVER_DETAIL_TAB_IDS.map((tabId) => {
            const active = tabId === activeTab
            return (
              <Pressable
                key={tabId}
                onPress={() => setTab(tabId)}
                style={[
                  orgPanelStyles.segmentChip,
                  active && orgPanelStyles.segmentChipActive,
                  webPointer,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    orgPanelStyles.segmentChipText,
                    active && orgPanelStyles.segmentChipTextActive,
                  ]}
                >
                  {SERVER_DETAIL_TAB_LABELS[tabId]}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>

      <DetailTabBody
        tab={activeTab}
        orgId={orgId}
        serverId={serverId}
        server={server}
        canManage={canManage}
        commandState={commandState}
        timezoneCommandInFlight={timezoneCommandInFlight}
        timezonePollError={timezonePollError}
        ntpCommandInFlight={ntpCommandInFlight}
        ntpPollError={ntpPollError}
        updateState={updateState}
        updateVm={updateVm}
        onPing={onPing}
        onSetHostname={onSetHostname}
        onReboot={onReboot}
        onTriggerUpdate={onTriggerUpdate}
        onResetUpdate={onResetUpdate}
        onEnqueueCommand={(response, kind, meta) => {
          if (kind === 'timezone') {
            setTimezonePollError(null)
          } else if (kind === 'ntp') {
            setNtpPollError(null)
          } else {
            setSystemRestartPollError(null)
          }
          registerPollCommand({
            commandId: response.commandId,
            kind,
            environmentId: meta?.environmentId,
          })
        }}
        systemRestartInFlight={systemRestartInFlight}
        systemRestartPollError={systemRestartPollError}
        deletePanel={deletePanel}
      />
    </View>
  )
}

/**
 * Header connection line — colocated Unix socket or observed connecting IP.
 * `remoteAddress` is egress seen by the control plane; `__direct__` is local socket.
 */
function resolveConnectedViaLabel(server: ServerDetailRecord): string | null {
  const raw = server.remoteAddress?.trim() ?? ''
  if (server.colocatedWithInstance === true || raw === '__direct__') {
    return 'via Local Unix Socket'
  }
  if (raw) {
    return `via ${raw}`
  }
  return null
}

function ServerOverviewTab({
  server,
}: Readonly<{ server: ServerDetailRecord }>) {
  const geoLine = formatServerGeoLocation(server.geo)
  const country = formatServerGeoCountryCode(server.geo)
  const asn = formatServerGeoAsn(server.geo)
  const hasGeo = Boolean(geoLine || country || asn)

  let timezoneSource = 'Not set'
  if (server.timezoneSource === 'server') timezoneSource = 'Server override'
  if (server.timezoneSource === 'organization') timezoneSource = 'Organization default'

  return (
    <View style={styles.tabBody}>
      <SectionPanel title="Identity">
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Display name: </Text>
          {server.displayName ?? '—'}
        </Text>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>ID: </Text>
          <Text style={styles.mono}>{server.id}</Text>
        </Text>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Created: </Text>
          {formatLocalDateTime(server.createdAt)}
        </Text>
      </SectionPanel>

      <SectionPanel title="Operating system">
        <Text style={orgPanelStyles.detailLine}>
          {server.osDisplay ?? 'Not reported yet'}
        </Text>
        {server.os?.arch ? (
          <Text style={orgPanelStyles.muted}>Arch: {server.os.arch}</Text>
        ) : null}
        {server.os?.versionCodename ? (
          <Text style={orgPanelStyles.muted}>
            Codename: {server.os.versionCodename}
          </Text>
        ) : null}
      </SectionPanel>

      {hasGeo ? (
        <SectionPanel title="Geo">
          {geoLine ? (
            <Text style={orgPanelStyles.detailLine}>{geoLine}</Text>
          ) : null}
          {country ? (
            <Text style={orgPanelStyles.detailLine}>{country}</Text>
          ) : null}
          {asn ? <Text style={orgPanelStyles.muted}>{asn}</Text> : null}
        </SectionPanel>
      ) : null}

      <SectionPanel title="Timezone">
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Effective: </Text>
          <Text style={styles.mono}>{server.timezone ?? 'Not set'}</Text>
        </Text>
        <Text style={orgPanelStyles.muted}>Source: {timezoneSource}</Text>
        {server.enforceServerTimezone ? (
          <Text style={orgPanelStyles.muted}>
            Organization enforces {server.orgDefaultTimezone ?? 'its default'}.
          </Text>
        ) : null}
      </SectionPanel>
    </View>
  )
}

function ServerControlTab({
  orgId,
  server,
  canManage,
  commandState,
  updateState,
  viewModel,
  onPing,
  onSetHostname,
  onReboot,
  onTriggerUpdate,
  onResetUpdate,
  systemRestartInFlight,
  systemRestartPollError,
  onEnqueueRestart,
  deletePanel,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  canManage: boolean
  commandState: ServerCommandState
  updateState: UpdateState
  viewModel: ReturnType<typeof deriveServerUpdateViewModel>
  onPing: () => void
  onSetHostname: (hostname: string) => void
  onReboot: () => void
  onTriggerUpdate: () => void
  onResetUpdate: () => void
  systemRestartInFlight: boolean
  systemRestartPollError: string | null
  onEnqueueRestart: (
    response: CommandEnqueueResponse,
    environmentId: string | undefined,
  ) => void
  deletePanel: ReactNode
}>) {
  return (
    <View style={styles.tabBody}>
      <SectionPanel title="Commands" hint="Create-then-poll · single timer">
        <ServerCommandsPanel
          server={server}
          canManage={canManage}
          showReboot={!viewModel.colocated}
          commandState={commandState}
          onPing={onPing}
          onSetHostname={onSetHostname}
          onReboot={onReboot}
        />
      </SectionPanel>

      <SectionPanel title="Server proxy" hint="Platform managed">
        <ServerSystemComponentPanel
          orgId={orgId}
          serverId={server.id}
          serverConnected={Boolean(server.connected)}
          restartInFlight={systemRestartInFlight}
          pollError={systemRestartPollError}
          onEnqueueRestart={onEnqueueRestart}
        />
      </SectionPanel>

      <SectionPanel title="Daemon update">
        {viewModel.colocated ? (
          <Text style={orgPanelStyles.muted}>
            Co-located hosts are updated via local git, not remote trunk pulls.
          </Text>
        ) : null}
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Running: </Text>
          {shortCommit(viewModel.updateData?.current?.commit)}
        </Text>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Trunk: </Text>
          {viewModel.updateData?.targetStatus === 'unknown'
            ? 'Unknown'
            : shortCommit(viewModel.updateData?.target?.commit)}
        </Text>
        <View style={[styles.updateBadge, pickBadgeStyle(viewModel.badgeVariant).container]}>
          <Text style={[styles.updateBadgeText, pickBadgeStyle(viewModel.badgeVariant).text]}>
            {updateBadgeLabel(viewModel.badgeVariant, viewModel.runningVersionUnknown)}
          </Text>
        </View>
        {canManage ? (
          <View style={styles.updateActions}>
            <TouchableOpacity
              style={[
                styles.updateBtn,
                (viewModel.isUpdateInProgress ||
                  !server.connected ||
                  !viewModel.targetKnown ||
                  viewModel.colocated ||
                  !viewModel.updateData?.updateAvailable) &&
                  styles.btnDisabled,
              ]}
              disabled={
                viewModel.isUpdateInProgress ||
                !server.connected ||
                !viewModel.targetKnown ||
                viewModel.colocated ||
                !viewModel.updateData?.updateAvailable
              }
              onPress={onTriggerUpdate}
            >
              <Text style={styles.updateBtnText}>Update</Text>
            </TouchableOpacity>
            {viewModel.canResetUpdateStatus ? (
              <TouchableOpacity
                style={[styles.resetBtn, updateState.resetting && styles.btnDisabled]}
                disabled={updateState.resetting}
                onPress={onResetUpdate}
              >
                <Text style={styles.resetBtnText}>Clear stuck update</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {updateState.error ? (
          <Text style={orgPanelStyles.error}>{updateState.error}</Text>
        ) : null}
      </SectionPanel>

      <SectionPanel title="Delete server" hint="Two-step confirm">
        {deletePanel}
      </SectionPanel>
    </View>
  )
}

function ServerDeletePanel({
  deleting,
  deleteError,
  confirming,
  onRequestConfirm,
  onCancel,
  onConfirm,
}: Readonly<{
  deleting: boolean
  deleteError: string | null
  confirming: boolean
  onRequestConfirm: () => void
  onCancel: () => void
  onConfirm: () => void
}>) {
  if (deleting) {
    return (
      <View style={styles.inlineRow}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={orgPanelStyles.muted}>Deleting…</Text>
      </View>
    )
  }
  if (confirming) {
    return (
      <View style={styles.confirmBlock}>
        <Text style={orgPanelStyles.muted}>
          Permanently remove this server from the organization?
        </Text>
        <TouchableOpacity style={styles.deleteBtn} onPress={onConfirm}>
          <Text style={styles.deleteBtnText}>Confirm delete</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text style={orgPanelStyles.muted}>Cancel</Text>
        </TouchableOpacity>
      </View>
    )
  }
  return (
    <>
      {deleteError ? <Text style={orgPanelStyles.error}>{deleteError}</Text> : null}
      <TouchableOpacity style={styles.deleteBtn} onPress={onRequestConfirm}>
        <Text style={styles.deleteBtnText}>Delete server</Text>
      </TouchableOpacity>
    </>
  )
}

function pickBadgeStyle(variant: UpdateBadgeVariant): {
  container: object
  text: object
} {
  switch (variant) {
    case 'updating':
      return { container: styles.badgeUpdating, text: styles.badgeTextAccent }
    case 'error':
      return { container: styles.badgeError, text: styles.badgeTextError }
    case 'available':
      return { container: styles.badgePending, text: styles.badgeTextPending }
    default:
      return { container: styles.badgeMuted, text: styles.badgeTextMuted }
  }
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.88,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  osLogo: {
    width: 28,
    height: 36,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  hostname: {
    color: colors.textDim,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  headerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOnline: {
    backgroundColor: colors.accent,
  },
  statusDotInitializing: {
    backgroundColor: colors.pending,
  },
  statusDotOffline: {
    backgroundColor: colors.textFaint,
    borderWidth: 1,
    borderColor: colors.borderChip,
  },
  statusLabel: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  flag: {
    fontSize: 16,
  },
  connectedVia: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  instanceDaemonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  instanceDaemonBadgeText: {
    color: colors.textBody,
    fontSize: 12,
    fontWeight: '600',
  },
  tabBody: {
    gap: spacing.lg,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  updateBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: spacing.sm,
  },
  updateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeUpdating: {
    borderColor: chrome.accent,
    backgroundColor: colors.bgActive,
  },
  badgeError: {
    borderColor: colors.error,
  },
  badgePending: {
    borderColor: colors.pending,
  },
  badgeMuted: {
    borderColor: colors.borderChip,
  },
  badgeTextAccent: { color: chrome.accent },
  badgeTextError: { color: colors.error },
  badgeTextPending: { color: colors.pending },
  badgeTextMuted: { color: colors.textDim },
  updateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  updateBtn: {
    borderWidth: 1,
    borderColor: chrome.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: chrome.bgActive,
  },
  updateBtnText: {
    color: colors.accent,
    fontWeight: '600',
  },
  resetBtn: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resetBtnText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  deleteBtn: {
    alignSelf: 'flex-start',
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  deleteBtnText: {
    color: colors.error,
    fontWeight: '600',
    fontSize: 12,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  confirmBlock: {
    gap: spacing.sm,
  },
})
