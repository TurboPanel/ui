import {
  createElement,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { VariablesSection } from '@/components/org/variables-section'
import { useAuth } from '@/lib/auth-context'
import {
  createHosting,
  createService,
  deployEnvironment,
  fetchContainers,
  fetchEnvironment,
  fetchOrgServers,
  fetchProject,
  fetchTlsLibrary,
  fetchVisibleHostings,
  fetchVisibleServices,
  fetchCommand,
  isForbiddenError,
  updateEnvironment,
  updateHosting,
  type CommandRecord,
  type ComposeDocument,
  type ContainerRecord,
  type EnvironmentRecord,
  type HostingRecord,
  type OrgServerRecord,
  type ServiceRecord,
  type TlsRecord,
} from '@/lib/instance-api'
import { coversAllHostnames } from '@/lib/tls-match'
import {
  composeDocumentToRuntimeYaml,
  mergeComposeOverlay,
  normalizeCompose,
  readComposePlacementServerId,
  setComposePlacementServerId,
  stripComposePlacement,
} from '@/lib/compose'
import { colors, spacing } from '@/lib/theme'

const TERMINAL_COMMAND_STATUSES = new Set<CommandRecord['status']>([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
])

function composeServiceNames(document: ComposeDocument): string[] {
  const services = document.data.services
  if (typeof services !== 'object' || services === null || Array.isArray(services)) {
    return []
  }
  return Object.keys(services)
}

function isStringHostname(hostname: unknown): hostname is string {
  return typeof hostname === 'string'
}

function formatHostingHostnames(hostings: HostingRecord[]): string {
  const raw = hostings[0]?.options?.hostnames
  if (!Array.isArray(raw)) {
    return ''
  }
  return raw.filter(isStringHostname).join(', ')
}

function serverLabel(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname || server.id
}

function serverOptionLabel(server: OrgServerRecord): string {
  const base = serverLabel(server)
  return server.connected ? base : `${base} (offline)`
}

async function fetchHostingsByService(services: ServiceRecord[]): Promise<{
  byService: Record<string, HostingRecord[]>
  hostnames: Record<string, string>
  tlsPins: Record<string, string | null>
}> {
  const entries = await Promise.all(
    services.map(async (service) => {
      const hostings = await fetchVisibleHostings(service.id)
      return [service.id, hostings.hostings] as const
    }),
  )
  return {
    byService: Object.fromEntries(entries),
    hostnames: Object.fromEntries(
      entries.map(([serviceId, hostings]) => [serviceId, formatHostingHostnames(hostings)]),
    ),
    tlsPins: Object.fromEntries(
      entries.map(([serviceId, hostings]) => [serviceId, hostings[0]?.tlsId ?? null]),
    ),
  }
}

async function fetchContainersByService(
  services: ServiceRecord[],
): Promise<Record<string, ContainerRecord[]>> {
  const entries = await Promise.all(
    services.map(async (service) => {
      const result = await fetchContainers(service.id)
      return [service.id, result.containers] as const
    }),
  )
  return Object.fromEntries(entries)
}

type ContainerStatusVariant = 'running' | 'pending' | 'stopped' | 'unknown'

function containerStatusVariant(status?: string): ContainerStatusVariant {
  switch (status) {
    case 'running':
      return 'running'
    case 'restarting':
    case 'created':
    case 'paused':
      return 'pending'
    case 'exited':
    case 'dead':
    case 'removing':
      return 'stopped'
    default:
      return 'unknown'
  }
}

function containerDisplayName(container: ContainerRecord): string {
  return (
    container.metadata?.containerName ??
    container.metadata?.composeServiceName ??
    container.id
  )
}

function containerHostLabel(
  container: ContainerRecord,
  allServers: OrgServerRecord[],
): string {
  const host = allServers.find((server) => server.id === container.serverId)
  if (host) {
    return serverLabel(host)
  }
  return container.serverId
}

function ContainerStatusBadge({
  status,
}: Readonly<{ status?: string }>) {
  const variant = containerStatusVariant(status)
  const label = status?.trim() || 'unknown'
  return (
    <View style={[styles.statusBadge, statusBadgeVariantStyles[variant].badge]}>
      <Text style={[styles.statusBadgeText, statusBadgeVariantStyles[variant].text]}>
        {label}
      </Text>
    </View>
  )
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function parseHostnameList(value: string): string[] {
  return value
    .split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean)
}

async function waitForTerminalCommand(
  serverId: string,
  commandId: string,
): Promise<CommandRecord> {
  let command = await fetchCommand(serverId, commandId)
  while (!TERMINAL_COMMAND_STATUSES.has(command.status)) {
    await new Promise<void>((resolve) => setTimeout(resolve, 2000))
    command = await fetchCommand(serverId, commandId)
  }
  return command
}

/** Consumer marks deploy succeeded before container reconcile finishes — retry briefly. */
const POST_DEPLOY_CONTAINER_REFRESH_ATTEMPTS = 5
const POST_DEPLOY_CONTAINER_REFRESH_DELAY_MS = 400

function hasAnyContainers(
  services: ServiceRecord[],
  containersByService: Record<string, ContainerRecord[]>,
): boolean {
  return services.some((service) => (containersByService[service.id] ?? []).length > 0)
}

async function refreshServicesAndContainersAfterDeploy(
  environmentId: string,
): Promise<{
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
}> {
  let services: ServiceRecord[] = []
  let containersByService: Record<string, ContainerRecord[]> = {}

  for (let attempt = 0; attempt < POST_DEPLOY_CONTAINER_REFRESH_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, POST_DEPLOY_CONTAINER_REFRESH_DELAY_MS),
      )
    }
    const servicesResult = await fetchVisibleServices(environmentId)
    services = servicesResult.services
    containersByService = await fetchContainersByService(services)
    // Always take a second pass when rows appear on attempt 0 — they may still
    // be pre-reconcile. Stop once a deferred attempt sees containers.
    if (attempt > 0 && hasAnyContainers(services, containersByService)) {
      break
    }
  }

  return { services, containersByService }
}

function deployStatusMessage(command: CommandRecord): string {
  if (command.status === 'succeeded') {
    return 'Deployment completed.'
  }
  return command.error ?? `Deployment ${command.status}.`
}

function deployErrorMessage(err: unknown): string {
  const message = errorMessage(err, 'Failed to deploy environment')
  if (message.includes('server_placement_mismatch')) {
    return "Deploy target does not match the project's pinned server placement."
  }
  return message
}

async function reportSectionError(
  err: unknown,
  handleUnauthorized: () => Promise<void>,
  setMessage: (message: string) => void,
  fallback: string,
): Promise<void> {
  if (isForbiddenError(err)) {
    await handleUnauthorized()
    return
  }
  setMessage(errorMessage(err, fallback))
}

async function upsertHosting(
  serviceId: string,
  composeServiceName: string,
  options: { hostnames: string[] },
  hostingsByService: Record<string, HostingRecord[]>,
  tlsId: string | null,
): Promise<void> {
  const existing = hostingsByService[serviceId]?.[0]
  if (existing) {
    await updateHosting(existing.id, {
      metadata: { composeServiceName },
      options,
      tlsId,
    })
    return
  }
  await createHosting(serviceId, {
    displayName: composeServiceName,
    metadata: { composeServiceName },
    options,
    tlsId,
  })
}

function tlsLabel(row: TlsRecord): string {
  return row.displayName?.trim() || row.metadata.dnsNames[0] || row.id.slice(0, 8)
}

function deployBlockedReason(
  placementServerId: string | null,
  pinnedServer: OrgServerRecord | null,
): string | null {
  if (!placementServerId) {
    return 'Select a server for this environment before deploying.'
  }
  if (!pinnedServer) {
    return 'Selected server is unavailable. Choose a connected server.'
  }
  if (!pinnedServer.connected) {
    return 'Selected server is offline. Choose a connected server.'
  }
  return null
}

function placementDropdownOptions(
  sortedServers: OrgServerRecord[],
  placementServerId: string | null,
): OrgServerRecord[] {
  const connected = sortedServers.filter((server) => server.connected)
  if (!placementServerId) {
    return connected
  }
  const selected = sortedServers.find((server) => server.id === placementServerId)
  if (!selected || selected.connected) {
    return connected
  }
  return [selected, ...connected]
}

const webSelectStyle: CSSProperties = {
  width: '100%',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.border,
  borderRadius: 6,
  backgroundColor: colors.bgInput,
  color: colors.text,
  fontFamily: 'monospace',
  fontSize: 13,
  padding: 10,
  minHeight: 44,
}

function HostingHostnameRow({
  composeServiceName,
  value,
  tlsId,
  tlsOptions,
  saving,
  disabled,
  onChange,
  onTlsChange,
  onSave,
}: Readonly<{
  composeServiceName: string
  value: string
  tlsId: string | null
  tlsOptions: TlsRecord[]
  saving: boolean
  disabled: boolean
  onChange: (value: string) => void
  onTlsChange: (tlsId: string | null) => void
  onSave: () => void
}>) {
  const hostnames = parseHostnameList(value)
  const covering = tlsOptions.filter(
    (row) =>
      row.metadata.status === 'ready' &&
      coversAllHostnames(row.metadata.dnsNames, hostnames),
  )

  return (
    <View style={orgPanelStyles.detailCard}>
      <Text style={orgPanelStyles.detailTitle}>{composeServiceName}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="app.example.com, www.example.com"
        placeholderTextColor={colors.textDim}
        style={styles.hostnamesInput}
      />
      <Text style={styles.tlsLabel}>TLS certificate</Text>
      <View style={styles.tlsOptions}>
        <Pressable
          style={[styles.tlsChip, tlsId === null && styles.tlsChipActive]}
          disabled={disabled}
          onPress={() => onTlsChange(null)}
        >
          <Text style={styles.tlsChipText}>Auto</Text>
        </Pressable>
        {covering.map((row) => (
          <Pressable
            key={row.id}
            style={[styles.tlsChip, tlsId === row.id && styles.tlsChipActive]}
            disabled={disabled}
            onPress={() => onTlsChange(row.id)}
          >
            <Text style={styles.tlsChipText}>{tlsLabel(row)}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        style={[styles.saveHostingButton, saving && styles.buttonDisabled]}
        disabled={disabled}
        onPress={onSave}
      >
        <Text style={styles.saveHostingButtonText}>
          {saving ? 'Saving…' : 'Save hostnames'}
        </Text>
      </Pressable>
    </View>
  )
}

function EnvironmentPlacementPanel({
  placementServerId,
  sortedServers,
  savingPlacement,
  onSavePlacement,
}: Readonly<{
  placementServerId: string | null
  sortedServers: OrgServerRecord[]
  savingPlacement: boolean
  onSavePlacement: (serverId: string) => void
}>) {
  const options = placementDropdownOptions(sortedServers, placementServerId)
  const selected = sortedServers.find((server) => server.id === placementServerId) ?? null
  const selectedOffline = Boolean(selected && !selected.connected)

  let picker
  if (options.length === 0) {
    picker = (
      <Text style={orgPanelStyles.muted}>No connected servers available.</Text>
    )
  } else if (Platform.OS === 'web') {
    picker = createElement(
      'select',
      {
        value: placementServerId ?? '',
        disabled: savingPlacement,
        onChange: (event: { target: { value: string } }) => {
          if (event.target.value) {
            onSavePlacement(event.target.value)
          }
        },
        style: webSelectStyle,
        'aria-required': true,
      },
      [
        createElement(
          'option',
          { key: '', value: '', disabled: true },
          'Select a server…',
        ),
        ...options.map((server) =>
          createElement(
            'option',
            { key: server.id, value: server.id },
            serverOptionLabel(server),
          ),
        ),
      ],
    )
  } else {
    picker = (
      <View style={styles.serverList}>
        {!placementServerId ? (
          <Text style={orgPanelStyles.muted}>Select a server…</Text>
        ) : null}
        {options.map((server) => {
          const isSelected = placementServerId === server.id
          const canSelect = server.connected
          if (!canSelect) {
            return (
              <View
                key={server.id}
                style={[
                  styles.serverOption,
                  styles.serverOptionDisabled,
                  isSelected && styles.serverOptionSelected,
                ]}
              >
                <Text
                  style={[
                    styles.serverOptionText,
                    styles.serverOptionTextDisabled,
                  ]}
                >
                  {serverOptionLabel(server)}
                </Text>
              </View>
            )
          }
          return (
            <Pressable
              key={server.id}
              style={[
                styles.serverOption,
                isSelected && styles.serverOptionSelected,
              ]}
              disabled={savingPlacement}
              onPress={() => onSavePlacement(server.id)}
            >
              <Text style={styles.serverOptionText}>
                {serverOptionLabel(server)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    )
  }

  return (
    <SectionPanel
      title="Server"
      hint="Required — this environment deploys to one server"
    >
      {picker}
      {!placementServerId ? (
        <Text style={orgPanelStyles.error}>
          Select a server before deploying.
        </Text>
      ) : null}
      {selectedOffline ? (
        <Text style={orgPanelStyles.error}>
          Selected server is offline. Choose a connected server.
        </Text>
      ) : null}
      {savingPlacement ? (
        <Text style={orgPanelStyles.muted}>Saving…</Text>
      ) : null}
    </SectionPanel>
  )
}

function EnvironmentLoadedPanels({
  environment,
  projectId,
  mergedCompose,
  serviceNames,
  allServers,
  sortedServers,
  placementServerId,
  deployBlocked,
  deploying,
  deployStatus,
  onDeploy,
  onSaveCompose,
  savingCompose,
  savingPlacement,
  onSavePlacement,
  services,
  hostnames,
  setHostnames,
  tlsPins,
  setTlsPins,
  tlsLibrary,
  savingHosting,
  onSaveHostnames,
  containersByService,
  showEnvironmentPanel = true,
}: Readonly<{
  environment: EnvironmentRecord
  projectId: string
  mergedCompose: ComposeDocument
  serviceNames: string[]
  allServers: OrgServerRecord[]
  sortedServers: OrgServerRecord[]
  placementServerId: string | null
  deployBlocked: boolean
  deploying: boolean
  deployStatus: string | null
  onDeploy: () => void
  onSaveCompose: (compose: ComposeDocument) => Promise<void>
  savingCompose: boolean
  savingPlacement: boolean
  onSavePlacement: (serverId: string) => void
  services: ServiceRecord[]
  hostnames: Record<string, string>
  setHostnames: Dispatch<SetStateAction<Record<string, string>>>
  tlsPins: Record<string, string | null>
  setTlsPins: Dispatch<SetStateAction<Record<string, string | null>>>
  tlsLibrary: TlsRecord[]
  savingHosting: string | null
  onSaveHostnames: (composeServiceName: string) => void
  containersByService: Record<string, ContainerRecord[]>
  showEnvironmentPanel?: boolean
}>) {
  const hasContainers = services.some(
    (service) => (containersByService[service.id] ?? []).length > 0,
  )

  return (
    <>
      {showEnvironmentPanel ? (
        <SectionPanel title="Environment" hint="Environment details">
          <Text style={orgPanelStyles.detailTitle}>
            {environment.displayName?.trim() || 'Unnamed environment'}
          </Text>
          {environment.description ? (
            <Text style={orgPanelStyles.detailLine}>
              {environment.description}
            </Text>
          ) : null}
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Project: </Text>
            {projectId}
          </Text>
        </SectionPanel>
      ) : null}

      <SectionPanel title="Compose overlay" hint="Overrides the project compose">
        <ComposeEditorSection
          document={environment.options?.compose}
          onSave={onSaveCompose}
          saving={savingCompose}
          title="Environment compose overlay"
          managePlacement
        />
      </SectionPanel>

      <EnvironmentPlacementPanel
        placementServerId={placementServerId}
        sortedServers={sortedServers}
        savingPlacement={savingPlacement}
        onSavePlacement={onSavePlacement}
      />

      <SectionPanel
        title="Merged runtime compose"
        hint="Project base + overlay as deployed (comments stripped; hosting labels added on the server)"
      >
        <TextInput
          editable={false}
          multiline
          value={composeDocumentToRuntimeYaml(mergedCompose)}
          style={styles.preview}
          textAlignVertical="top"
        />
      </SectionPanel>

      <SectionPanel
        title="Deploy"
        hint="Deploy this environment to its selected server"
      >
        <Pressable
          style={[
            styles.deployButton,
            (deploying || deployBlocked) && styles.buttonDisabled,
          ]}
          disabled={deploying || deployBlocked}
          onPress={onDeploy}
        >
          <Text style={styles.deployButtonText}>
            {deploying ? 'Deploying…' : 'Deploy'}
          </Text>
        </Pressable>
        {deployStatus ? (
          <Text style={orgPanelStyles.detailLine}>{deployStatus}</Text>
        ) : null}
      </SectionPanel>

      <SectionPanel title="Hostnames" hint="Map compose services to hostnames">
        {serviceNames.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Add services to Compose before configuring hostnames.</Text>
        ) : (
          <View style={styles.hostingList}>
            {serviceNames.map((composeServiceName) => {
              const service = services.find(
                (item) => item.metadata?.composeServiceName === composeServiceName,
              )
              const serviceId = service?.id ?? composeServiceName
              return (
                <HostingHostnameRow
                  key={composeServiceName}
                  composeServiceName={composeServiceName}
                  value={hostnames[serviceId] ?? ''}
                  tlsId={tlsPins[serviceId] ?? null}
                  tlsOptions={tlsLibrary}
                  saving={savingHosting === composeServiceName}
                  disabled={savingHosting !== null}
                  onChange={(value) =>
                    setHostnames((current) => ({ ...current, [serviceId]: value }))
                  }
                  onTlsChange={(nextTlsId) =>
                    setTlsPins((current) => ({ ...current, [serviceId]: nextTlsId }))
                  }
                  onSave={() => onSaveHostnames(composeServiceName)}
                />
              )
            })}
          </View>
        )}
      </SectionPanel>

      <SectionPanel title="Containers" hint="Deployed containers and their status">
        {!hasContainers ? (
          <Text style={orgPanelStyles.muted}>No containers deployed yet.</Text>
        ) : (
          <View style={styles.containerList}>
            {services.map((service) => {
              const containers = containersByService[service.id] ?? []
              if (containers.length === 0) {
                return null
              }
              return (
                <View key={service.id} style={orgPanelStyles.detailCard}>
                  <Text style={orgPanelStyles.detailTitle}>
                    {service.displayName?.trim() ||
                      String(service.metadata?.composeServiceName ?? service.id)}
                  </Text>
                  {containers.map((container) => (
                    <View key={container.id} style={styles.containerRow}>
                      <View style={styles.containerHeader}>
                        <Text style={orgPanelStyles.detailLine}>
                          {containerDisplayName(container)}
                        </Text>
                        <ContainerStatusBadge status={container.metadata?.status} />
                      </View>
                      <Text style={orgPanelStyles.detailLine}>
                        <Text style={orgPanelStyles.detailLabel}>Host: </Text>
                        {containerHostLabel(container, allServers)}
                      </Text>
                    </View>
                  ))}
                </View>
              )
            })}
          </View>
        )}
      </SectionPanel>
    </>
  )
}

export function EnvironmentDetailBody({
  orgId,
  projectId,
  environmentId,
  embedded = false,
}: Readonly<{
  orgId: string
  projectId: string
  environmentId: string
  embedded?: boolean
}>) {
  const { handleUnauthorized } = useAuth()
  const [environment, setEnvironment] = useState<EnvironmentRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projectCompose, setProjectCompose] = useState<unknown>(null)
  const [savingCompose, setSavingCompose] = useState(false)
  const [savingPlacement, setSavingPlacement] = useState(false)
  const [allServers, setAllServers] = useState<OrgServerRecord[]>([])
  const [deploying, setDeploying] = useState(false)
  const [deployStatus, setDeployStatus] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [hostingsByService, setHostingsByService] = useState<Record<string, HostingRecord[]>>({})
  const [hostnames, setHostnames] = useState<Record<string, string>>({})
  const [tlsPins, setTlsPins] = useState<Record<string, string | null>>({})
  const [tlsLibrary, setTlsLibrary] = useState<TlsRecord[]>([])
  const [savingHosting, setSavingHosting] = useState<string | null>(null)
  const [containersByService, setContainersByService] = useState<
    Record<string, ContainerRecord[]>
  >({})

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [result, projectResult, serversResult, servicesResult, tlsResult] =
          await Promise.all([
            fetchEnvironment(environmentId),
            fetchProject(projectId),
            fetchOrgServers(),
            fetchVisibleServices(environmentId),
            fetchTlsLibrary(),
          ])
        if (cancelled) {
          return
        }
        setEnvironment(result.environment)
        setProjectCompose(projectResult.project.options?.compose)
        setAllServers(serversResult.servers)
        setServices(servicesResult.services)
        setTlsLibrary(tlsResult.tls)
        const [hostingState, containersState] = await Promise.all([
          fetchHostingsByService(servicesResult.services),
          fetchContainersByService(servicesResult.services),
        ])
        if (cancelled) {
          return
        }
        setHostingsByService(hostingState.byService)
        setHostnames(hostingState.hostnames)
        setTlsPins(hostingState.tlsPins)
        setContainersByService(containersState)
      } catch (err) {
        if (cancelled) {
          return
        }
        await reportSectionError(
          err,
          handleUnauthorized,
          setError,
          'Failed to load environment',
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load().catch(() => {
      // Errors are handled inside load via setError / unauthorized recovery.
    })

    return () => {
      cancelled = true
    }
  }, [environmentId, handleUnauthorized, projectId])

  const mergedCompose = useMemo(
    () =>
      mergeComposeOverlay(
        stripComposePlacement(normalizeCompose(projectCompose)),
        environment?.options?.compose,
      ),
    [environment?.options?.compose, projectCompose],
  )
  const serviceNames = useMemo(() => composeServiceNames(mergedCompose), [mergedCompose])
  const placementServerId = useMemo(
    () =>
      readComposePlacementServerId(
        normalizeCompose(environment?.options?.compose),
      ),
    [environment?.options?.compose],
  )
  const pinnedServer = useMemo(
    () => allServers.find((server) => server.id === placementServerId) ?? null,
    [allServers, placementServerId],
  )
  const deployBlocked =
    deployBlockedReason(placementServerId, pinnedServer) !== null
  const sortedServers = useMemo(
    () =>
      [...allServers].sort((a, b) =>
        (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id),
      ),
    [allServers],
  )

  const saveCompose = async (compose: ComposeDocument) => {
    setSavingCompose(true)
    setError(null)
    try {
      await updateEnvironment(environmentId, { options: { compose } })
      setEnvironment((current) =>
        current
          ? { ...current, options: { compose } }
          : current,
      )
    } catch (err) {
      await reportSectionError(
        err,
        handleUnauthorized,
        setError,
        'Failed to save compose overlay',
      )
    } finally {
      setSavingCompose(false)
    }
  }

  const savePlacement = async (serverIdToPin: string) => {
    setSavingPlacement(true)
    setError(null)
    try {
      const compose = setComposePlacementServerId(
        normalizeCompose(environment?.options?.compose),
        serverIdToPin,
      )
      await updateEnvironment(environmentId, { options: { compose } })
      setEnvironment((current) =>
        current
          ? { ...current, options: { compose } }
          : current,
      )
    } catch (err) {
      await reportSectionError(
        err,
        handleUnauthorized,
        setError,
        'Failed to save placement',
      )
    } finally {
      setSavingPlacement(false)
    }
  }

  const deploy = async () => {
    const blockedReason = deployBlockedReason(placementServerId, pinnedServer)
    if (blockedReason || !placementServerId) {
      setDeployStatus(
        blockedReason ?? 'Select a server for this environment before deploying.',
      )
      return
    }
    setDeploying(true)
    setDeployStatus('Queueing deployment…')
    try {
      const result = await deployEnvironment(environmentId)
      const command = await waitForTerminalCommand(
        placementServerId,
        result.commandId,
      )
      setDeployStatus(deployStatusMessage(command))
      if (command.status === 'succeeded') {
        const refreshed = await refreshServicesAndContainersAfterDeploy(environmentId)
        setServices(refreshed.services)
        setContainersByService(refreshed.containersByService)
      }
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setDeployStatus(deployErrorMessage(err))
    } finally {
      setDeploying(false)
    }
  }

  const saveHostnames = async (composeServiceName: string) => {
    setSavingHosting(composeServiceName)
    setError(null)
    try {
      const service = services.find(
        (item) => item.metadata?.composeServiceName === composeServiceName,
      )
      const resolvedService = service ?? {
        id: (await createService(environmentId, {
          displayName: composeServiceName,
          metadata: { composeServiceName },
        })).id,
      }
      const serviceKey = service?.id ?? composeServiceName
      const options = {
        hostnames: parseHostnameList(hostnames[serviceKey] ?? ''),
      }
      const tlsId = tlsPins[serviceKey] ?? null
      await upsertHosting(
        resolvedService.id,
        composeServiceName,
        options,
        hostingsByService,
        tlsId,
      )
      const [servicesResult, hostingsResult] = await Promise.all([
        fetchVisibleServices(environmentId),
        fetchVisibleHostings(resolvedService.id),
      ])
      setServices(servicesResult.services)
      setHostingsByService((current) => ({
        ...current,
        [resolvedService.id]: hostingsResult.hostings,
      }))
      setHostnames((current) => ({
        ...current,
        [resolvedService.id]: options.hostnames.join(', '),
      }))
      setTlsPins((current) => ({
        ...current,
        [resolvedService.id]: hostingsResult.hostings[0]?.tlsId ?? tlsId,
      }))
      setContainersByService(await fetchContainersByService(servicesResult.services))
    } catch (err) {
      await reportSectionError(
        err,
        handleUnauthorized,
        setError,
        'Failed to save hosting',
      )
    } finally {
      setSavingHosting(null)
    }
  }

  if (loading && !environment) {
    return <Text style={orgPanelStyles.muted}>Loading…</Text>
  }

  return (
    <View style={styles.body}>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {environment ? (
        <EnvironmentLoadedPanels
          environment={environment}
          projectId={projectId}
          mergedCompose={mergedCompose}
          serviceNames={serviceNames}
          allServers={allServers}
          sortedServers={sortedServers}
          placementServerId={placementServerId}
          deployBlocked={deployBlocked}
          deploying={deploying}
          deployStatus={deployStatus}
          onDeploy={() => {
            deploy().catch(() => {
              // Errors are surfaced via deployStatus.
            })
          }}
          onSaveCompose={saveCompose}
          savingCompose={savingCompose}
          savingPlacement={savingPlacement}
          onSavePlacement={(nextServerId) => {
            void savePlacement(nextServerId)
          }}
          services={services}
          hostnames={hostnames}
          setHostnames={setHostnames}
          tlsPins={tlsPins}
          setTlsPins={setTlsPins}
          tlsLibrary={tlsLibrary}
          savingHosting={savingHosting}
          onSaveHostnames={(composeServiceName) => {
            saveHostnames(composeServiceName).catch(() => {
              // Errors are surfaced via setError.
            })
          }}
          containersByService={containersByService}
          showEnvironmentPanel={!embedded}
        />
      ) : null}

      <VariablesSection orgId={orgId} parentField={{ environmentId }} />
    </View>
  )
}

export function EnvironmentDetailSection({
  orgId,
  projectId,
  environmentId,
}: Readonly<{
  orgId: string
  projectId: string
  environmentId: string
}>) {
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Environment</Text>
      <EnvironmentDetailBody
        orgId={orgId}
        projectId={projectId}
        environmentId={environmentId}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  body: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  preview: {
    minHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: spacing.sm,
  },
  serverList: { gap: spacing.xs },
  serverOption: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    backgroundColor: colors.bgSecondary,
    padding: spacing.sm,
  },
  serverOptionSelected: { borderColor: colors.accent, backgroundColor: colors.bgActive },
  serverOptionDisabled: { opacity: 0.6 },
  serverOptionText: { color: colors.text, fontSize: 13, fontFamily: 'monospace' },
  serverOptionTextDisabled: { color: colors.textMuted },
  deployButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 8,
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deployButtonText: { color: colors.buttonText, fontSize: 14, fontWeight: '700' },
  hostingList: { gap: spacing.sm },
  hostnamesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tlsLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  tlsOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  tlsChip: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tlsChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  tlsChipText: {
    color: colors.textChip,
    fontSize: 12,
  },
  saveHostingButton: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  saveHostingButtonText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
  containerList: { gap: spacing.sm },
  containerRow: { gap: spacing.xs, marginTop: spacing.sm },
  containerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
})

const statusBadgeVariantStyles: Record<
  ContainerStatusVariant,
  { badge: { borderColor: string; backgroundColor: string }; text: { color: string } }
> = {
  running: {
    badge: { borderColor: colors.accent, backgroundColor: colors.bgActive },
    text: { color: colors.accent },
  },
  pending: {
    badge: { borderColor: colors.pending, backgroundColor: colors.bgSecondary },
    text: { color: colors.pending },
  },
  stopped: {
    badge: { borderColor: colors.error, backgroundColor: colors.bgSecondary },
    text: { color: colors.error },
  },
  unknown: {
    badge: { borderColor: colors.borderChip, backgroundColor: colors.bgSecondary },
    text: { color: colors.textMuted },
  },
}
