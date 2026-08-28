import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Link, useRouter, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { TurboPanelLogoMark } from '@/components/brand/turbopanel-logo'
import { ConnectionStatusDot } from '@/components/org/connection-status-dot'
import { OsIdentityMark } from '@/components/org/os-identity-mark'
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
import { ServerLabelsEditor } from '@/components/org/server-labels-editor'
import { ServerSshPortPanel } from '@/components/org/server-ssh-port-panel'
import { ServerSystemComponentPanel } from '@/components/org/server-system-component-panel'
import { ServerTimeSection } from '@/components/org/server-time-section'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  LoadingState,
  MonoText,
  SegmentedControl,
  type BadgeTone,
} from '@/components/ui'
import { formatLocalDateTime } from '@/lib/format-datetime'
import { configuredSourceLabel } from '@/lib/host-defaults'
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
  type ServerUpdateStatus,
} from '@/lib/instance-api'
import { useCommandRecordsBatch } from '@/lib/queries/commands'
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
import {
  resolveServerConnectionStatus,
  serverConnectionStatusLabel,
} from '@/lib/server-connection-status'
import {
  countryCodeToFlagEmoji,
  formatServerGeoAsn,
  formatServerGeoCountryCode,
  formatServerGeoLocation,
} from '@/lib/server-geo'
import { colors, layout, spacing } from '@/lib/theme'

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

function serverTitle(server: Pick<OrgServerRecord, 'name' | 'hostname' | 'id'>): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

function shortCommit(commit?: string | null): string {
  return commit ? commit.slice(0, 12) : 'Unknown'
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
      return (
        <ServerOverviewTab
          orgId={orgId}
          server={server}
          canManage={canManage}
        />
      )
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
      onConfirm={input.onConfirm}
    />
  )
}

function ServerDetailLoading(): ReactNode {
  return <LoadingState label="Loading server…" />
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

  const commandsQuery = useCommandRecordsBatch(orgId, commandBatchEntries)
  const processedCommandIdsRef = useRef<Set<string>>(new Set())

  const invalidateServer = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).servers.detail(serverId),
    })
  }, [queryClient, orgId, serverId])

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

  const invalidateSystemContainers = useCallback(
    (environmentId: string | undefined) => {
      if (!environmentId) return
      void queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).containers.list({ environmentId }),
      })
    },
    [queryClient, orgId],
  )

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
  }, [commandsQuery.data, pollCommands, serverId, invalidateServer, invalidateSystemContainers])

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
  }, [
    commandsQuery.error,
    pollCommands,
    invalidateServer,
    invalidateSystemContainers,
  ])

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
    onConfirm: () => {
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
        <Pressable
          style={({ pressed }) => [styles.backLink, pressed && styles.pressed, webPointer]}
          accessibilityRole="link"
          accessibilityLabel="Back to fleet"
        >
          <Text style={styles.backText}>← Fleet</Text>
        </Pressable>
      </Link>

      <View style={styles.header}>
        <OsIdentityMark server={server} density="header" />
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {hostname && hostname !== title ? (
            <MonoText style={styles.hostname}>{hostname}</MonoText>
          ) : null}
          <View style={styles.headerMeta}>
            <ConnectionStatusDot status={connectionStatus} size={8} />
            <Text style={styles.statusLabel}>
              {serverConnectionStatusLabel(connectionStatus)}
            </Text>
            {flag ? <Text style={styles.flag}>{flag}</Text> : null}
            {updateVm.colocated ? (
              <View
                style={styles.instanceDaemonBadge}
                accessibilityRole="text"
                accessibilityLabel="Platform Server"
              >
                <TurboPanelLogoMark
                  size={12}
                  square
                  accessibilityLabel=""
                />
                <Text style={styles.instanceDaemonBadgeText}>Platform Server</Text>
              </View>
            ) : null}
          </View>
          {connectedVia ? (
            <MonoText style={styles.connectedVia}>{connectedVia}</MonoText>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <SegmentedControl
          options={SERVER_DETAIL_TAB_IDS.map((tabId) => ({
            value: tabId,
            label: SERVER_DETAIL_TAB_LABELS[tabId],
          }))}
          value={activeTab}
          onChange={setTab}
        />
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
 * Header connection line — colocated Unix socket, or the host's address.
 *
 * The instance resolves `address` for us: the peer address it observed when
 * that is genuinely the host's (including through a Cloudflare Tunnel), and a
 * daemon-reported interface address when the observed one was a reverse proxy
 * or a forwarded port. Interface-sourced addresses are labelled so nobody reads
 * one as proof of how the daemon reached us.
 */
function resolveConnectedViaLabel(server: ServerDetailRecord): string | null {
  if (server.colocatedWithInstance === true || server.addressSource === 'local') {
    return 'via Local Unix Socket'
  }
  const address = server.address?.trim()
  if (!address) return null
  if (server.addressSource !== 'interface') return `via ${address}`
  const iface = server.addressInterface?.trim()
  return iface ? `at ${address} (${iface})` : `at ${address}`
}

function ServerOverviewTab({
  orgId,
  server,
  canManage,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  canManage: boolean
}>) {
  const { width } = useWindowDimensions()
  const twoColumn = width >= layout.desktopBreakpoint
  const geoLine = formatServerGeoLocation(server.geo)
  const country = formatServerGeoCountryCode(server.geo)
  const asn = formatServerGeoAsn(server.geo)
  const hasGeo = Boolean(geoLine || country || asn)
  const timezoneSource = configuredSourceLabel(server.timezoneSource)
  const groupStyle = [
    styles.detailGroup,
    twoColumn && styles.detailGroupHalf,
  ]

  return (
    <View style={styles.tabBody}>
      <SectionPanel title="Details">
        <View style={styles.detailGrid}>
          <View style={groupStyle}>
            <Text style={orgPanelStyles.detailTitle}>Identity</Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Display name: </Text>
              {server.name ?? '—'}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>ID: </Text>
              <MonoText>{server.id}</MonoText>
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Created: </Text>
              {formatLocalDateTime(server.createdAt)}
            </Text>
          </View>

          <View style={groupStyle}>
            <Text style={orgPanelStyles.detailTitle}>Operating system</Text>
            <Text style={orgPanelStyles.detailLine}>
              {server.osDisplay ?? 'Not reported yet'}
            </Text>
            {server.os?.architecture ? (
              <Text style={orgPanelStyles.muted}>
                Arch: {server.os.architecture}
              </Text>
            ) : null}
            {server.os?.codename ? (
              <Text style={orgPanelStyles.muted}>
                Codename: {server.os.codename}
              </Text>
            ) : null}
          </View>

          {hasGeo ? (
            <View style={groupStyle}>
              <Text style={orgPanelStyles.detailTitle}>Geo</Text>
              {geoLine ? (
                <Text style={orgPanelStyles.detailLine}>{geoLine}</Text>
              ) : null}
              {country ? (
                <Text style={orgPanelStyles.detailLine}>{country}</Text>
              ) : null}
              {asn ? <Text style={orgPanelStyles.muted}>{asn}</Text> : null}
            </View>
          ) : null}

          <View style={groupStyle}>
            <Text style={orgPanelStyles.detailTitle}>Timezone</Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Effective: </Text>
              <MonoText>{server.timezone ?? 'Not set'}</MonoText>
            </Text>
            <Text style={orgPanelStyles.muted}>Source: {timezoneSource}</Text>
            {server.datacenterEnforceServerTimezone ? (
              <Text style={orgPanelStyles.muted}>
                Datacenter enforces {server.datacenterDefaultTimezone ?? 'its default'}.
              </Text>
            ) : null}
            {!server.datacenterEnforceServerTimezone &&
            server.enforceServerTimezone ? (
              <Text style={orgPanelStyles.muted}>
                Organization enforces {server.orgDefaultTimezone ?? 'its default'}.
              </Text>
            ) : null}
          </View>
        </View>
      </SectionPanel>

      <ServerSshPortPanel
        orgId={orgId}
        server={server}
        canManage={canManage}
      />

      <ServerLabelsEditor
        orgId={orgId}
        serverId={server.id}
        labels={server.labels}
        canManage={canManage}
      />
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
        <Badge
          tone={updateBadgeTone(viewModel.badgeVariant)}
          label={updateBadgeLabel(viewModel.badgeVariant, viewModel.runningVersionUnknown)}
        />
        {canManage ? (
          <ButtonRow>
            <Button
              label="Update"
              variant="primary"
              disabled={
                viewModel.isUpdateInProgress ||
                !server.connected ||
                !viewModel.targetKnown ||
                viewModel.colocated ||
                !viewModel.updateData?.updateAvailable
              }
              onPress={onTriggerUpdate}
            />
            {viewModel.canResetUpdateStatus ? (
              <Button
                label="Clear stuck update"
                variant="secondary"
                size="sm"
                disabled={updateState.resetting}
                onPress={onResetUpdate}
              />
            ) : null}
          </ButtonRow>
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
  onConfirm,
}: Readonly<{
  deleting: boolean
  deleteError: string | null
  onConfirm: () => void
}>) {
  return (
    <>
      {deleteError ? <Text style={orgPanelStyles.error}>{deleteError}</Text> : null}
      <ConfirmButton
        label={deleting ? 'Deleting…' : 'Delete server'}
        confirmLabel="Confirm delete"
        prompt="Permanently remove this server from the organization?"
        busy={deleting}
        onConfirm={onConfirm}
      />
    </>
  )
}

function updateBadgeTone(variant: UpdateBadgeVariant): BadgeTone {
  switch (variant) {
    case 'updating':
      return 'ok'
    case 'error':
      return 'danger'
    case 'available':
      return 'pending'
    default:
      return 'muted'
  }
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
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
  },
  headerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
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
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  detailGroup: {
    width: '100%',
    gap: spacing.xs,
  },
  detailGroupHalf: {
    width: '48%',
  },
})
