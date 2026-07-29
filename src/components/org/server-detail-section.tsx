import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Link, useRouter, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { ServerMetricsSection } from '@/components/org/server-metrics-section'
import { ServerNetworkSection } from '@/components/org/server-network-section'
import { ServerTimeSection } from '@/components/org/server-time-section'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import { formatLocalDateTime, formatRelativeLocalDateTime } from '@/lib/format-datetime'
import {
  formatCoveragePercent,
  presentSamplesFromGaps,
} from '@/lib/format-metrics'
import {
  defaultOrgDashboardHref,
  SERVER_DETAIL_TAB_IDS,
  SERVER_DETAIL_TAB_LABELS,
  type ServerDetailTabId,
} from '@/lib/org-navigation'
import {
  deleteServer,
  fetchCommand,
  fetchServer,
  fetchServerMetricsSeries,
  fetchServerUpdate,
  formatServerDeleteBlockedError,
  isForbiddenError,
  MetricsBackendUnavailableError,
  pingDaemon,
  rebootServer,
  resetServerUpdateStatus,
  setServerHostname,
  triggerServerUpdate,
  type CommandEnqueueResponse,
  type MetricsSeriesResponse,
  type OrgServerRecord,
  type ServerDetailRecord,
  type ServerOsLogoKey,
  type ServerUpdateStatus,
} from '@/lib/instance-api'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { osLogoSource } from '@/lib/os-logos'
import {
  countryCodeToFlagEmoji,
  formatServerGeoAsn,
  formatServerGeoCountryCode,
  formatServerGeoLocation,
} from '@/lib/server-geo'
import { chrome, colors, spacing } from '@/lib/theme'

const SERVERS_REFRESH_MS = 30_000
const UPDATE_PROGRESS_POLL_MS = 5_000
/** Overview reporting window — matches Metrics 24h cadence (300 s refresh). */
const REPORTING_WINDOW_MS = 24 * 60 * 60 * 1000
const REPORTING_REFRESH_MS = 300_000

function latestMetricsSampleAt(data: MetricsSeriesResponse): string | null {
  for (let i = data.points.length - 1; i >= 0; i -= 1) {
    const point = data.points[i]
    if (point && point.sampleCount > 0) return point.at
  }
  return null
}

function reportingCoverageLabel(data: MetricsSeriesResponse): string | null {
  const expectedSamples = data.sampleCount + data.gapCount
  if (expectedSamples <= 0) return null
  const presentSamples = presentSamplesFromGaps(expectedSamples, data.gapCount)
  return formatCoveragePercent(presentSamples, expectedSamples)
}

function formatReportingLine(data: MetricsSeriesResponse): string | null {
  const coverageLabel = reportingCoverageLabel(data)
  if (!coverageLabel) return null
  if (data.gapCount <= 0) return coverageLabel
  const gapWord = data.gapCount === 1 ? 'gap' : 'gaps'
  return `${coverageLabel} · ${data.gapCount} ${gapWord}`
}

function ReportingStatusNote({
  loading,
  errored,
  reporting,
}: Readonly<{
  loading: boolean
  errored: boolean
  reporting: MetricsSeriesResponse | null | undefined
}>) {
  if (loading) {
    return <Text style={orgPanelStyles.muted}>Loading reporting…</Text>
  }
  if (errored) {
    return <Text style={orgPanelStyles.muted}>Reporting unavailable.</Text>
  }
  if (!reporting) {
    return (
      <Text style={orgPanelStyles.muted}>
        Metrics backend not configured for this control plane.
      </Text>
    )
  }
  if (!reporting.available) {
    return (
      <Text style={orgPanelStyles.muted}>Waiting for first metrics samples.</Text>
    )
  }
  return null
}

type DetailActiveCommand = ActiveCommand

type DetailPollCommand = {
  commandId: string
  kind: ActiveCommand['kind'] | 'timezone' | 'ntp'
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

function isTerminalUpdateState(status: ServerUpdateStatus): boolean {
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
  record: Awaited<ReturnType<typeof fetchCommand>>,
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

function renderDetailTabBody(
  tab: ServerDetailTabId,
  input: Readonly<{
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
    onEnqueueCommand: (response: CommandEnqueueResponse, kind: 'timezone' | 'ntp') => void
    deletePanel: ReactNode
  }>,
): ReactNode {
  switch (tab) {
    case 'overview':
      return <ServerOverviewTab server={input.server} />
    case 'control':
      return (
        <ServerControlTab
          server={input.server}
          canManage={input.canManage}
          commandState={input.commandState}
          updateState={input.updateState}
          viewModel={input.updateVm}
          onPing={input.onPing}
          onSetHostname={input.onSetHostname}
          onReboot={input.onReboot}
          onTriggerUpdate={input.onTriggerUpdate}
          onResetUpdate={input.onResetUpdate}
          deletePanel={input.deletePanel}
        />
      )
    case 'time':
      return (
        <ServerTimeSection
          orgId={input.orgId}
          server={input.server}
          canManage={input.canManage}
          timezoneCommandInFlight={input.timezoneCommandInFlight}
          timezonePollError={input.timezonePollError}
          ntpCommandInFlight={input.ntpCommandInFlight}
          ntpPollError={input.ntpPollError}
          onEnqueueCommand={input.onEnqueueCommand}
        />
      )
    case 'network':
      return <ServerNetworkSection orgId={input.orgId} server={input.server} />
    case 'metrics':
      return (
        <ServerMetricsSection
          orgId={input.orgId}
          serverId={input.serverId}
          embedded
        />
      )
    default:
      return <ServerOverviewTab server={input.server} />
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
  record: Awaited<ReturnType<typeof fetchCommand>>,
  handlers: Readonly<{
    onRefreshServer: () => void
    setCommandState: Dispatch<SetStateAction<ServerCommandState>>
    setTimezonePollError: (error: string | null) => void
    setNtpPollError: (error: string | null) => void
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
  handlers.setNtpPollError(
    err instanceof Error ? err.message : 'Failed to poll NTP command',
  )
}

type PollHandlers = Readonly<{
  onRefreshServer: () => void
  setCommandState: Dispatch<SetStateAction<ServerCommandState>>
  setTimezonePollError: (error: string | null) => void
  setNtpPollError: (error: string | null) => void
  patchCommand: (patch: Partial<ServerCommandState>) => void
}>

type PollCancelledRef = { current: boolean }

async function pollSingleCommand(
  entry: DetailPollCommand,
  input: Readonly<{
    serverId: string
    cancelledRef: PollCancelledRef
    handleUnauthorized: () => Promise<void>
    pollHandlers: PollHandlers
    onSettled: (commandId: string) => void
  }>,
): Promise<void> {
  try {
    const record = await fetchCommand(input.serverId, entry.commandId)
    if (input.cancelledRef.current) return
    if (!isTerminalCommandStatus(record.status)) return
    applyTerminalPollSuccess(entry, record, input.pollHandlers)
    input.onSettled(entry.commandId)
  } catch (err) {
    if (input.cancelledRef.current) return
    if (isForbiddenError(err)) {
      await input.handleUnauthorized()
    }
    applyPollFailure(entry, err, input.pollHandlers)
    input.onSettled(entry.commandId)
  }
}

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

function createLoadUpdate(input: Readonly<{
  serverId: string
  handleUnauthorized: () => Promise<void>
  setUpdateState: Dispatch<SetStateAction<UpdateState>>
}>): (options?: { silent?: boolean }) => Promise<void> {
  return async (options) => {
    if (!options?.silent) {
      input.setUpdateState((prev) => ({ ...prev, loading: true, error: null }))
    }
    try {
      const data = await fetchServerUpdate(input.serverId)
      input.setUpdateState({
        loading: false,
        triggering: data.status === 'updating',
        resetting: false,
        data,
        error: null,
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await input.handleUnauthorized()
      }
      if (!options?.silent) {
        input.setUpdateState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load update status',
        }))
      }
    }
  }
}

type CommandHandlerDeps = Readonly<{
  serverId: string
  patchCommand: (patch: Partial<ServerCommandState>) => void
  registerPollCommand: (entry: DetailPollCommand) => void
  handleUnauthorized: () => Promise<void>
}>

function createPingHandler(input: CommandHandlerDeps): () => void {
  return () => {
    input.patchCommand({ pingError: null, pingRunning: true, commandRecord: null })
    pingDaemon(input.serverId)
      .then((result) => {
        const entry: DetailPollCommand = { commandId: result.commandId, kind: 'ping' }
        input.registerPollCommand(entry)
        input.patchCommand({ activeCommand: entry })
      })
      .catch(async (err) => {
        if (isForbiddenError(err)) await input.handleUnauthorized()
        input.patchCommand({
          pingError: err instanceof Error ? err.message : 'Ping failed',
          pingRunning: false,
        })
      })
  }
}

function createSetHostnameHandler(input: CommandHandlerDeps): (hostname: string) => void {
  return (host) => {
    if (!host) {
      input.patchCommand({ hostnameError: 'Hostname is required' })
      return
    }
    input.patchCommand({ hostnameError: null, hostnameRunning: true, commandRecord: null })
    setServerHostname(input.serverId, host)
      .then((result) => {
        const entry: DetailPollCommand = { commandId: result.commandId, kind: 'hostname' }
        input.registerPollCommand(entry)
        input.patchCommand({ activeCommand: entry })
      })
      .catch(async (err) => {
        if (isForbiddenError(err)) await input.handleUnauthorized()
        input.patchCommand({
          hostnameError: err instanceof Error ? err.message : 'Hostname change failed',
          hostnameRunning: false,
        })
      })
  }
}

function createRebootHandler(input: CommandHandlerDeps): () => void {
  return () => {
    input.patchCommand({ rebootError: null, rebootRunning: true, commandRecord: null })
    rebootServer(input.serverId)
      .then((result) => {
        const entry: DetailPollCommand = { commandId: result.commandId, kind: 'reboot' }
        input.registerPollCommand(entry)
        input.patchCommand({ activeCommand: entry })
      })
      .catch(async (err) => {
        if (isForbiddenError(err)) await input.handleUnauthorized()
        input.patchCommand({
          rebootError: err instanceof Error ? err.message : 'Reboot failed',
          rebootRunning: false,
        })
      })
  }
}

function createTriggerUpdateHandler(input: Readonly<{
  serverId: string
  setUpdateState: Dispatch<SetStateAction<UpdateState>>
  loadUpdate: (options?: { silent?: boolean }) => Promise<void>
  handleUnauthorized: () => Promise<void>
}>): () => void {
  return () => {
    input.setUpdateState((prev) => ({ ...prev, triggering: true, error: null }))
    triggerServerUpdate(input.serverId)
      .then(() =>
        input.loadUpdate({ silent: true }).catch(() => {
          /* silent refresh after trigger */
        }),
      )
      .catch(async (err) => {
        if (isForbiddenError(err)) await input.handleUnauthorized()
        input.setUpdateState((prev) => ({
          ...prev,
          triggering: false,
          error: err instanceof Error ? err.message : 'Update failed',
        }))
      })
  }
}

function createResetUpdateHandler(input: Readonly<{
  serverId: string
  setUpdateState: Dispatch<SetStateAction<UpdateState>>
  handleUnauthorized: () => Promise<void>
}>): () => void {
  return () => {
    input.setUpdateState((prev) => ({ ...prev, resetting: true, error: null }))
    resetServerUpdateStatus(input.serverId)
      .then((data) =>
        input.setUpdateState({
          loading: false,
          triggering: data.status === 'updating',
          resetting: false,
          data,
          error: null,
        }),
      )
      .catch(async (err) => {
        if (isForbiddenError(err)) await input.handleUnauthorized()
        input.setUpdateState((prev) => ({
          ...prev,
          resetting: false,
          error: err instanceof Error ? err.message : 'Reset failed',
        }))
      })
  }
}

function createDeleteHandler(input: Readonly<{
  serverId: string
  orgId: string
  router: ReturnType<typeof useRouter>
  handleUnauthorized: () => Promise<void>
  setDeleting: Dispatch<SetStateAction<boolean>>
  setDeleteError: Dispatch<SetStateAction<string | null>>
}>): () => Promise<void> {
  return async () => {
    input.setDeleting(true)
    input.setDeleteError(null)
    try {
      await deleteServer(input.serverId, input.orgId)
      input.router.replace(defaultOrgDashboardHref(input.orgId))
    } catch (err) {
      if (isForbiddenError(err)) {
        await input.handleUnauthorized()
        return
      }
      input.setDeleteError(formatServerDeleteBlockedError(err))
    } finally {
      input.setDeleting(false)
    }
  }
}

export function ServerDetailSection({
  orgId,
  serverId,
}: Readonly<{ orgId: string; serverId: string }>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { handleUnauthorized } = useAuth()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string | string[] }>()
  const activeTab = parseTabParam(tabParam)

  const serverQuery = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => fetchServer(serverId),
    refetchInterval: SERVERS_REFRESH_MS,
    enabled: serverId.length > 0,
  })
  useForbiddenRecovery(serverQuery.error)

  const [updateState, setUpdateState] = useState<UpdateState>({
    loading: true,
    triggering: false,
    resetting: false,
    data: null,
    error: null,
  })
  const [commandState, setCommandState] = useState<ServerCommandState>(
    defaultServerCommandState(),
  )
  const [pollCommands, setPollCommands] = useState<DetailPollCommand[]>([])
  const [timezonePollError, setTimezonePollError] = useState<string | null>(null)
  const [ntpPollError, setNtpPollError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const server = serverQuery.data

  const loadUpdate = createLoadUpdate({ serverId, handleUnauthorized, setUpdateState })

  useEffect(() => {
    if (!serverId) return
    loadUpdate().catch(() => {
      /* loadUpdate reports failures via updateState */
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId])

  useEffect(() => {
    if (updateState.data?.status !== 'updating' && !updateState.triggering) {
      return
    }
    const timer = setInterval(() => {
      loadUpdate({ silent: true }).catch(() => {
        /* silent progress poll */
      })
    }, UPDATE_PROGRESS_POLL_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState.data?.status, updateState.triggering, serverId])

  const invalidateServer = () => {
    queryClient
      .invalidateQueries({ queryKey: ['server', serverId] })
      .catch(() => {
        /* refresh is best-effort */
      })
  }

  const patchCommand = (patch: Partial<ServerCommandState>) => {
    setCommandState((prev) => ({ ...prev, ...patch }))
  }

  const registerPollCommand = (entry: DetailPollCommand) => {
    setPollCommands((prev) =>
      prev.some((item) => item.commandId === entry.commandId)
        ? prev
        : [...prev, entry],
    )
  }

  const timezoneCommandInFlight = pollCommands.some((item) => item.kind === 'timezone')
  const ntpCommandInFlight = pollCommands.some((item) => item.kind === 'ntp')

  useEffect(() => {
    if (pollCommands.length === 0) return

    const cancelledRef: PollCancelledRef = { current: false }
    const pollHandlers: PollHandlers = {
      onRefreshServer: invalidateServer,
      setCommandState,
      setTimezonePollError,
      setNtpPollError,
      patchCommand,
    }
    const onSettled = (commandId: string) => {
      setPollCommands((prev) => removePollCommandById(prev, commandId))
    }

    const pollAll = () =>
      Promise.all(
        pollCommands.map((entry) =>
          pollSingleCommand(entry, {
            serverId,
            cancelledRef,
            handleUnauthorized,
            pollHandlers,
            onSettled,
          }),
        ),
      )

    pollAll().catch(() => {
      /* per-entry errors handled inside pollSingleCommand */
    })
    const timer = setInterval(() => {
      pollAll().catch(() => {
        /* per-entry errors handled inside pollSingleCommand */
      })
    }, COMMAND_POLL_MS)
    return () => {
      cancelledRef.current = true
      clearInterval(timer)
    }
  }, [pollCommands, serverId, handleUnauthorized, queryClient])

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
  const daemonCommit = shortCommit(updateState.data?.current?.commit)

  const handleDelete = createDeleteHandler({
    serverId,
    orgId,
    router,
    handleUnauthorized,
    setDeleting,
    setDeleteError,
  })

  const onPing = createPingHandler({ serverId, patchCommand, registerPollCommand, handleUnauthorized })
  const onSetHostname = createSetHostnameHandler({
    serverId,
    patchCommand,
    registerPollCommand,
    handleUnauthorized,
  })
  const onReboot = createRebootHandler({ serverId, patchCommand, registerPollCommand, handleUnauthorized })
  const onTriggerUpdate = createTriggerUpdateHandler({
    serverId,
    setUpdateState,
    loadUpdate,
    handleUnauthorized,
  })
  const onResetUpdate = createResetUpdateHandler({ serverId, setUpdateState, handleUnauthorized })

  const deletePanel = renderServerDeletePanel({
    canManage,
    colocated: updateVm.colocated,
    deleting,
    deleteError,
    confirmingDelete,
    onRequestConfirm: () => setConfirmingDelete(true),
    onCancel: () => setConfirmingDelete(false),
    onConfirm: () => {
      setConfirmingDelete(false)
      handleDelete().catch(() => {
        /* handleDelete reports failures via deleteError */
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
                server.connected ? styles.statusDotOnline : styles.statusDotOffline,
              ]}
            />
            <Text style={styles.statusLabel}>
              {server.connected ? 'Online' : 'Offline'}
            </Text>
            {flag ? <Text style={styles.flag}>{flag}</Text> : null}
            <Text style={styles.chip}>Daemon {daemonCommit}</Text>
            {server.colocatedWithInstance ? (
              <Text style={styles.chipAccent}>Co-located daemon</Text>
            ) : null}
          </View>
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

      {renderDetailTabBody(activeTab, {
        orgId,
        serverId,
        server,
        canManage,
        commandState,
        timezoneCommandInFlight,
        timezonePollError,
        ntpCommandInFlight,
        ntpPollError: ntpPollError,
        updateState,
        updateVm,
        onPing,
        onSetHostname,
        onReboot,
        onTriggerUpdate,
        onResetUpdate,
        onEnqueueCommand: (response, kind) => {
          if (kind === 'timezone') {
            setTimezonePollError(null)
          } else {
            setNtpPollError(null)
          }
          registerPollCommand({ commandId: response.commandId, kind })
        },
        deletePanel,
      })}
    </View>
  )
}

function ServerConnectionOverview({
  server,
}: Readonly<{ server: ServerDetailRecord }>) {
  // remoteAddress is the egress IP the control plane observed on the daemon WS
  // (CF-Connecting-IP / X-Real-IP) — not the URL/hostname the daemon dials.
  const seenFrom = server.remoteAddress?.trim()
  const seenFromDisplay =
    !seenFrom || seenFrom === '__direct__'
      ? 'Co-located (Unix socket)'
      : seenFrom

  // Presence timestamps (connectedAt / lastInboundAt) are not useful here:
  // Workers steady-state cell pings never project lastInboundAt, and sockets
  // self-recycle every ~2h so connectedAt is only the current session start.
  // Host-metrics coverage is the durable continuity signal (~60s samples).
  const reportingQuery = useQuery({
    queryKey: ['server', server.id, 'reporting', '24h'],
    queryFn: async (): Promise<MetricsSeriesResponse | null> => {
      const toMs = Date.now()
      try {
        return await fetchServerMetricsSeries(server.id, {
          fromIso: new Date(toMs - REPORTING_WINDOW_MS).toISOString(),
          toIso: new Date(toMs).toISOString(),
          metrics: ['uptimeSeconds'],
        })
      } catch (error) {
        if (error instanceof MetricsBackendUnavailableError) return null
        throw error
      }
    },
    refetchInterval: REPORTING_REFRESH_MS,
  })
  useForbiddenRecovery(reportingQuery.error)

  const reporting = reportingQuery.data
  const showSamples = Boolean(reporting?.available)
  const latestSampleAt = reporting ? latestMetricsSampleAt(reporting) : null
  const reportingLine = reporting ? formatReportingLine(reporting) : null

  return (
    <SectionPanel
      title="Connection"
      hint="Observed egress and host-metrics reporting (not WS session age)"
    >
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Connected from: </Text>
        <Text style={styles.mono}>{seenFromDisplay}</Text>
      </Text>
      <ReportingStatusNote
        loading={reportingQuery.isLoading}
        errored={reportingQuery.isError}
        reporting={reporting}
      />
      {showSamples ? (
        <>
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Last sample: </Text>
            {formatRelativeLocalDateTime(latestSampleAt, {
              neverLabel: 'No samples in the last 24h',
              absolute: { includeSeconds: false },
            })}
          </Text>
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Reporting (24h): </Text>
            {reportingLine ?? '—'}
          </Text>
        </>
      ) : null}
    </SectionPanel>
  )
}

function ServerOverviewTab({ server }: Readonly<{ server: ServerDetailRecord }>) {
  const geoLine = formatServerGeoLocation(server.geo)
  const country = formatServerGeoCountryCode(server.geo)
  const asn = formatServerGeoAsn(server.geo)

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

      <ServerConnectionOverview server={server} />

      <SectionPanel title="Geo">
        {geoLine || country || asn ? (
          <>
            {geoLine ? (
              <Text style={orgPanelStyles.detailLine}>{geoLine}</Text>
            ) : null}
            {country ? (
              <Text style={orgPanelStyles.detailLine}>{country}</Text>
            ) : null}
            {asn ? <Text style={orgPanelStyles.muted}>{asn}</Text> : null}
          </>
        ) : (
          <Text style={orgPanelStyles.muted}>No geo reported yet.</Text>
        )}
      </SectionPanel>

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
  deletePanel,
}: Readonly<{
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
  chip: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipAccent: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: chrome.accent,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
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
