import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useRouter, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Platform,
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
import { formatLocalDateTime } from '@/lib/format-datetime'
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
  fetchServerUpdate,
  formatServerDeleteBlockedError,
  isForbiddenError,
  pingDaemon,
  rebootServer,
  resetServerUpdateStatus,
  setServerHostname,
  triggerServerUpdate,
  type CommandEnqueueResponse,
  type OrgServerRecord,
  type ServerDetailRecord,
  type ServerOsLogoKey,
  type ServerUpdateStatus,
} from '@/lib/instance-api'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { osLogoSource } from '@/lib/os-logos'
import { formatServerOsProductName } from '@/lib/server-os-display'
import {
  countryCodeToFlagEmoji,
  formatServerGeoAsn,
  formatServerGeoCountryCode,
  formatServerGeoLocation,
} from '@/lib/server-geo'
import { colors, spacing } from '@/lib/theme'

const SERVERS_REFRESH_MS = 30_000
const UPDATE_PROGRESS_POLL_MS = 5_000

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
      return <ServerNetworkSection server={input.server} />
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

  const commandStateRef = useRef(commandState)
  commandStateRef.current = commandState

  const server = serverQuery.data

  const loadUpdate = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setUpdateState((prev) => ({ ...prev, loading: true, error: null }))
    }
    try {
      const data = await fetchServerUpdate(serverId)
      setUpdateState({
        loading: false,
        triggering: data.status === 'updating',
        resetting: false,
        data,
        error: null,
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      if (!options?.silent) {
        setUpdateState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load update status',
        }))
      }
    }
  }

  useEffect(() => {
    if (!serverId) return
    void loadUpdate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId])

  useEffect(() => {
    if (updateState.data?.status !== 'updating' && !updateState.triggering) {
      return
    }
    const timer = setInterval(() => {
      void loadUpdate({ silent: true })
    }, UPDATE_PROGRESS_POLL_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState.data?.status, updateState.triggering, serverId])

  const invalidateServer = () => {
    void queryClient.invalidateQueries({ queryKey: ['server', serverId] })
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
    let cancelled = false

    const onRefreshServer = () => {
      invalidateServer()
    }

    const pollAll = async () => {
      for (const entry of pollCommands) {
        try {
          const record = await fetchCommand(serverId, entry.commandId)
          if (cancelled) return
          if (!isTerminalCommandStatus(record.status)) continue

          if (
            entry.kind === 'ping' ||
            entry.kind === 'hostname' ||
            entry.kind === 'reboot'
          ) {
            setCommandState((prev) => {
              const active = prev.activeCommand
              if (!active || active.commandId !== entry.commandId) {
                return prev
              }
              const updated = applyDetailCommandPollResult(
                prev,
                active,
                record,
                onRefreshServer,
              )
              return updated ?? prev
            })
          } else if (entry.kind === 'timezone') {
            if (record.status === 'succeeded') {
              setTimezonePollError(null)
              onRefreshServer()
            } else {
              setTimezonePollError(
                record.error ?? `Timezone change ${record.status}`,
              )
            }
          } else if (entry.kind === 'ntp') {
            if (record.status === 'succeeded') {
              setNtpPollError(null)
              onRefreshServer()
            } else {
              setNtpPollError(record.error ?? `NTP change ${record.status}`)
            }
          }

          setPollCommands((prev) =>
            prev.filter((item) => item.commandId !== entry.commandId),
          )
        } catch (err) {
          if (cancelled) return
          if (isForbiddenError(err)) {
            await handleUnauthorized()
          }
          if (
            entry.kind === 'ping' ||
            entry.kind === 'hostname' ||
            entry.kind === 'reboot'
          ) {
            patchCommand({
              activeCommand: null,
              pingRunning: false,
              hostnameRunning: false,
              rebootRunning: false,
            })
          } else if (entry.kind === 'timezone') {
            setTimezonePollError(
              err instanceof Error
                ? err.message
                : 'Failed to poll timezone command',
            )
          } else if (entry.kind === 'ntp') {
            setNtpPollError(
              err instanceof Error ? err.message : 'Failed to poll NTP command',
            )
          }
          setPollCommands((prev) =>
            prev.filter((item) => item.commandId !== entry.commandId),
          )
        }
      }
    }

    void pollAll()
    const timer = setInterval(() => void pollAll(), COMMAND_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pollCommands, serverId, handleUnauthorized, queryClient])

  const setTab = (tabId: ServerDetailTabId) => {
    router.setParams({ tab: tabId })
  }

  if (serverQuery.isLoading && !server) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={orgPanelStyles.muted}>Loading server…</Text>
      </View>
    )
  }

  if (serverQuery.isError || !server) {
    return (
      <Text style={orgPanelStyles.error}>
        {serverQuery.error instanceof Error
          ? serverQuery.error.message
          : 'Failed to load server'}
      </Text>
    )
  }

  const updateVm = deriveServerUpdateViewModel(server, updateState)
  const flag = countryCodeToFlagEmoji(server.geo?.country)
  const logo = osLogoSource(resolveOsLogoKey(server))
  const title = serverTitle(server)
  const hostname = server.hostname?.trim()
  const daemonCommit = shortCommit(updateState.data?.current?.commit)

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteServer(serverId, orgId)
      router.replace(defaultOrgDashboardHref(orgId))
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setDeleteError(formatServerDeleteBlockedError(err))
    } finally {
      setDeleting(false)
    }
  }

  const deletePanel =
    canManage && !updateVm.colocated ? (
      <ServerDeletePanel
        deleting={deleting}
        deleteError={deleteError}
        confirming={confirmingDelete}
        onRequestConfirm={() => setConfirmingDelete(true)}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false)
          void handleDelete()
        }}
      />
    ) : canManage && updateVm.colocated ? (
      <Text style={orgPanelStyles.muted}>
        The co-located control plane server cannot be deleted.
      </Text>
    ) : null

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
        onPing: () => {
          patchCommand({ pingError: null, pingRunning: true, commandRecord: null })
          pingDaemon(serverId)
            .then((result) => {
              const entry: DetailPollCommand = {
                commandId: result.commandId,
                kind: 'ping',
              }
              registerPollCommand(entry)
              patchCommand({ activeCommand: entry })
            })
            .catch(async (err) => {
              if (isForbiddenError(err)) await handleUnauthorized()
              patchCommand({
                pingError: err instanceof Error ? err.message : 'Ping failed',
                pingRunning: false,
              })
            })
        },
        onSetHostname: (host) => {
          if (!host) {
            patchCommand({ hostnameError: 'Hostname is required' })
            return
          }
          patchCommand({ hostnameError: null, hostnameRunning: true, commandRecord: null })
          setServerHostname(serverId, host)
            .then((result) => {
              const entry: DetailPollCommand = {
                commandId: result.commandId,
                kind: 'hostname',
              }
              registerPollCommand(entry)
              patchCommand({ activeCommand: entry })
            })
            .catch(async (err) => {
              if (isForbiddenError(err)) await handleUnauthorized()
              patchCommand({
                hostnameError:
                  err instanceof Error ? err.message : 'Hostname change failed',
                hostnameRunning: false,
              })
            })
        },
        onReboot: () => {
          patchCommand({ rebootError: null, rebootRunning: true, commandRecord: null })
          rebootServer(serverId)
            .then((result) => {
              const entry: DetailPollCommand = {
                commandId: result.commandId,
                kind: 'reboot',
              }
              registerPollCommand(entry)
              patchCommand({ activeCommand: entry })
            })
            .catch(async (err) => {
              if (isForbiddenError(err)) await handleUnauthorized()
              patchCommand({
                rebootError: err instanceof Error ? err.message : 'Reboot failed',
                rebootRunning: false,
              })
            })
        },
        onTriggerUpdate: () => {
          setUpdateState((prev) => ({ ...prev, triggering: true, error: null }))
          triggerServerUpdate(serverId)
            .then(() => void loadUpdate({ silent: true }))
            .catch(async (err) => {
              if (isForbiddenError(err)) await handleUnauthorized()
              setUpdateState((prev) => ({
                ...prev,
                triggering: false,
                error: err instanceof Error ? err.message : 'Update failed',
              }))
            })
        },
        onResetUpdate: () => {
          setUpdateState((prev) => ({ ...prev, resetting: true, error: null }))
          resetServerUpdateStatus(serverId)
            .then((data) =>
              setUpdateState({
                loading: false,
                triggering: data.status === 'updating',
                resetting: false,
                data,
                error: null,
              }),
            )
            .catch(async (err) => {
              if (isForbiddenError(err)) await handleUnauthorized()
              setUpdateState((prev) => ({
                ...prev,
                resetting: false,
                error: err instanceof Error ? err.message : 'Reset failed',
              }))
            })
        },
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

function ServerOverviewTab({ server }: Readonly<{ server: ServerDetailRecord }>) {
  const dial = server.remoteAddress?.trim()
  const dialDisplay =
    !dial || dial === '__direct__' ? 'Co-located (Unix socket)' : dial
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

      <SectionPanel title="Connection">
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Connected since: </Text>
          {formatLocalDateTime(server.connectedAt)}
        </Text>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Last inbound: </Text>
          {formatLocalDateTime(server.lastInboundAt)}
        </Text>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Dial: </Text>
          <Text style={styles.mono}>{dialDisplay}</Text>
        </Text>
      </SectionPanel>

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
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: colors.accent,
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
    borderColor: colors.accent,
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
  badgeTextAccent: { color: colors.accent },
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
    borderColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bgActive,
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
