import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import { usePersistEnvironmentCompose } from '@/components/org/compose-persistence'
import { DeployPreviewPanel } from '@/components/org/deploy-preview-panel'
import {
  ContainerRoleBadge,
  ContainerStatusBadge,
} from '@/components/org/managed/container-status-badge'
import { ServiceSettingsPanel } from '@/components/org/service-settings-panel'
import { StorageSection } from '@/components/org/storage-section'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { VariablesSection } from '@/components/org/variables-section'
import {
  DeployHealthCheckMissingError,
  type CommandRecord,
  type ComposeDocument,
  type ContainerRecord,
  type EnvironmentRecord,
  type HostingRecord,
  type IpRecord,
  type OrgServerRecord,
  type ServiceRecord,
  type TlsRecord,
} from '@/lib/instance-api'
import {
  isTerminalCommandStatus,
  useCommandsBatch,
  type TrackedCommandEntry,
} from '@/lib/queries/commands'
import {
  useContainersByServices,
} from '@/lib/queries/containers'
import {
  useDeployEnvironment,
  useEnvironment,
  useUpdateEnvironment,
} from '@/lib/queries/environments'
import { useProject } from '@/lib/queries/projects'
import { useOrgServers } from '@/lib/queries/servers'
import {
  useHostingsByServices,
  useServices,
  useUpsertHosting,
} from '@/lib/queries/services'
import { useTlsLibrary } from '@/lib/queries/tls'
import { useIps } from '@/lib/queries/topology'
import { coversAllHostnames } from '@/lib/tls-match'
import {
  composeDocumentToRuntimeYaml,
  hostingDockerBridgeHint,
  hostingPathPrefixHint,
  hostingPhpSectionCopy,
  hostingServiceKindLabel,
  hostingWebEnvSectionCopy,
  mergeComposeOverlay,
  normalizeCompose,
  resolveHostingServiceContext,
  shouldRevealOptionalHostingFields,
  stripComposePlacement,
  withEffectivePlacement,
  type HostingServiceContext,
} from '@/lib/compose'
import { chrome, colors, spacing } from '@/lib/theme'
import { useCan } from '@/lib/query-client'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

type HostingBind = 'public' | 'datacenter' | 'local'
type HostingProtocol = 'http' | 'tcp' | 'udp'

type HostingEditorState = {
  hostnames: string
  tlsId: string | null
  ipId: string | null
  bind: HostingBind
  forceHttps: boolean
  gzip: boolean
  brotli: boolean
  stripPrefix: string
  pathPrefix: string
  targetPort: string
  protocol: HostingProtocol
  /** Comma-separated `published[:target]` pairs; target defaults to published when omitted. */
  ports: string
  /** Multiline KEY=VALUE for options.web.env (HTTP hostings). */
  webEnvLines: string
  phpVersion: string
  phpMemoryLimit: string
  phpMaxExecutionTime: string
}

function formatWebEnvLines(web: unknown): string {
  if (!web || typeof web !== 'object' || Array.isArray(web)) return ''
  const env = (web as { env?: unknown }).env
  if (!env || typeof env !== 'object' || Array.isArray(env)) return ''
  return Object.entries(env as Record<string, string>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function parseWebEnvLines(text: string): Record<string, string> | undefined {
  const env: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    env[key] = trimmed.slice(eq + 1).trim()
  }
  return Object.keys(env).length > 0 ? env : undefined
}

function readWebOptions(optionsRecord: Record<string, unknown> | null): {
  webEnvLines: string
  phpVersion: string
  phpMemoryLimit: string
  phpMaxExecutionTime: string
} {
  const web = optionsRecord?.web
  const php =
    web && typeof web === 'object' && !Array.isArray(web)
      ? (web as { php?: unknown }).php
      : undefined
  const phpRecord =
    php && typeof php === 'object' && !Array.isArray(php)
      ? (php as Record<string, unknown>)
      : undefined
  return {
    webEnvLines: formatWebEnvLines(web),
    phpVersion: typeof phpRecord?.version === 'string' ? phpRecord.version : '',
    phpMemoryLimit:
      typeof phpRecord?.memoryLimit === 'string' ? phpRecord.memoryLimit : '',
    phpMaxExecutionTime:
      typeof phpRecord?.maxExecutionTime === 'number'
        ? String(phpRecord.maxExecutionTime)
        : '',
  }
}

function readHostingProtocol(
  options: Record<string, unknown> | null | undefined,
): HostingProtocol {
  const protocol = options?.protocol
  return protocol === 'tcp' || protocol === 'udp' ? protocol : 'http'
}

function formatHostingPorts(options: Record<string, unknown> | null | undefined): string {
  const raw = options?.ports
  if (!Array.isArray(raw)) {
    return ''
  }
  return raw
    .filter(
      (entry): entry is { published: number; target: number } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { published?: unknown }).published === 'number' &&
        typeof (entry as { target?: unknown }).target === 'number',
    )
    .map((entry) =>
      entry.published === entry.target ? String(entry.published) : `${entry.published}:${entry.target}`,
    )
    .join(', ')
}

/** Parses `"5432, 5433:5432"` into port mappings; shorthand `published` implies `target === published`. */
function parsePortsList(value: string): { published: number; target: number }[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [publishedRaw, targetRaw] = entry.split(':').map((part) => part.trim())
      const published = Number.parseInt(publishedRaw ?? '', 10)
      const target = targetRaw ? Number.parseInt(targetRaw, 10) : published
      return { published, target }
    })
    .filter(
      (port) =>
        Number.isInteger(port.published) &&
        port.published >= 1 &&
        port.published <= 65535 &&
        Number.isInteger(port.target) &&
        port.target >= 1 &&
        port.target <= 65535,
    )
}

function readHostingBind(options: Record<string, unknown> | null | undefined): HostingBind {
  const bind = options?.bind
  if (bind === 'datacenter' || bind === 'local' || bind === 'public') {
    return bind
  }
  return 'public'
}

function readHostingEditor(hostings: HostingRecord[]): HostingEditorState {
  const options = hostings[0]?.options
  const optionsRecord =
    options && typeof options === 'object' && !Array.isArray(options)
      ? (options as Record<string, unknown>)
      : null
  const proxy =
    optionsRecord?.proxy &&
    typeof optionsRecord.proxy === 'object' &&
    !Array.isArray(optionsRecord.proxy)
      ? (optionsRecord.proxy as Record<string, unknown>)
      : undefined
  const targetPort =
    typeof optionsRecord?.targetPort === 'number'
      ? String(optionsRecord.targetPort)
      : ''
  const pathPrefix =
    typeof optionsRecord?.pathPrefix === 'string'
      ? optionsRecord.pathPrefix
      : ''
  return {
    hostnames: formatHostingHostnames(hostings),
    tlsId: hostings[0]?.tlsId ?? null,
    ipId: hostings[0]?.ipId ?? null,
    bind: readHostingBind(optionsRecord),
    forceHttps: proxy?.forceHttps !== false,
    gzip: proxy?.gzip !== false,
    brotli: proxy?.brotli === true,
    stripPrefix: typeof proxy?.stripPrefix === 'string' ? proxy.stripPrefix : '',
    pathPrefix,
    targetPort,
    protocol: readHostingProtocol(optionsRecord),
    ports: formatHostingPorts(optionsRecord),
    ...readWebOptions(optionsRecord),
  }
}

function buildHostingOptions(editor: HostingEditorState): Record<string, unknown> {
  const options: Record<string, unknown> = {
    bind: editor.bind,
  }
  if (editor.protocol === 'tcp' || editor.protocol === 'udp') {
    options.protocol = editor.protocol
    options.hostnames = []
    options.ports = parsePortsList(editor.ports)
    return options
  }
  options.hostnames = parseHostnameList(editor.hostnames)
  options.proxy = {
    forceHttps: editor.forceHttps,
    gzip: editor.gzip,
    brotli: editor.brotli,
    ...(editor.stripPrefix.trim() ? { stripPrefix: editor.stripPrefix.trim() } : {}),
  }
  if (editor.pathPrefix.trim()) {
    options.pathPrefix = editor.pathPrefix.trim()
  }
  const port = Number.parseInt(editor.targetPort.trim(), 10)
  if (Number.isFinite(port) && port > 0) {
    options.targetPort = port
  }
  const staticEnv = parseWebEnvLines(editor.webEnvLines)
  const phpVersion = editor.phpVersion.trim()
  const phpMemoryLimit = editor.phpMemoryLimit.trim()
  const phpMaxRaw = editor.phpMaxExecutionTime.trim()
  const phpMax = phpMaxRaw ? Number.parseInt(phpMaxRaw, 10) : Number.NaN
  const php: Record<string, string | number> = {}
  if (phpVersion) php.version = phpVersion
  if (phpMemoryLimit) php.memoryLimit = phpMemoryLimit
  if (Number.isInteger(phpMax) && phpMax > 0) php.maxExecutionTime = phpMax
  if (staticEnv || Object.keys(php).length > 0) {
    options.web = {
      ...(staticEnv ? { env: staticEnv } : {}),
      ...(Object.keys(php).length > 0 ? { php } : {}),
    }
  }
  return options
}

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

function containerDisplayName(container: ContainerRecord): string {
  return container.containerName || container.composeServiceName || container.id
}

/** App rows first (existing ordinal order), then the single ingress row. */
function partitionContainersForDisplay(
  containers: ContainerRecord[],
): ContainerRecord[] {
  const appRows = containers.filter((row) => row.role !== 'ingress')
  const ingressRows = containers.filter((row) => row.role === 'ingress')
  return [...appRows, ...ingressRows]
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

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function parseHostnameList(value: string): string[] {
  return value
    .split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean)
}

function upsertServiceById(
  current: ServiceRecord[],
  nextService: ServiceRecord,
): ServiceRecord[] {
  const index = current.findIndex((row) => row.id === nextService.id)
  if (index === -1) {
    return [...current, nextService]
  }
  const copy = [...current]
  copy[index] = nextService
  return copy
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

function tlsLabel(row: TlsRecord): string {
  return row.displayName?.trim() || row.metadata.dnsNames[0] || row.id.slice(0, 8)
}

function deployBlockedReason(
  placementServerId: string | null,
  pinnedServer: OrgServerRecord | null,
  serviceCount: number,
): string | null {
  if (serviceCount === 0) {
    return 'Add at least one service to Compose before deploying.'
  }
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

function ProxyToggle({
  label,
  checked,
  disabled,
  onToggle,
}: Readonly<{
  label: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}>) {
  return (
    <Pressable style={styles.proxyToggleRow} disabled={disabled} onPress={onToggle}>
      <View style={[styles.proxyCheckbox, checked && styles.proxyCheckboxChecked]}>
        {checked ? <Text style={styles.proxyCheckboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.proxyToggleLabel}>{label}</Text>
    </Pressable>
  )
}

function HostingWebEnvAndPhpFields({
  serviceContext,
  editor,
  onChange,
}: Readonly<{
  serviceContext: HostingServiceContext
  editor: HostingEditorState
  onChange: (patch: Partial<HostingEditorState>) => void
}>) {
  const phpCopy = hostingPhpSectionCopy(serviceContext)
  const webEnvCopy = hostingWebEnvSectionCopy(serviceContext)
  const hasPhpValues =
    editor.phpVersion.trim().length > 0 ||
    editor.phpMemoryLimit.trim().length > 0 ||
    editor.phpMaxExecutionTime.trim().length > 0
  const hasWebEnvValues = editor.webEnvLines.trim().length > 0
  const showPhpFields = shouldRevealOptionalHostingFields(
    phpCopy.showFields,
    hasPhpValues,
  )
  const showWebEnvFields = shouldRevealOptionalHostingFields(
    webEnvCopy.showFields,
    hasWebEnvValues,
  )

  return (
    <>
      <Text style={styles.fieldLabel}>{webEnvCopy.title}</Text>
      <Text style={orgPanelStyles.muted}>{webEnvCopy.hint}</Text>
      {showWebEnvFields ? (
        <>
          {!webEnvCopy.showFields && hasWebEnvValues ? (
            <Text style={styles.staleFieldWarn}>
              Stored values are ignored for this service kind — clear them
              before save if you no longer need them.
            </Text>
          ) : null}
          <TextInput
            value={editor.webEnvLines}
            onChangeText={(value) => onChange({ webEnvLines: value })}
            placeholder={'APP_ENV=production\n# comments allowed'}
            placeholderTextColor={colors.textDim}
            style={[styles.hostnamesInput, styles.webEnvInput]}
            autoCapitalize="none"
            multiline
          />
        </>
      ) : null}

      <Text style={styles.fieldLabel}>{phpCopy.title}</Text>
      <Text style={orgPanelStyles.muted}>{phpCopy.hint}</Text>
      {showPhpFields ? (
        <>
          {!phpCopy.showFields && hasPhpValues ? (
            <Text style={styles.staleFieldWarn}>
              Stored PHP values are ignored for this engine — clear them
              before save if you no longer need them.
            </Text>
          ) : null}
          <Text style={styles.fieldLabel}>PHP version</Text>
          <TextInput
            value={editor.phpVersion}
            onChangeText={(value) => onChange({ phpVersion: value })}
            placeholder="8.4"
            placeholderTextColor={colors.textDim}
            style={styles.hostnamesInput}
            autoCapitalize="none"
          />
          <Text style={styles.fieldLabel}>Memory limit</Text>
          <TextInput
            value={editor.phpMemoryLimit}
            onChangeText={(value) => onChange({ phpMemoryLimit: value })}
            placeholder="256M"
            placeholderTextColor={colors.textDim}
            style={styles.hostnamesInput}
            autoCapitalize="none"
          />
          <Text style={styles.fieldLabel}>Max execution time (seconds)</Text>
          <TextInput
            value={editor.phpMaxExecutionTime}
            onChangeText={(value) => onChange({ phpMaxExecutionTime: value })}
            placeholder="30"
            placeholderTextColor={colors.textDim}
            style={styles.hostnamesInput}
            keyboardType="number-pad"
          />
        </>
      ) : null}
    </>
  )
}

function HostingPanelRow({
  orgId,
  composeServiceName,
  serviceContext,
  hostingId,
  editor,
  tlsOptions,
  publicIps,
  saving,
  disabled,
  onChange,
  onSave,
}: Readonly<{
  orgId: string
  composeServiceName: string
  serviceContext: HostingServiceContext
  /** Persisted hosting row id; null until the first successful save. */
  hostingId: string | null
  editor: HostingEditorState
  tlsOptions: TlsRecord[]
  publicIps: IpRecord[]
  saving: boolean
  disabled: boolean
  onChange: (patch: Partial<HostingEditorState>) => void
  onSave: () => void
}>) {
  const hostnames = parseHostnameList(editor.hostnames)
  const covering = tlsOptions.filter(
    (row) =>
      row.metadata.status === 'ready' &&
      coversAllHostnames(row.metadata.dnsNames, hostnames),
  )

  const isHttp = editor.protocol === 'http'
  const kindLabel = hostingServiceKindLabel(serviceContext)
  const dockerBridgeHint = hostingDockerBridgeHint(serviceContext)

  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.hostingTitleRow}>
        <Text style={orgPanelStyles.detailTitle}>{composeServiceName}</Text>
        <Text style={styles.serviceKindBadge}>{kindLabel}</Text>
      </View>
      {dockerBridgeHint ? (
        <Text style={styles.tlsHint}>{dockerBridgeHint}</Text>
      ) : null}

      <Text style={styles.tlsLabel}>Protocol</Text>
      <Text style={styles.tlsHint}>
        Http routes hostnames through Traefik + Caddy with TLS. Tcp/Udp publish
        raw port(s) straight through Traefik — no hostname or TLS routing
        (databases, game servers, relays).
      </Text>
      <View style={styles.tlsOptions}>
        {(
          [
            { id: 'http' as const, label: 'Http' },
            { id: 'tcp' as const, label: 'Tcp' },
            { id: 'udp' as const, label: 'Udp' },
          ] as const
        ).map((option) => (
          <Pressable
            key={option.id}
            style={[
              styles.tlsChip,
              editor.protocol === option.id && styles.tlsChipActive,
            ]}
            disabled={disabled}
            onPress={() => onChange({ protocol: option.id })}
          >
            <Text style={styles.tlsChipText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {isHttp ? (
        <TextInput
          value={editor.hostnames}
          onChangeText={(value) => onChange({ hostnames: value })}
          placeholder="app.example.com, www.example.com"
          placeholderTextColor={colors.textDim}
          style={styles.hostnamesInput}
        />
      ) : (
        <>
          <Text style={styles.fieldLabel}>Ports</Text>
          <Text style={styles.tlsHint}>
            Comma-separated published[:target] pairs. Target defaults to
            published when omitted (e.g. &quot;5432, 8443:8080&quot;).
          </Text>
          <TextInput
            value={editor.ports}
            onChangeText={(value) => onChange({ ports: value })}
            placeholder="5432, 8443:8080"
            placeholderTextColor={colors.textDim}
            style={styles.hostnamesInput}
            autoCapitalize="none"
          />
        </>
      )}

      {isHttp ? (
        <>
          <Text style={styles.tlsLabel}>TLS certificate</Text>
          <Text style={styles.tlsHint}>
            Default is a basic self-signed cert. Pick a library certificate to use
            an upload, org self-signed, or Let&apos;s Encrypt cert — nothing is requested
            automatically.
          </Text>
          <View style={styles.tlsOptions}>
            <Pressable
              style={[styles.tlsChip, editor.tlsId === null && styles.tlsChipActive]}
              disabled={disabled}
              onPress={() => onChange({ tlsId: null })}
            >
              <Text style={styles.tlsChipText}>Self-signed</Text>
            </Pressable>
            {covering.map((row) => (
              <Pressable
                key={row.id}
                style={[styles.tlsChip, editor.tlsId === row.id && styles.tlsChipActive]}
                disabled={disabled}
                onPress={() => onChange({ tlsId: row.id })}
              >
                <Text style={styles.tlsChipText}>{tlsLabel(row)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.tlsLabel}>Bind</Text>
      <Text style={styles.tlsHint}>
        Public — reachable on the internet. Datacenter — private network only.
        Local — this server only (127.x).
      </Text>
      <View style={styles.tlsOptions}>
        {(
          [
            { id: 'public' as const, label: 'Public' },
            { id: 'datacenter' as const, label: 'Datacenter' },
            { id: 'local' as const, label: 'Local' },
          ] as const
        ).map((option) => (
          <Pressable
            key={option.id}
            style={[
              styles.tlsChip,
              editor.bind === option.id && styles.tlsChipActive,
            ]}
            disabled={disabled}
            onPress={() =>
              onChange({
                bind: option.id,
                ...(option.id !== 'public' ? { ipId: null } : {}),
              })
            }
          >
            <Text style={styles.tlsChipText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {editor.bind === 'public' ? (
        <>
          <Text style={styles.tlsLabel}>Public IP</Text>
          <Text style={styles.tlsHint}>
            Pin a managed public address, or leave Any interface for the server
            to choose.
          </Text>
          <View style={styles.tlsOptions}>
            <Pressable
              style={[styles.tlsChip, editor.ipId === null && styles.tlsChipActive]}
              disabled={disabled}
              onPress={() => onChange({ ipId: null })}
            >
              <Text style={styles.tlsChipText}>Any interface</Text>
            </Pressable>
            {publicIps.map((ip) => (
              <Pressable
                key={ip.id}
                style={[
                  styles.tlsChip,
                  editor.ipId === ip.id && styles.tlsChipActive,
                ]}
                disabled={disabled}
                onPress={() => onChange({ ipId: ip.id })}
              >
                <Text style={styles.tlsChipText}>
                  {ip.displayName?.trim() || ip.address}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {isHttp ? (
        <>
          <Text style={styles.tlsLabel}>Proxy</Text>
          <ProxyToggle
            label="Force HTTPS"
            checked={editor.forceHttps}
            disabled={disabled}
            onToggle={() => onChange({ forceHttps: !editor.forceHttps })}
          />
          <ProxyToggle
            label="Gzip"
            checked={editor.gzip}
            disabled={disabled}
            onToggle={() => onChange({ gzip: !editor.gzip })}
          />
          <ProxyToggle
            label="Brotli"
            checked={editor.brotli}
            disabled={disabled}
            onToggle={() => onChange({ brotli: !editor.brotli })}
          />

          <Text style={styles.fieldLabel}>Strip prefix</Text>
          <TextInput
            value={editor.stripPrefix}
            onChangeText={(value) => onChange({ stripPrefix: value })}
            placeholder="/api"
            placeholderTextColor={colors.textDim}
            style={styles.hostnamesInput}
            autoCapitalize="none"
          />
          <Text style={styles.fieldLabel}>Path prefix</Text>
          <Text style={orgPanelStyles.muted}>
            {hostingPathPrefixHint(serviceContext)}
          </Text>
          <TextInput
            value={editor.pathPrefix}
            onChangeText={(value) => onChange({ pathPrefix: value })}
            placeholder="/"
            placeholderTextColor={colors.textDim}
            style={styles.hostnamesInput}
            autoCapitalize="none"
          />
          <Text style={styles.fieldLabel}>Target port</Text>
          <TextInput
            value={editor.targetPort}
            onChangeText={(value) => onChange({ targetPort: value })}
            placeholder="8080"
            placeholderTextColor={colors.textDim}
            style={styles.hostnamesInput}
            keyboardType="number-pad"
          />

          <HostingWebEnvAndPhpFields
            serviceContext={serviceContext}
            editor={editor}
            onChange={onChange}
          />
        </>
      ) : null}

      <Pressable
        style={[styles.saveHostingButton, saving && styles.buttonDisabled]}
        disabled={disabled}
        onPress={onSave}
      >
        <Text style={styles.saveHostingButtonText}>
          {saving ? 'Saving…' : 'Save hosting'}
        </Text>
      </Pressable>

      <Text style={styles.tlsLabel}>Hosting variables</Text>
      <Text style={styles.tlsHint}>
        Hostname-scoped overrides for this service. Applied at deploy after
        service scope (compose injects at the service level).
      </Text>
      {hostingId ? (
        <VariablesSection
          orgId={orgId}
          parentField={{ hostingId }}
          embedded
          showPresets={false}
        />
      ) : (
        <Text style={orgPanelStyles.muted}>
          Save hosting first to add hostname-scoped variables.
        </Text>
      )}
    </View>
  )
}

function EnvironmentPlacementPanel({
  placementServerId,
  sortedServers,
  savingPlacement,
  inheritsProjectDefault,
  onSavePlacement,
}: Readonly<{
  placementServerId: string | null
  sortedServers: OrgServerRecord[]
  savingPlacement: boolean
  inheritsProjectDefault?: boolean
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
      hint={
        inheritsProjectDefault
          ? 'Inherited from Project — pick a server to override for this environment'
          : 'Required — this environment deploys to one server'
      }
    >
      {picker}
      {!placementServerId ? (
        <Text style={orgPanelStyles.error}>
          Select a server before deploying (or set a default on Project).
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

function HealthCheckAckModal({
  services,
  required,
  deploying,
  onCancel,
  onConfirm,
}: Readonly<{
  services: string[]
  required: boolean
  deploying: boolean
  onCancel: () => void
  onConfirm: () => void
}>) {
  const serviceList = services.join(', ')
  return (
    <View style={styles.modalBackdrop}>
      <View style={styles.modalCard}>
        <Text style={orgPanelStyles.detailTitle}>
          {required ? 'Health checks required' : 'Health checks missing'}
        </Text>
        <Text style={orgPanelStyles.detailLine}>
          {required
            ? 'These services require a Compose healthcheck before deploy can continue:'
            : 'These services have no healthcheck configured. You can deploy anyway:'}
        </Text>
        <Text style={styles.modalServices}>{serviceList || 'Unknown services'}</Text>
        <View style={styles.modalActions}>
          <Pressable style={styles.modalSecondaryButton} disabled={deploying} onPress={onCancel}>
            <Text style={styles.modalSecondaryText}>Cancel</Text>
          </Pressable>
          {!required ? (
            <Pressable
              style={[styles.modalPrimaryButton, deploying && styles.buttonDisabled]}
              disabled={deploying}
              onPress={onConfirm}
            >
              <Text style={styles.modalPrimaryText}>
                {deploying ? 'Deploying…' : 'Deploy anyway'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function EnvironmentLoadedPanels({
  environment,
  projectId,
  orgId,
  mergedCompose,
  serviceNames,
  allServers,
  sortedServers,
  placementServerId,
  pinnedServer,
  deployBlocked,
  deploying,
  deployStatus,
  onDeploy,
  onSaveCompose,
  savingCompose,
  savingPlacement,
  onSavePlacement,
  inheritsProjectDefault = false,
  services,
  onServiceChange,
  hostingEditors,
  setHostingEditors,
  hostingsByService,
  tlsLibrary,
  publicIps,
  savingHosting,
  onSaveHosting,
  containersByService,
  canManage,
  showEnvironmentPanel = true,
}: Readonly<{
  environment: EnvironmentRecord
  projectId: string
  orgId: string
  mergedCompose: ComposeDocument
  serviceNames: string[]
  allServers: OrgServerRecord[]
  sortedServers: OrgServerRecord[]
  placementServerId: string | null
  pinnedServer: OrgServerRecord | null
  deployBlocked: boolean
  deploying: boolean
  deployStatus: string | null
  onDeploy: () => void
  onSaveCompose: (compose: ComposeDocument) => Promise<void>
  savingCompose: boolean
  savingPlacement: boolean
  onSavePlacement: (serverId: string) => void
  inheritsProjectDefault?: boolean
  services: ServiceRecord[]
  onServiceChange: (nextService: ServiceRecord) => void
  hostingEditors: Record<string, HostingEditorState>
  setHostingEditors: Dispatch<SetStateAction<Record<string, HostingEditorState>>>
  hostingsByService: Record<string, HostingRecord[]>
  tlsLibrary: TlsRecord[]
  publicIps: IpRecord[]
  savingHosting: string | null
  onSaveHosting: (composeServiceName: string) => void
  containersByService: Record<string, ContainerRecord[]>
  canManage: boolean
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
        />
      </SectionPanel>

      <DeployPreviewPanel
        orgId={orgId}
        environmentId={environment.id}
        canManage={canManage}
        placementServerId={placementServerId}
      />

      <EnvironmentPlacementPanel
        placementServerId={placementServerId}
        sortedServers={sortedServers}
        savingPlacement={savingPlacement}
        inheritsProjectDefault={inheritsProjectDefault}
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

      <SectionPanel
        title="Hosting"
        hint="Map compose services to hostnames (http) or raw ports (tcp/udp)"
      >
        {serviceNames.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Add services to Compose before configuring hostnames.</Text>
        ) : (
          <View style={styles.hostingList}>
            {serviceNames.map((composeServiceName) => {
              const service = services.find(
                (item) => item.composeServiceName === composeServiceName,
              )
              const serviceKey = service?.id ?? composeServiceName
              const editor =
                hostingEditors[serviceKey] ??
                readHostingEditor([])
              const hostingId = hostingsByService[serviceKey]?.[0]?.id ?? null
              return (
                <HostingPanelRow
                  key={composeServiceName}
                  orgId={orgId}
                  composeServiceName={composeServiceName}
                  serviceContext={resolveHostingServiceContext(
                    mergedCompose,
                    composeServiceName,
                  )}
                  hostingId={hostingId}
                  editor={editor}
                  tlsOptions={tlsLibrary}
                  publicIps={publicIps}
                  saving={savingHosting === composeServiceName}
                  disabled={savingHosting !== null}
                  onChange={(patch) =>
                    setHostingEditors((current) => ({
                      ...current,
                      [serviceKey]: { ...editor, ...patch },
                    }))
                  }
                  onSave={() => onSaveHosting(composeServiceName)}
                />
              )
            })}
          </View>
        )}
      </SectionPanel>

      <SectionPanel title="Service settings" hint="Per-service deploy options">
        {serviceNames.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Add services to Compose first.</Text>
        ) : (
          <View style={styles.hostingList}>
            {serviceNames.map((composeServiceName) => {
              const service = services.find(
                (item) => item.composeServiceName === composeServiceName,
              )
              return (
                <ServiceSettingsPanel
                  key={composeServiceName}
                  orgId={orgId}
                  composeServiceName={composeServiceName}
                  service={service}
                  canManage={canManage}
                  onServiceChange={onServiceChange}
                />
              )
            })}
          </View>
        )}
      </SectionPanel>

      <StorageSection
        orgId={orgId}
        environmentId={environment.id}
        defaultServerId={placementServerId}
      />

      <SectionPanel title="Containers" hint="Deployed containers and their status">
        {!hasContainers ? (
          <Text style={orgPanelStyles.muted}>No containers deployed yet.</Text>
        ) : (
          <View style={styles.containerList}>
            {services.map((service) => {
              const containers = partitionContainersForDisplay(
                containersByService[service.id] ?? [],
              )
              if (containers.length === 0) {
                return null
              }
              return (
                <View key={service.id} style={orgPanelStyles.detailCard}>
                  <Text style={orgPanelStyles.detailTitle}>
                    {service.displayName?.trim() ||
                      String(service.composeServiceName ?? service.id)}
                  </Text>
                  {containers.map((container) => (
                    <View
                      key={container.id}
                      style={[
                        styles.containerRow,
                        container.role === 'ingress' && styles.containerRowIngress,
                      ]}
                    >
                      <View style={styles.containerHeader}>
                        <Text style={orgPanelStyles.detailLine}>
                          {containerDisplayName(container)}
                        </Text>
                        <ContainerRoleBadge role={container.role} />
                        <ContainerStatusBadge status={container.status} />
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
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const persistEnvironmentCompose = usePersistEnvironmentCompose(
    orgId,
    environmentId,
  )

  const environmentQuery = useEnvironment(orgId, environmentId)
  const projectQuery = useProject(orgId, projectId)
  const serversQuery = useOrgServers(orgId)
  const servicesQuery = useServices(orgId, environmentId)
  const tlsQuery = useTlsLibrary(orgId)
  const ipsQuery = useIps(orgId, { scope: 'public' })

  const services = servicesQuery.data?.services
  const serviceIds = useMemo(
    () => (services ?? []).map((service) => service.id),
    [services],
  )

  const hostingsQuery = useHostingsByServices(orgId, serviceIds, {
    enabled: serviceIds.length > 0,
  })
  const containersQuery = useContainersByServices(orgId, serviceIds, {
    enabled: serviceIds.length > 0,
  })

  const updateEnvironmentMutation = useUpdateEnvironment(orgId, environmentId)
  const deployEnvironmentMutation = useDeployEnvironment(orgId, environmentId)
  const upsertHostingMutation = useUpsertHosting(orgId)

  const [error, setError] = useState<string | null>(null)
  const [hostingEditors, setHostingEditors] = useState<
    Record<string, HostingEditorState>
  >({})
  const [savingHosting, setSavingHosting] = useState<string | null>(null)
  const [healthCheckPrompt, setHealthCheckPrompt] = useState<{
    services: string[]
    required: boolean
  } | null>(null)
  const [deployStatus, setDeployStatus] = useState<string | null>(null)
  const [trackedEntries, setTrackedEntries] = useState<
    readonly TrackedCommandEntry[]
  >([])
  const [activeDeployCommandId, setActiveDeployCommandId] = useState<
    string | null
  >(null)
  const postDeployRefreshRef = useRef(0)

  const commandsQuery = useCommandsBatch(orgId, trackedEntries)

  const environment = environmentQuery.data?.environment ?? null
  const projectCompose = projectQuery.data?.project.options?.compose ?? null
  const projectDefaultServerId =
    projectQuery.data?.project.options?.defaultServerId ?? null
  const allServers = serversQuery.data?.servers ?? []
  const tlsLibrary = tlsQuery.data?.tls ?? []
  const publicIps = ipsQuery.data?.ips ?? []
  const hostingsByService = hostingsQuery.hostingsByService
  const containersByService = containersQuery.containersByService
  const resolvedServices = services ?? []

  const loading =
    (environmentQuery.isLoading && !environment) ||
    projectQuery.isLoading ||
    serversQuery.isLoading ||
    servicesQuery.isLoading ||
    tlsQuery.isLoading ||
    ipsQuery.isLoading ||
    (serviceIds.length > 0 &&
      (hostingsQuery.isLoading || containersQuery.isLoading))

  const queryError =
    environmentQuery.error ??
    projectQuery.error ??
    serversQuery.error ??
    servicesQuery.error ??
    tlsQuery.error ??
    ipsQuery.error

  useEffect(() => {
    if (queryError) {
      setError(
        queryError instanceof Error
          ? queryError.message
          : 'Failed to load environment',
      )
    }
  }, [queryError])

  // Seed editors once per service id. Return the same state object when
  // nothing is missing so a new hostingsByService identity cannot loop.
  useEffect(() => {
    if (loading) return
    setHostingEditors((current) => {
      let changed = false
      const next = { ...current }
      for (const serviceId of serviceIds) {
        if (serviceId in next) continue
        next[serviceId] = readHostingEditor(hostingsByService[serviceId] ?? [])
        changed = true
      }
      return changed ? next : current
    })
  }, [loading, serviceIds, hostingsByService])

  useEffect(() => {
    if (!commandsQuery.data || trackedEntries.length === 0) return
    for (const [index, record] of commandsQuery.data.entries()) {
      const entry = trackedEntries[index]
      if (entry?.commandId !== activeDeployCommandId) continue
      if (!isTerminalCommandStatus(record.status)) continue

      setDeployStatus(deployStatusMessage(record))
      setActiveDeployCommandId(null)
      setTrackedEntries((current) =>
        current.filter((row) => row.commandId !== entry.commandId),
      )

      if (record.status !== 'succeeded') continue

      const refreshAttempt = ++postDeployRefreshRef.current
      void (async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
          if (postDeployRefreshRef.current !== refreshAttempt) return
          if (attempt > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, 400))
          }
          const [servicesResult] = await Promise.all([
            servicesQuery.refetch(),
            containersQuery.refetchAll(),
            hostingsQuery.refetchAll(),
          ])
          const refreshedServices =
            servicesResult.data?.services ?? servicesQuery.data?.services ?? []
          const hasContainers = refreshedServices.some((service) => {
            const rows = queryClient.getQueryData<{ containers: ContainerRecord[] }>(
              queryKeys.org(orgId).containers.list({ serviceId: service.id }),
            )?.containers
            return (rows?.length ?? 0) > 0
          })
          if (attempt > 0 && hasContainers) break
        }
      })()
    }
  }, [
    activeDeployCommandId,
    commandsQuery.data,
    containersQuery,
    hostingsQuery,
    servicesQuery,
    trackedEntries,
    orgId,
    queryClient,
  ])

  const envServerId = environment?.serverId ?? null
  const placementServerId = envServerId ?? projectDefaultServerId
  const inheritsProjectDefault =
    !envServerId && Boolean(projectDefaultServerId)
  const mergedCompose = useMemo(
    () =>
      withEffectivePlacement(
        mergeComposeOverlay(
          stripComposePlacement(normalizeCompose(projectCompose)),
          environment?.options?.compose,
        ),
        placementServerId,
      ),
    [environment?.options?.compose, projectCompose, placementServerId],
  )
  const serviceNames = useMemo(
    () => composeServiceNames(mergedCompose),
    [mergedCompose],
  )
  const pinnedServer = useMemo(
    () => allServers.find((server) => server.id === placementServerId) ?? null,
    [allServers, placementServerId],
  )
  const deployBlocked =
    deployBlockedReason(
      placementServerId,
      pinnedServer,
      serviceNames.length,
    ) !== null
  const sortedServers = useMemo(
    () =>
      [...allServers].sort((a, b) =>
        (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id),
      ),
    [allServers],
  )

  const savingCompose = persistEnvironmentCompose.isPending
  const savingPlacement = updateEnvironmentMutation.isPending
  const deploying =
    deployEnvironmentMutation.isPending ||
    activeDeployCommandId !== null ||
    trackedEntries.length > 0

  const resetHostingEditorsFromQueries = async () => {
    await Promise.all([hostingsQuery.refetchAll(), servicesQuery.refetch()])
    const editors: Record<string, HostingEditorState> = {}
    for (const service of servicesQuery.data?.services ?? resolvedServices) {
      editors[service.id] = readHostingEditor(
        hostingsQuery.hostingsByService[service.id] ?? [],
      )
    }
    setHostingEditors(editors)
  }

  const saveCompose = async (compose: ComposeDocument) => {
    setError(null)
    const result = await persistEnvironmentCompose.run(compose)
    if (!result.ok) {
      if (persistEnvironmentCompose.actionError) {
        setError(persistEnvironmentCompose.actionError)
      }
      return
    }
    await Promise.all([
      servicesQuery.refetch(),
      containersQuery.refetchAll(),
      hostingsQuery.refetchAll(),
    ])
    await resetHostingEditorsFromQueries()
  }

  const savePlacement = async (serverIdToPin: string) => {
    setError(null)
    const result = await updateEnvironmentMutation.run({
      serverId: serverIdToPin,
    })
    if (!result.ok && updateEnvironmentMutation.actionError) {
      setError(updateEnvironmentMutation.actionError)
    }
  }

  const runDeploy = async (acknowledgeHealthCheckWarnings = false) => {
    const blockedReason = deployBlockedReason(
      placementServerId,
      pinnedServer,
      serviceNames.length,
    )
    if (blockedReason || !placementServerId) {
      setDeployStatus(
        blockedReason ??
          'Select a server for this environment before deploying.',
      )
      return
    }
    setDeployStatus('Queueing deployment…')
    setError(null)
    try {
      const result = await deployEnvironmentMutation.mutateAsync({
        ...(acknowledgeHealthCheckWarnings
          ? { acknowledgeHealthCheckWarnings: true }
          : {}),
      })
      setHealthCheckPrompt(null)
      setActiveDeployCommandId(result.commandId)
      setTrackedEntries([
        {
          serverId: placementServerId,
          commandId: result.commandId,
        },
      ])
      setDeployStatus('Deploying…')
    } catch (err) {
      if (err instanceof DeployHealthCheckMissingError) {
        setHealthCheckPrompt({
          services: err.services,
          required: err.required,
        })
        setDeployStatus(
          err.required
            ? 'Deploy blocked — add healthchecks to required services.'
            : 'Confirm deploy without healthchecks.',
        )
        return
      }
      setDeployStatus(deployErrorMessage(err))
    }
  }

  const deploy = async () => {
    await runDeploy(false)
  }

  const saveHosting = async (composeServiceName: string) => {
    setSavingHosting(composeServiceName)
    setError(null)
    try {
      const service = resolvedServices.find(
        (item) => item.composeServiceName === composeServiceName,
      )
      if (!service) {
        setError('Save the compose document first.')
        return
      }
      const editor = hostingEditors[service.id] ?? readHostingEditor([])
      const existing = hostingsByService[service.id]?.[0]
      const options = buildHostingOptions(editor)
      const body = {
        displayName: composeServiceName,
        metadata: { composeServiceName },
        options,
        tlsId: editor.tlsId,
        ipId: editor.ipId,
      }
      const result = await upsertHostingMutation.run({
        serviceId: service.id,
        ...(existing ? { hostingId: existing.id } : {}),
        body,
      })
      if (!result.ok) {
        if (upsertHostingMutation.actionError) {
          setError(upsertHostingMutation.actionError)
        }
        return
      }
      await Promise.all([
        servicesQuery.refetch(),
        hostingsQuery.refetchAll(),
        containersQuery.refetchAll(),
      ])
      const refreshedHostings =
        hostingsQuery.hostingsByService[service.id] ?? []
      setHostingEditors((current) => ({
        ...current,
        [service.id]: readHostingEditor(refreshedHostings),
      }))
    } finally {
      setSavingHosting(null)
    }
  }

  const updateServiceInCache = (nextService: ServiceRecord) => {
    queryClient.setQueryData(
      queryKeys.org(orgId).services.list(environmentId),
      (current: { services: ServiceRecord[] } | undefined) => {
        if (!current) return current
        return {
          services: upsertServiceById(current.services, nextService),
        }
      },
    )
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
          orgId={orgId}
          mergedCompose={mergedCompose}
          serviceNames={serviceNames}
          allServers={allServers}
          sortedServers={sortedServers}
          placementServerId={placementServerId}
          pinnedServer={pinnedServer}
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
          inheritsProjectDefault={inheritsProjectDefault}
          services={resolvedServices}
          onServiceChange={updateServiceInCache}
          hostingEditors={hostingEditors}
          setHostingEditors={setHostingEditors}
          hostingsByService={hostingsByService}
          tlsLibrary={tlsLibrary}
          publicIps={publicIps}
          savingHosting={savingHosting}
          onSaveHosting={(composeServiceName) => {
            saveHosting(composeServiceName).catch(() => {
              // Errors are surfaced via setError.
            })
          }}
          containersByService={containersByService}
          canManage={canManage}
          showEnvironmentPanel={!embedded}
        />
      ) : null}

      {healthCheckPrompt ? (
        <HealthCheckAckModal
          services={healthCheckPrompt.services}
          required={healthCheckPrompt.required}
          deploying={deploying}
          onCancel={() => setHealthCheckPrompt(null)}
          onConfirm={() => {
            runDeploy(true).catch(() => {
              // Errors are surfaced via deployStatus.
            })
          }}
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
  serverOptionSelected: { borderColor: chrome.accent, backgroundColor: chrome.bgActive },
  serverOptionDisabled: { opacity: 0.6 },
  serverOptionText: { color: colors.text, fontSize: 13, fontFamily: 'monospace' },
  serverOptionTextDisabled: { color: colors.textMuted },
  deployButton: {
    alignSelf: 'flex-start',
    backgroundColor: chrome.accent,
    borderRadius: 8,
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deployButtonText: { color: chrome.onAccent, fontSize: 14, fontWeight: '700' },
  hostingList: { gap: spacing.sm },
  hostingTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  serviceKindBadge: {
    color: colors.command,
    fontSize: 11,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  staleFieldWarn: {
    color: colors.pending,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: spacing.xs,
  },
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
  webEnvInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  tlsLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  tlsHint: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
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
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  tlsChipText: {
    color: colors.textChip,
    fontSize: 12,
  },
  saveHostingButton: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: chrome.accent,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  saveHostingButtonText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
  containerList: { gap: spacing.sm },
  containerRow: { gap: spacing.xs, marginTop: spacing.sm },
  containerRowIngress: {
    marginLeft: spacing.md,
    paddingLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderArea,
  },
  containerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  proxyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  proxyCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proxyCheckboxChecked: {
    borderColor: chrome.accent,
    backgroundColor: colors.bgActive,
  },
  proxyCheckboxMark: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  proxyToggleLabel: {
    color: colors.textBody,
    fontSize: 13,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalServices: {
    color: colors.command,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalPrimaryButton: {
    borderRadius: 8,
    backgroundColor: chrome.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalPrimaryText: {
    color: chrome.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  modalSecondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalSecondaryText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
})
