import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { HeaderChevron } from '@/components/header-chevron'
import {
  Badge,
  Button,
  ButtonRow,
  Checkbox,
  EmptyState,
  LoadingState,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import {
  HostingCertificateActionsContext,
  HostingCertificatePanel,
} from '@/components/org/hosting-certificate-panel'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import { usePersistEnvironmentCompose } from '@/components/org/compose-persistence'
import {
  PreviewDeploymentModal,
  type ComposePreviewMode,
  type PreviewDeploymentPurpose,
} from '@/components/org/project/preview-deployment-modal'
import { ContainerLogTail } from '@/components/org/logs/container-log-tail'
import {
  ContainerRoleBadge,
  ContainerStatusBadge,
} from '@/components/org/managed/container-status-badge'
import { ServiceSettingsPanel } from '@/components/org/service-settings-panel'
import { StorageSection } from '@/components/org/storage-section'
import { panelStyles } from '@/components/ui/panel-styles'
import { Section } from '@/components/ui/v4/section'
import { VariablesSection } from '@/components/org/variables-section'
import {
  DeployHealthCheckMissingError,
  type CommandStatusRecord,
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
  commandStatusById,
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
import { commandErrorLine } from '@/lib/command-error'
import { useProject } from '@/lib/queries/projects'
import { useOrgServers } from '@/lib/queries/servers'
import {
  useHostingsByServices,
  useReleaseHostingFromCompose,
  useServices,
  useUpsertHosting,
} from '@/lib/queries/services'
import { useTlsLibrary } from '@/lib/queries/tls'
import { useIps } from '@/lib/queries/topology'
import {
  type HostingWwwMode,
  effectiveWwwMode,
  initialWwwChoice,
  wwwChoiceFromComposeEntry,
  wwwChoiceOptions,
  wwwDnsHint,
  wwwHostnames,
  wwwOptionForSave,
  wwwResultLines,
  wwwUnavailableReason,
} from '@/lib/hosting-www'
import {
  type PinnedCertificateGap,
  coveringCertificates,
  pinnedCertificateGap,
} from '@/lib/hosting-tls-picker'
import {
  composeHostingEntryFromEditorFields,
  findComposeHostingEntryIndex,
  hostingBindScopeOf,
  hostingDockerBridgeHint,
  hostingEntryKey,
  hostingPathPrefixHint,
  hostingServiceKindLabel,
  hostingTargetPortAuthorable,
  hostingTargetPortHint,
  hostingWebEnvSectionCopy,
  mergeComposeOverlay,
  normalizeCompose,
  parseHostnameList,
  readComposeHostingEntries,
  resolveHostingServiceContext,
  shouldRevealOptionalHostingFields,
  stripComposePlacement,
  writeComposeHostingEntries,
  type ComposeHostingExtensionEntry,
  type ComposeServiceKind,
  type HostingServiceContext,
} from '@/lib/compose'
import {
  isAdoptedComposeHosting,
  isComposeOwnedHosting,
  readHostingComposeRoute,
} from '@/lib/hosting-compose-owner'
import {
  certificateChoiceText,
  certificateLabel as tlsLabel,
  COMPOSE_CERTIFICATE_HINT,
  COMPOSE_HOSTNAME_HINT,
  COMPOSE_PROXY_NOTE,
  type ConfiguredHostingState,
  EMPTY_COMPOSE_HOSTNAME_MESSAGE,
  hostingActionErrorMessage,
  missingCertificateMessage,
  panelCertificateHint,
  pendingRemovalNote,
  resolveCertificateRef,
  SERVICE_NOT_SAVED_MESSAGE,
  SHARED_FILE_HOSTNAME_MESSAGE,
} from '@/lib/hosting-plain-words'
import {
  composeRowsAwaitingRemoval,
  configuredHostingState,
  findPanelRowForRoute,
  moveComposeHostnameToPanel,
  panelCertificateForMovedRoute,
  panelRowsBesideDeclarations,
  withoutComposeHostingRoute,
} from '@/lib/hosting-compose-move'
import { ComposeHostnameActions } from '@/components/org/project/compose-hostname-actions'
import { COMPOSE_HOSTING_FOCUS_PARAM } from '@/components/org/compose-hosting-readonly'
import { projectComposeHref, projectEnvironmentComposeHref } from '@/lib/project-navigation'
import { hostPickerLabel, pickHostKey } from '@/lib/hosting-host-label'
import { HostingHostPicker } from '@/components/org/project/hosting-host-picker'
import { chrome, colors, layout, spacing, webPointer } from '@/lib/theme'
import { deployErrorMessage } from '@/lib/deploy-error-message'
import { orEmptyArray } from '@/lib/or-empty-array'
import { useCan } from '@/lib/query-client'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { offersLetsEncrypt } from '@/lib/hosting-letsencrypt-choice'
import {
  certificateAfterSave,
  hostingSaveNote,
  withCertificateRefusal,
  type HostingSaveNote,
  type LetsEncryptRefusal,
} from '@/lib/hosting-certificate'
import { RemovedServiceCard } from '@/components/org/removed-service-card'
import { containerCardServices, removedFromComposeServiceIds } from '@/lib/directory-names'
import { useEnvironmentFolders } from '@/lib/queries/folders'
import { useRequestLetsEncrypt } from '@/lib/queries/hosting-certificate'
import { failedRunMessage, userErrorMessage } from '@/lib/user-error'
import { useLeaveWarning } from '@/components/ui/use-leave-warning'
import { useSyncedEditors } from '@/components/org/use-synced-editors'

type HostingBind = 'public' | 'datacenter' | 'local'
type HostingProtocol = 'http' | 'tcp' | 'udp'

type HostingEditorState = {
  hostnames: string
  tlsId: string | null
  /** A compose route's Let’s Encrypt choice (`tls.mode: automatic`); always false on a panel hosting. */
  tlsAutomatic: boolean
  ipId: string | null
  bind: HostingBind
  forceHttps: boolean
  /**
   * The www choice; null while a new hosting has none saved or picked, which
   * means "the default for the typed name" (`effectiveWwwMode`).
   */
  www: HostingWwwMode | null
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
  /**
   * Ask for a free Let's Encrypt certificate as part of this save. On for a
   * hosting that does not exist yet, off for one that does (it has the
   * Certificate section for that).
   */
  getLetsEncrypt: boolean
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
} {
  // `web.php` is deliberately not read: PHP config lives on the compose
  // service now. A stale value on an old hosting row is inert.
  return { webEnvLines: formatWebEnvLines(optionsRecord?.web) }
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

/** Exported for its tests. */
export function readHostingEditor(hostings: HostingRecord[]): HostingEditorState {
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
    www: initialWwwChoice(optionsRecord),
    gzip: proxy?.gzip !== false,
    brotli: proxy?.brotli === true,
    stripPrefix: typeof proxy?.stripPrefix === 'string' ? proxy.stripPrefix : '',
    pathPrefix,
    targetPort,
    protocol: readHostingProtocol(optionsRecord),
    ports: formatHostingPorts(optionsRecord),
    ...readWebOptions(optionsRecord),
    getLetsEncrypt: hostings.length === 0,
    tlsAutomatic: false,
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
  const www = wwwOptionForSave(editor.www, editor.hostnames)
  if (www) options.www = www
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
  if (staticEnv) {
    options.web = { env: staticEnv }
  }
  return options
}

/**
 * How one rendered hosting row is authored, and therefore where a save goes.
 *
 * `panel` rows are the historical case: one `hosting` row an operator created
 * here, saved with `PUT`/`PATCH /hostings`. `compose` rows are declared by
 * `services.<name>.x-turbopanel.hosting[]` and are **read-only through that
 * API** (`409 hosting_owned_by_compose`), so their save writes the compose
 * document instead — one row per authored entry, never
 * `hostingsByService[serviceId][0]`, which would hide every route after the
 * first.
 */
type HostingRowSource =
  | { kind: 'panel' }
  /**
   * A hosting the last deploy made from the file whose entry has left it: the
   * next deploy removes it (or hands it back to this screen). Read-only until
   * then, with a note saying so.
   */
  | { kind: 'removing'; handedBack: boolean }
  | {
    kind: 'compose'
    /** {@link hostingEntryKey} of the declaration this row renders. */
    route: string
    /**
     * Index in the **environment overlay's** entry list, or null when the
     * route is inherited from the project compose.
     *
     * Only the overlay is editable from this surface. `hosting` is a plain
     * compose sequence, so an overlay list is appended to the project's rather
     * than merged entry-by-entry — writing an inherited route here would add a
     * second declaration, not change the one on screen.
     */
    overlayIndex: number | null
    /** The entry itself, for the readable summary and the exact configuration. */
    entry: ComposeHostingExtensionEntry
    /** Where its hosting stands, which decides what the two actions do and say. */
    state: ConfiguredHostingState
  }

type HostingPanelRowDescriptor = {
  /** Key into `hostingEditors`, and the row's React key. */
  editorKey: string
  composeServiceName: string
  serviceContext: HostingServiceContext
  source: HostingRowSource
  /** Persisted row id, when one exists yet. */
  hostingId: string | null
  /** Editor state seeded from whichever document/row authored the route. */
  seed: HostingEditorState
}

/** A problem with one hosting row, shown next to the control that caused it. */
type HostingRowError = {
  field: 'hostname' | 'save' | 'actions'
  message: string
}

/** What a row needs beyond saving: its last problem, the two moves, and where its file is. */
type HostingRowActions = {
  /** By `editorKey`. */
  rowErrors: Readonly<Record<string, HostingRowError>>
  /** What the last save of a row said when it went through, by `editorKey`. */
  savedNotes: Readonly<Record<string, HostingSaveNote>>
  /** The Compose editor for this environment's own file. */
  environmentComposeHref: string
  /** The Compose editor for the project's shared file (the Base tab). */
  baseComposeHref: string
  onRemoveHostname: (row: HostingPanelRowDescriptor) => void
  onManageHere: (row: HostingPanelRowDescriptor) => void
}

function rowErrorFor(
  error: HostingRowError | undefined,
  field: HostingRowError['field'],
): string | null {
  return error?.field === field ? error.message : null
}

/** The Compose editor link for a configured row, opened at its service. */
function composeEditorHrefFor(
  row: HostingPanelRowDescriptor,
  actions: HostingRowActions,
): string | null {
  if (row.source.kind !== 'compose') return null
  if (row.source.overlayIndex === null) return actions.baseComposeHref
  const query = new URLSearchParams({ [COMPOSE_HOSTING_FOCUS_PARAM]: row.composeServiceName })
  return `${actions.environmentComposeHref}?${query.toString()}`
}

/** True when this surface can actually author the row's declaration. */
function isEditableRow(row: HostingPanelRowDescriptor): boolean {
  if (row.source.kind === 'panel') return true
  return row.source.kind === 'compose' && row.source.overlayIndex !== null
}

/** The note on a row waiting for the next deploy to remove it, or null. */
function removalNoteFor(row: HostingPanelRowDescriptor): string | null {
  return row.source.kind === 'removing' ? pendingRemovalNote(row.source.handedBack) : null
}

/** The compose-owned `hosting` row for one declared route, when deploy made it. */
function findComposeOwnedRow(
  rows: readonly HostingRecord[],
  route: string,
): HostingRecord | undefined {
  return rows.find((row) => readHostingComposeRoute(row.metadata) === route)
}

/**
 * Editor state for one declared route.
 *
 * Compose-authored fields come from the entry — it is the truth, and the row
 * may not exist yet (nothing is materialized until the first deploy). The
 * panel-only fields (proxy toggles, web env, raw tcp/udp) come from the row
 * when there is one: they have no compose spelling, are preserved across every
 * reconcile, and are shown read-only so an operator can see what is stored.
 */
function readComposeHostingEditor(
  entry: ComposeHostingExtensionEntry,
  row: HostingRecord | undefined,
): HostingEditorState {
  const base = readHostingEditor(row ? [row] : [])
  return {
    ...base,
    protocol: 'http',
    hostnames: entry.hostname,
    pathPrefix: entry.pathPrefix ?? '',
    targetPort: entry.targetPort === undefined ? '' : String(entry.targetPort),
    forceHttps: entry.forceHttps !== false,
    www: wwwChoiceFromComposeEntry(entry),
    bind: hostingBindScopeOf(entry),
    ipId: entry.bind?.ipRef ?? null,
    tlsId: entry.tls?.mode === 'certificate'
      ? entry.tls.certificateRef ?? null
      : null,
    tlsAutomatic: entry.tls?.mode === 'automatic',
    // Compose sets the certificate for a route it declares.
    getLetsEncrypt: false,
  }
}

/**
 * The entry to write back for one edited compose row.
 *
 * The rule itself lives in `@/lib/compose` so it can be pinned by a test — a
 * write path into a compose document that only exists inside a screen is a
 * write path nothing can assert on. This wrapper is only the screen's half:
 * turning the resolved service context into the `serviceKind` the rule asks
 * for.
 */
function composeHostingEntryFromEditor(
  editor: HostingEditorState,
  serviceContext: HostingServiceContext,
): ComposeHostingExtensionEntry | null {
  // Save the choice that applies, never one the names leave no room for.
  return composeHostingEntryFromEditorFields(
    { ...editor, www: wwwOptionForSave(editor.www, editor.hostnames) ?? null },
    composeServiceKindOf(serviceContext),
  )
}

/**
 * `serviceKind` as the hosting rules read it.
 *
 * The context now names all three kinds, so this is a passthrough rather than
 * the narrowing it used to be. It kept the function because the *reason* is
 * worth a name: every hosting rule keyed off a service kind reads it here, and
 * folding `node` into `container` is exactly what let the editor offer — and
 * write — a `targetPort` the control plane refuses on a native app.
 */
function composeServiceKindOf(
  serviceContext: HostingServiceContext,
): ComposeServiceKind {
  return serviceContext.kind
}

/** What every row of one service shares while its descriptors are built. */
type ServiceRowContext = {
  serviceKey: string
  composeServiceName: string
  serviceContext: HostingServiceContext
  serviceRows: readonly HostingRecord[]
}

/** A panel-authored row, keyed by `editorKey`. */
function panelRowDescriptor(
  ctx: ServiceRowContext,
  editorKey: string,
  row: HostingRecord | undefined,
): HostingPanelRowDescriptor {
  return {
    editorKey,
    composeServiceName: ctx.composeServiceName,
    serviceContext: ctx.serviceContext,
    source: { kind: 'panel' },
    hostingId: row?.id ?? null,
    seed: readHostingEditor(row ? [row] : []),
  }
}

/** A row made from the file whose entry has left it, keyed apart from the rest. */
function removingRowDescriptor(
  ctx: ServiceRowContext,
  row: HostingRecord,
): HostingPanelRowDescriptor {
  return {
    editorKey: `${ctx.serviceKey}::removing::${row.id}`,
    composeServiceName: ctx.composeServiceName,
    serviceContext: ctx.serviceContext,
    source: { kind: 'removing', handedBack: isAdoptedComposeHosting(row.metadata) },
    hostingId: row.id,
    seed: readHostingEditor([row]),
  }
}

/**
 * One configured entry. With no row made from the file, a panel row on the
 * same route is the one the next deploy would adopt (a move that could not
 * drop the entry), so the entry uses it.
 */
function composeEntryDescriptor(
  ctx: ServiceRowContext,
  entry: ComposeHostingExtensionEntry,
  overlayEntries: readonly ComposeHostingExtensionEntry[],
): HostingPanelRowDescriptor {
  const route = hostingEntryKey(entry)
  const overlayIndex = findComposeHostingEntryIndex(overlayEntries, route)
  const composeOwnedRow = findComposeOwnedRow(ctx.serviceRows, route)
  const panelRow = composeOwnedRow ? undefined : findPanelRowForRoute(ctx.serviceRows, route)
  const row = composeOwnedRow ?? panelRow
  return {
    editorKey: `${ctx.serviceKey}::${route}`,
    composeServiceName: ctx.composeServiceName,
    serviceContext: ctx.serviceContext,
    source: {
      kind: 'compose',
      route,
      overlayIndex: overlayIndex === -1 ? null : overlayIndex,
      entry,
      state: configuredHostingState(composeOwnedRow, panelRow),
    },
    hostingId: row?.id ?? null,
    seed: readComposeHostingEditor(entry, row),
  }
}

/** Every row one service renders. */
function serviceRowDescriptors(
  ctx: ServiceRowContext,
  overlayCompose: ComposeDocument,
): HostingPanelRowDescriptor[] {
  const entries = ctx.serviceContext.composeHostingEntries
  // Rows made from the file whose entry is gone wait for the next deploy.
  const removing = composeRowsAwaitingRemoval(ctx.serviceRows, entries).map((row) =>
    removingRowDescriptor(ctx, row),
  )
  if (entries.length === 0) {
    // No declaration: the historical single-row panel form, still saved
    // straight to /hostings. A row made from the file is only here when its
    // entry was removed, and shows as such rather than as an editable form.
    const panelRow = ctx.serviceRows.find((row) => !isComposeOwnedHosting(row.metadata))
    if (!panelRow && removing.length > 0) return removing
    return [panelRowDescriptor(ctx, ctx.serviceKey, panelRow), ...removing]
  }
  const overlayEntries = readComposeHostingEntries(overlayCompose, ctx.composeServiceName)
  return [
    ...entries.map((entry) => composeEntryDescriptor(ctx, entry, overlayEntries)),
    // A hostname moved out of the file sits next to the entries still in it.
    ...panelRowsBesideDeclarations(ctx.serviceRows, entries).map((row) =>
      panelRowDescriptor(ctx, `${ctx.serviceKey}::panel::${row.id}`, row),
    ),
    ...removing,
  ]
}

/**
 * One descriptor per rendered row: every declared compose route on a service,
 * or the single panel row when compose declares none. Exported for its tests.
 */
export function buildHostingPanelRows(params: {
  serviceNames: readonly string[]
  services: readonly ServiceRecord[]
  mergedCompose: ComposeDocument
  overlayCompose: ComposeDocument
  hostingsByService: Record<string, HostingRecord[]>
}): HostingPanelRowDescriptor[] {
  return params.serviceNames.flatMap((composeServiceName) => {
    const service = params.services.find(
      (item) => item.composeServiceName === composeServiceName,
    )
    return serviceRowDescriptors(
      {
        serviceKey: service?.id ?? composeServiceName,
        composeServiceName,
        serviceContext: resolveHostingServiceContext(params.mergedCompose, composeServiceName),
        serviceRows: service ? params.hostingsByService[service.id] ?? [] : [],
      },
      params.overlayCompose,
    )
  })
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
  return server.name?.trim() || server.hostname || server.id
}

function serverOptionLabel(server: OrgServerRecord): string {
  const base = serverLabel(server)
  return server.connected ? base : `${base} (offline)`
}

function containerDisplayName(container: ContainerRecord): string {
  return container.containerName || container.composeServiceName || container.id
}

/**
 * Service rows first (existing ordinal order), then tenant Traefik `-in`
 * ingress rows. The ingress partition does not cover ProxySQL — that row
 * lives on the `managed-ingress` system service.
 */
function partitionContainersForDisplay(
  containers: ContainerRecord[],
): ContainerRecord[] {
  const serviceRows = containers.filter((row) => row.role !== 'ingress')
  const ingressRows = containers.filter((row) => row.role === 'ingress')
  return [...serviceRows, ...ingressRows]
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

function deployStatusMessage(command: CommandStatusRecord): string {
  if (command.status === 'succeeded') {
    return 'Deployment completed.'
  }
  return commandErrorLine(command) ?? `Deployment ${command.status}.`
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

function HostingWebEnvFields({
  serviceContext,
  editor,
  onChange,
  disabled = false,
}: Readonly<{
  serviceContext: HostingServiceContext
  editor: HostingEditorState
  onChange: (patch: Partial<HostingEditorState>) => void
  /** Read-only on a compose-owned row: `web.env` has no compose spelling. */
  disabled?: boolean
}>) {
  const webEnvCopy = hostingWebEnvSectionCopy(serviceContext)
  const hasWebEnvValues = editor.webEnvLines.trim().length > 0
  const showWebEnvFields = shouldRevealOptionalHostingFields(
    webEnvCopy.showFields,
    hasWebEnvValues,
  )

  return (
    <>
      {!showWebEnvFields ? (
        <>
          <Text style={styles.fieldLabel}>{webEnvCopy.title}</Text>
          <Text style={panelStyles.muted}>{webEnvCopy.hint}</Text>
        </>
      ) : (
        <>
          {!webEnvCopy.showFields && hasWebEnvValues ? (
            <Text style={styles.staleFieldWarn}>
              Stored values are ignored for this service kind — clear them
              before save if you no longer need them.
            </Text>
          ) : null}
          <TextField
            label={webEnvCopy.title}
            hint={webEnvCopy.hint}
            value={editor.webEnvLines}
            editable={!disabled}
            onChangeText={(value) => onChange({ webEnvLines: value })}
            placeholder={'APP_ENV=production\n# comments allowed'}
            mono
            autoCapitalize="none"
            multiline
          />
        </>
      )}

      {/*
        PHP moved to the compose service's `x-turbopanel.php` (Services tab).
        It could never work here: an FPM pool is keyed by (environment, compose
        service), so several hostings on one service silently last-wins merged
        into a single pool. Leaving the fields would let an operator set a
        memory limit that never reaches the host.
      */}
      <Text style={styles.fieldLabel}>PHP</Text>
      <Text style={panelStyles.muted}>
        PHP version, limits, and extensions are configured on the service
        itself, under Services — one PHP worker pool belongs to one service,
        not to each hostname pointed at it.
      </Text>
    </>
  )
}

/** The "Self-signed" / "Any interface" option of a picker whose saved value is null. */
const NO_CHOICE = ''
/** The compose picker's Let’s Encrypt chip; never a certificate id. */
const AUTOMATIC_CHOICE = '__automatic__'

function hostingTlsSummary(
  editor: Pick<HostingEditorState, 'tlsAutomatic'>,
  tlsRow: TlsRecord | undefined,
): string {
  if (editor.tlsAutomatic) return 'Let’s Encrypt'
  return tlsRow ? tlsLabel(tlsRow) : 'Self-signed'
}

/** The picker value for the editor's choice, and the editor patch for a picked value. */
function tlsPickerValue(editor: Pick<HostingEditorState, 'tlsId' | 'tlsAutomatic'>): string {
  if (editor.tlsAutomatic) return AUTOMATIC_CHOICE
  return editor.tlsId ?? NO_CHOICE
}

function tlsPickerPatch(value: string): Pick<HostingEditorState, 'tlsId' | 'tlsAutomatic'> {
  if (value === AUTOMATIC_CHOICE) return { tlsId: null, tlsAutomatic: true }
  return { tlsId: value === NO_CHOICE ? null : value, tlsAutomatic: false }
}

const HOSTING_BIND_LABELS: Record<HostingBind, string> = {
  public: 'Public',
  datacenter: 'Datacenter',
  local: 'Local',
}

/** One-line collapsed summary: hostnames/ports + port + TLS mode + bind. */
function hostingRowSummary(
  editor: HostingEditorState,
  tlsOptions: TlsRecord[],
): string {
  const bindLabel = HOSTING_BIND_LABELS[editor.bind]
  if (editor.protocol !== 'http') {
    return [
      editor.protocol === 'tcp' ? 'TCP' : 'UDP',
      editor.ports.trim() || 'no ports',
      bindLabel,
    ].join(' · ')
  }
  const tlsRow = resolveCertificateRef(editor.tlsId ?? undefined, tlsOptions)
  const parts = [
    editor.hostnames.trim() || 'no hostnames',
    editor.targetPort.trim() ? `port ${editor.targetPort.trim()}` : null,
    hostingTlsSummary(editor, tlsRow),
    bindLabel,
  ]
  return parts.filter(Boolean).join(' · ')
}

function HostingHintText({ hint }: Readonly<{ hint: string | null }>) {
  if (!hint) return null
  return <Text style={styles.tlsHint}>{hint}</Text>
}

function HostingProtocolPicker({
  composeOwned,
  editor,
  disabled,
  onChange,
}: Readonly<{
  composeOwned: boolean
  editor: HostingEditorState
  disabled: boolean
  onChange: (patch: Partial<HostingEditorState>) => void
}>) {
  if (composeOwned) return null
  return (
    <>
      <Text style={styles.tlsLabel}>Protocol</Text>
      <Text style={styles.tlsHint}>
        HTTP: TurboPanel&apos;s proxy serves this hostname with a certificate. TCP/UDP: opens a raw
        port, with no hostname (databases, game servers, relays).
      </Text>
      <SegmentedControl
        accessibilityLabel="Protocol"
        options={[
          { value: 'http', label: 'HTTP' },
          { value: 'tcp', label: 'TCP' },
          { value: 'udp', label: 'UDP' },
        ]}
        value={editor.protocol}
        disabled={disabled}
        onChange={(protocol) => onChange({ protocol })}
      />
    </>
  )
}

function HostingAddressField({
  isHttp,
  composeOwned,
  editor,
  locked,
  error,
  onChange,
}: Readonly<{
  isHttp: boolean
  composeOwned: boolean
  editor: HostingEditorState
  locked: boolean
  /** A problem with what was typed, shown under the field. */
  error: string | null
  onChange: (patch: Partial<HostingEditorState>) => void
}>) {
  if (!isHttp) {
    return (
      <TextField
        label="Ports"
        hint={
          'Comma-separated published[:target] pairs. Target defaults to published when omitted (e.g. "5432, 8443:8080").'
        }
        value={editor.ports}
        error={error}
        onChangeText={(value) => onChange({ ports: value })}
        placeholder="5432, 8443:8080"
        mono
        autoCapitalize="none"
      />
    )
  }
  return (
    <TextField
      label={composeOwned ? 'Hostname' : 'Hostnames'}
      hint={composeOwned ? COMPOSE_HOSTNAME_HINT : undefined}
      value={editor.hostnames}
      error={error}
      editable={!locked}
      onChangeText={(value) => onChange({ hostnames: value })}
      placeholder="app.example.com"
      mono
      autoCapitalize="none"
    />
  )
}

/**
 * The www choice for the hostname(s): four options named with the real names,
 * the resulting redirect underneath, and a DNS reminder for any name it adds.
 * Shown wherever a hostname is edited, compose route or panel hosting alike.
 */
function HostingWwwField({
  isHttp,
  editor,
  locked,
  onChange,
}: Readonly<{
  isHttp: boolean
  editor: HostingEditorState
  locked: boolean
  onChange: (patch: Partial<HostingEditorState>) => void
}>) {
  const hostnames = wwwHostnames(editor.hostnames)
  if (!isHttp || hostnames.length === 0) return null
  const mode = effectiveWwwMode(editor.www, hostnames)
  const dnsHint = wwwDnsHint(hostnames, mode)
  const unavailable = wwwUnavailableReason(hostnames)
  return (
    <>
      <Text style={styles.tlsLabel}>www</Text>
      <SegmentedControl
        options={wwwChoiceOptions(hostnames)}
        value={mode}
        onChange={(www) => onChange({ www })}
        disabled={locked}
        accessibilityLabel="What happens to the www name"
      />
      {wwwResultLines(hostnames, mode).map((line) => (
        <Text key={line} style={styles.wwwResult}>
          {line}
        </Text>
      ))}
      <HostingHintText hint={unavailable ?? dnsHint} />
    </>
  )
}

function HostingTlsPicker({
  isHttp,
  composeOwned,
  editor,
  covering,
  pinnedGap,
  locked,
  onChange,
}: Readonly<{
  isHttp: boolean
  composeOwned: boolean
  editor: HostingEditorState
  covering: TlsRecord[]
  /** A pinned certificate that no longer covers the names: still shown, with a note. */
  pinnedGap: PinnedCertificateGap<TlsRecord> | null
  locked: boolean
  onChange: (patch: Partial<HostingEditorState>) => void
}>) {
  if (!isHttp) return null
  const chips = pinnedGap ? [...covering, pinnedGap.row] : covering
  const picked = resolveCertificateRef(editor.tlsId ?? undefined, chips)
  const letsEncryptBoxShown = offersLetsEncrypt({
    composeOwned,
    protocol: editor.protocol,
    tlsId: editor.tlsId,
    hostnameCount: parseHostnameList(editor.hostnames).length,
  })
  return (
    <>
      <Text style={styles.tlsLabel}>Certificate</Text>
      <Text style={styles.tlsHint}>
        {composeOwned ? COMPOSE_CERTIFICATE_HINT : panelCertificateHint(letsEncryptBoxShown)}
      </Text>
      <SegmentedControl
        accessibilityLabel="Certificate"
        options={[
          ...(composeOwned
            ? [{ value: AUTOMATIC_CHOICE, label: 'Let\u2019s Encrypt' }]
            : []),
          { value: NO_CHOICE, label: 'Self-signed' },
          ...chips.map((row) => ({ value: row.id, label: tlsLabel(row) })),
        ]}
        value={tlsPickerValue(editor)}
        disabled={locked}
        onChange={(value) => onChange(tlsPickerPatch(value))}
      />
      <Text style={styles.wwwResult}>
        {`Certificate: ${certificateChoiceText({
          automatic: editor.tlsAutomatic,
          certificate: picked,
        })}`}
      </Text>
      <HostingHintText hint={pinnedGap?.note ?? null} />
      {letsEncryptBoxShown ? (
        <Checkbox
          label="Get a free Let’s Encrypt certificate when I save"
          checked={editor.getLetsEncrypt}
          disabled={locked}
          onPress={() => onChange({ getLetsEncrypt: !editor.getLetsEncrypt })}
        />
      ) : null}
    </>
  )
}

function HostingBindPicker({
  editor,
  locked,
  onChange,
}: Readonly<{
  editor: HostingEditorState
  locked: boolean
  onChange: (patch: Partial<HostingEditorState>) => void
}>) {
  return (
    <>
      <Text style={styles.tlsLabel}>Bind</Text>
      <Text style={styles.tlsHint}>
        Public — reachable on the internet. Datacenter — private network only.
        Local — this server only (127.x).
      </Text>
      <SegmentedControl
        accessibilityLabel="Bind"
        options={[
          { value: 'public', label: 'Public' },
          { value: 'datacenter', label: 'Datacenter' },
          { value: 'local', label: 'Local' },
        ]}
        value={editor.bind}
        disabled={locked}
        onChange={(bind) => onChange({ bind, ...(bind === 'public' ? {} : { ipId: null }) })}
      />
    </>
  )
}

function HostingPublicIpPicker({
  editor,
  publicIps,
  locked,
  onChange,
}: Readonly<{
  editor: HostingEditorState
  publicIps: IpRecord[]
  locked: boolean
  onChange: (patch: Partial<HostingEditorState>) => void
}>) {
  if (editor.bind !== 'public') return null
  return (
    <>
      <Text style={styles.tlsLabel}>Public IP</Text>
      <Text style={styles.tlsHint}>
        Pin a managed public address, or leave Any interface for the server
        to choose.
      </Text>
      <SegmentedControl
        accessibilityLabel="Public IP"
        options={[
          { value: NO_CHOICE, label: 'Any interface' },
          ...publicIps.map((ip) => ({ value: ip.id, label: ip.address })),
        ]}
        value={editor.ipId ?? NO_CHOICE}
        disabled={locked}
        onChange={(id) => onChange({ ipId: id === NO_CHOICE ? null : id })}
      />
    </>
  )
}

function HostingProxyFields({
  isHttp,
  composeOwned,
  serviceContext,
  editor,
  locked,
  panelFieldsLocked,
  targetPortAuthorable,
  targetPortHint,
  onChange,
}: Readonly<{
  isHttp: boolean
  composeOwned: boolean
  serviceContext: HostingServiceContext
  editor: HostingEditorState
  locked: boolean
  panelFieldsLocked: boolean
  targetPortAuthorable: boolean
  targetPortHint: string
  onChange: (patch: Partial<HostingEditorState>) => void
}>) {
  if (!isHttp) return null
  return (
    <>
      <Text style={styles.tlsLabel}>Proxy</Text>
      {composeOwned ? (
        <Text style={styles.tlsHint}>{COMPOSE_PROXY_NOTE}</Text>
      ) : null}
      <Checkbox
        label="Force HTTPS"
        checked={editor.forceHttps}
        disabled={locked}
        onPress={() => onChange({ forceHttps: !editor.forceHttps })}
      />
      <Checkbox
        label="Gzip"
        checked={editor.gzip}
        disabled={panelFieldsLocked}
        onPress={() => onChange({ gzip: !editor.gzip })}
      />
      <Checkbox
        label="Brotli"
        checked={editor.brotli}
        disabled={panelFieldsLocked}
        onPress={() => onChange({ brotli: !editor.brotli })}
      />

      <TextField
        label="Strip prefix"
        value={editor.stripPrefix}
        editable={!panelFieldsLocked}
        onChangeText={(value) => onChange({ stripPrefix: value })}
        placeholder="/api"
        mono
        autoCapitalize="none"
      />
      <TextField
        label="Path prefix"
        hint={hostingPathPrefixHint(serviceContext)}
        value={editor.pathPrefix}
        editable={!locked}
        onChangeText={(value) => onChange({ pathPrefix: value })}
        placeholder="/"
        mono
        autoCapitalize="none"
      />
      {targetPortAuthorable ? (
        <TextField
          label="Target port"
          value={editor.targetPort}
          editable={!locked}
          onChangeText={(value) => onChange({ targetPort: value })}
          placeholder="8080"
          mono
          keyboardType="number-pad"
        />
      ) : (
        <Text style={styles.tlsHint}>{targetPortHint}</Text>
      )}

      <HostingWebEnvFields
        serviceContext={serviceContext}
        editor={editor}
        onChange={onChange}
        disabled={panelFieldsLocked}
      />
    </>
  )
}

function HostingVariablesBlock({
  orgId,
  hostingId,
}: Readonly<{ orgId: string; hostingId: string | null }>) {
  if (!hostingId) {
    return (
      <Text style={panelStyles.muted}>
        Save hosting first to add hostname-scoped variables.
      </Text>
    )
  }
  return (
    <VariablesSection
      orgId={orgId}
      parentField={{ hostingId }}
      embedded
      showPresets={false}
    />
  )
}

/**
 * The editor key a compose route has after a save: the key ends in the
 * route's hostname and path, so a new hostname gives the row a new key.
 */
function composeRowKeyAfterSave(
  row: HostingPanelRowDescriptor,
  entry: Pick<ComposeHostingExtensionEntry, 'hostname' | 'pathPrefix'>,
): string {
  if (row.source.kind !== 'compose') return row.editorKey
  const prefix = row.editorKey.slice(0, row.editorKey.length - row.source.route.length)
  return `${prefix}${hostingEntryKey(entry)}`
}

/** A panel hosting save also asks Let's Encrypt for a certificate. */
function wantsLetsEncrypt(editor: HostingEditorState): boolean {
  return (
    editor.getLetsEncrypt &&
    offersLetsEncrypt({
      composeOwned: false,
      protocol: editor.protocol,
      tlsId: editor.tlsId,
      hostnameCount: parseHostnameList(editor.hostnames).length,
    })
  )
}

/** A row's save button, and right after it what its last save said. */
function HostingSaveControls({
  asksLetsEncrypt,
  saving,
  disabled,
  error,
  savedNote,
  onSave,
}: Readonly<{
  /** The save also asks Let's Encrypt for a certificate. */
  asksLetsEncrypt: boolean
  saving: boolean
  disabled: boolean
  /** Why the last save failed, in plain words. */
  error: string | null
  savedNote: HostingSaveNote | null
  onSave: () => void
}>) {
  // Said while saving, so leaving early is not mistaken for done.
  const busyLabel = asksLetsEncrypt ? 'Saving and asking Let’s Encrypt…' : 'Saving…'
  const note = error === null ? savedNote : { tone: 'error' as const, message: error }
  const failed = note?.tone === 'error'
  return (
    <>
      <Button
        label="Save hosting"
        busyLabel={busyLabel}
        size="sm"
        variant="secondary"
        busy={saving}
        disabled={disabled}
        onPress={onSave}
      />
      {note ? (
        <Text
          accessibilityRole={failed ? 'alert' : undefined}
          style={failed ? panelStyles.error : styles.savedNote}
        >
          {note.message}
        </Text>
      ) : null}
    </>
  )
}

/**
 * What a hosting row lets someone change. Compose authors the route, never the
 * proxy toggles, the web env, or a raw tcp/udp publish — those stay on the row
 * and survive every reconcile, so they are shown as stored rather than hidden
 * or offered as a doomed edit. A row waiting for the next deploy to remove it
 * changes nothing.
 */
function hostingRowLocks(
  input: Readonly<{
    disabled: boolean
    awaitingRemoval: boolean
    composeOwned: boolean
    composeEditable: boolean
  }>,
): { frozen: boolean; locked: boolean; panelFieldsLocked: boolean; canSave: boolean } {
  // Nothing on the row can change, the certificate actions included.
  const frozen = input.disabled || input.awaitingRemoval
  return {
    frozen,
    locked: frozen || (input.composeOwned && !input.composeEditable),
    panelFieldsLocked: frozen || input.composeOwned,
    canSave: input.composeEditable && !input.awaitingRemoval,
  }
}

/** Hostname-scoped variables; left out on a row waiting to be removed. */
function HostingVariablesSection({
  orgId,
  hostingId,
  hidden,
}: Readonly<{ orgId: string; hostingId: string | null; hidden: boolean }>) {
  if (hidden) return null
  return (
    <>
      <Text style={styles.tlsLabel}>Hosting variables</Text>
      <Text style={styles.tlsHint}>
        Hostname-scoped overrides for this service. Applied at deploy after
        service scope (compose injects at the service level).
      </Text>
      <HostingVariablesBlock orgId={orgId} hostingId={hostingId} />
    </>
  )
}

/** Exported for its tests. */
export function HostingPanelRow({
  orgId,
  composeServiceName,
  serviceContext,
  hostingId,
  composeRoute = null,
  composeEntry = null,
  composeState = 'not-deployed',
  configurationHref = null,
  rowError,
  savedNote = null,
  onRemoveHostname,
  onManageHere,
  composeEditable = true,
  removalNote = null,
  focused = false,
  expanded,
  onToggleExpanded,
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
  /**
   * `hostingEntryKey` of the `x-turbopanel.hosting` entry this row renders, or
   * null for a panel-authored row. Non-null means compose owns the route: the
   * save writes the document, and the fields compose has no spelling for are
   * shown read-only rather than offered as edits the API would refuse.
   */
  composeRoute?: string | null
  /** The configured entry this row renders, for its readable words and actions. */
  composeEntry?: ComposeHostingExtensionEntry | null
  composeState?: ConfiguredHostingState
  /** The Compose editor that holds the entry. */
  configurationHref?: string | null
  rowError?: HostingRowError
  /** What the last save of this row said when it went through. */
  savedNote?: HostingSaveNote | null
  onRemoveHostname: () => void
  onManageHere: () => void
  /**
   * False when the declaration lives in the project compose. The route still
   * renders — it is what will deploy — but this surface only authors the
   * environment overlay, so saving here would append a second declaration.
   */
  composeEditable?: boolean
  /**
   * Set on a hosting whose entry has left the configuration file: what the
   * next deploy does with it. The row is then read-only and has no Save.
   */
  removalNote?: string | null
  /** Highlight when opened from a `/networking/:hostingId` deep link. */
  focused?: boolean
  /** Full editor visible; collapsed rows show the one-line summary only. */
  expanded: boolean
  onToggleExpanded: () => void
  editor: HostingEditorState
  tlsOptions: TlsRecord[]
  publicIps: IpRecord[]
  saving: boolean
  disabled: boolean
  onChange: (patch: Partial<HostingEditorState>) => void
  onSave: () => void
}>) {
  const covering = coveringCertificates(tlsOptions, editor.hostnames, editor.www)
  const pinnedGap = pinnedCertificateGap(
    tlsOptions,
    editor.tlsId,
    editor.hostnames,
    editor.www,
  )

  const composeOwned = composeRoute !== null
  const targetPortAuthorable = hostingTargetPortAuthorable(
    composeServiceKindOf(serviceContext),
  )
  // Named per kind, so the row says which host process already owns the port
  // rather than only that the field is gone.
  const targetPortHint = hostingTargetPortHint(serviceContext) ?? ''
  const awaitingRemoval = removalNote !== null
  const { frozen, locked, panelFieldsLocked, canSave } = hostingRowLocks({
    disabled,
    awaitingRemoval,
    composeOwned,
    composeEditable,
  })
  const isHttp = composeOwned || editor.protocol === 'http'
  const kindLabel = hostingServiceKindLabel(serviceContext)
  const dockerBridgeHint = hostingDockerBridgeHint(serviceContext)
  const cardStyle = [
    panelStyles.detailCard,
    focused && styles.hostingRowFocused,
  ]
  const cardAccessibilityState = focused ? { selected: true } : undefined

  const header = (
    <Pressable
      style={[styles.hostingSummaryPress, webPointer]}
      onPress={onToggleExpanded}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={
        expanded
          ? `Collapse ${composeServiceName} hosting`
          : `Expand ${composeServiceName} hosting`
      }
    >
      <View style={styles.hostingSummaryCopy}>
        <View style={styles.hostingTitleRow}>
          <Text style={panelStyles.detailTitle}>{composeServiceName}</Text>
          <Text style={styles.serviceKindBadge}>{kindLabel}</Text>
        </View>
        <Text style={styles.hostingSummaryText} numberOfLines={1}>
          {hostingRowSummary(editor, tlsOptions)}
        </Text>
      </View>
      <HeaderChevron size={12} color={colors.textMuted} open={expanded} />
    </Pressable>
  )

  if (!expanded) {
    return (
      <View style={cardStyle} accessibilityState={cardAccessibilityState}>
        {header}
      </View>
    )
  }

  return (
    <View style={cardStyle} accessibilityState={cardAccessibilityState}>
      {header}
      {composeEntry ? (
        <ComposeHostnameActions
          composeServiceName={composeServiceName}
          entry={composeEntry}
          editable={composeEditable}
          state={composeState}
          configurationHref={configurationHref}
          busy={saving}
          disabled={disabled}
          error={rowErrorFor(rowError, 'actions')}
          onRemove={onRemoveHostname}
          onManageHere={onManageHere}
        />
      ) : null}
      <HostingHintText hint={removalNote} />
      <HostingHintText hint={dockerBridgeHint} />

      <HostingProtocolPicker
        composeOwned={composeOwned}
        editor={editor}
        disabled={locked}
        onChange={onChange}
      />

      <HostingAddressField
        isHttp={isHttp}
        composeOwned={composeOwned}
        editor={editor}
        locked={locked}
        error={rowErrorFor(rowError, 'hostname')}
        onChange={onChange}
      />

      <HostingWwwField
        isHttp={isHttp}
        editor={editor}
        locked={locked}
        onChange={onChange}
      />

      <HostingTlsPicker
        isHttp={isHttp}
        composeOwned={composeOwned}
        editor={editor}
        covering={covering}
        pinnedGap={pinnedGap}
        locked={locked}
        onChange={onChange}
      />

      {isHttp && hostingId ? (
        <HostingCertificatePanel
          orgId={orgId}
          hostingId={hostingId}
          composeOwned={composeOwned}
          disabled={frozen}
        />
      ) : null}

      <HostingBindPicker editor={editor} locked={locked} onChange={onChange} />

      <HostingPublicIpPicker
        editor={editor}
        publicIps={publicIps}
        locked={locked}
        onChange={onChange}
      />

      <HostingProxyFields
        isHttp={isHttp}
        composeOwned={composeOwned}
        serviceContext={serviceContext}
        editor={editor}
        locked={locked}
        panelFieldsLocked={panelFieldsLocked}
        targetPortAuthorable={targetPortAuthorable}
        targetPortHint={targetPortHint}
        onChange={onChange}
      />

      {canSave ? (
        <HostingSaveControls
          asksLetsEncrypt={!composeOwned && wantsLetsEncrypt(editor)}
          saving={saving}
          disabled={disabled}
          error={rowErrorFor(rowError, 'save')}
          savedNote={savedNote}
          onSave={onSave}
        />
      ) : null}

      <HostingVariablesSection orgId={orgId} hostingId={hostingId} hidden={awaitingRemoval} />
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
      <Text style={panelStyles.muted}>No connected servers available.</Text>
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
          <Text style={panelStyles.muted}>Select a server…</Text>
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
    <Section
      title="Server"
      note={
        inheritsProjectDefault
          ? 'Inherited from Project — pick a server to override for this environment'
          : 'Required — this environment deploys to one server'
      }
    >
      {picker}
      {!placementServerId ? (
        <Text style={panelStyles.error}>
          Select a server before deploying (or set a default on Project).
        </Text>
      ) : null}
      {selectedOffline ? (
        <Text style={panelStyles.error}>
          Selected server is offline. Choose a connected server.
        </Text>
      ) : null}
      {savingPlacement ? (
        <Text style={panelStyles.muted}>Saving…</Text>
      ) : null}
    </Section>
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
        <Text style={panelStyles.detailTitle}>
          {required ? 'Health checks required' : 'Health checks missing'}
        </Text>
        <Text style={panelStyles.detailLine}>
          {required
            ? 'These services require a Compose healthcheck before deploy can continue:'
            : 'These services have no healthcheck configured. You can deploy anyway:'}
        </Text>
        <Text style={styles.modalServices}>{serviceList || 'Unknown services'}</Text>
        <ButtonRow>
          <Button
            label="Cancel"
            variant="secondary"
            disabled={deploying}
            onPress={onCancel}
          />
          {!required ? (
            <Button
              label="Deploy anyway"
              busyLabel="Deploying…"
              variant="primary"
              busy={deploying}
              disabled={deploying}
              onPress={onConfirm}
            />
          ) : null}
        </ButtonRow>
      </View>
    </View>
  )
}

export type EnvironmentDetailSectionId =
  | 'hosting'
  | 'service-settings'
  | 'storage'
  | 'containers'

const ALL_ENVIRONMENT_DETAIL_SECTIONS: readonly EnvironmentDetailSectionId[] = [
  'hosting',
  'service-settings',
  'storage',
  'containers',
]

function EnvironmentInfoPanel({
  environment,
  projectId,
}: Readonly<{
  environment: EnvironmentRecord
  projectId: string
}>) {
  return (
    <Section title="Environment" note="Environment details">
      <Text style={panelStyles.detailTitle}>
        {environment.name?.trim() || 'Unnamed environment'}
      </Text>
      {environment.description ? (
        <Text style={panelStyles.detailLine}>
          {environment.description}
        </Text>
      ) : null}
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Project: </Text>
        {projectId}
      </Text>
    </Section>
  )
}

function EnvironmentComposeOverlayPanel({
  environment,
  onSaveCompose,
  savingCompose,
}: Readonly<{
  environment: EnvironmentRecord
  onSaveCompose: (compose: ComposeDocument) => Promise<void>
  savingCompose: boolean
}>) {
  return (
    <Section
      title="Compose overlay"
      note="Overrides the project compose"
      collapsible
      defaultCollapsed
    >
      <ComposeEditorSection
        document={environment.options?.compose}
        onSave={onSaveCompose}
        saving={savingCompose}
        title="Environment compose overlay"
      />
    </Section>
  )
}

function EnvironmentDeployChromePanels({
  placementServerId,
  sortedServers,
  savingPlacement,
  inheritsProjectDefault,
  onSavePlacement,
  deploying,
  deployBlocked,
  onPreviewMerged,
  onPreviewPrepared,
  onDeploy,
  deployStatus,
}: Readonly<{
  placementServerId: string | null
  sortedServers: OrgServerRecord[]
  savingPlacement: boolean
  inheritsProjectDefault: boolean
  onSavePlacement: (serverId: string) => void
  deploying: boolean
  deployBlocked: boolean
  onPreviewMerged: () => void
  onPreviewPrepared: () => void
  onDeploy: () => void
  deployStatus: string | null
}>) {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false)
  const previewBtnRef = useRef<View>(null)
  const [previewMenuPosition, setPreviewMenuPosition] = useState({
    top: 56,
    left: 16,
  })

  useEffect(() => {
    if (!previewMenuOpen || isCompact) return
    previewBtnRef.current?.measureInWindow((x, y, w, h) => {
      setPreviewMenuPosition({
        top: y + h + 6,
        left: Math.max(12, x + w - 280),
      })
    })
  }, [previewMenuOpen, isCompact])

  return (
    <>
      <EnvironmentPlacementPanel
        placementServerId={placementServerId}
        sortedServers={sortedServers}
        savingPlacement={savingPlacement}
        inheritsProjectDefault={inheritsProjectDefault}
        onSavePlacement={onSavePlacement}
      />

      <Section
        title="Deploy"
        note="Preview compose, then deploy this environment to its selected server"
      >
        <View style={styles.deployActions}>
          <View ref={previewBtnRef} collapsable={false} style={styles.splitGroup}>
            <Pressable
              style={[
                panelStyles.toolbarBtnSecondary,
                styles.splitPrimary,
                deploying && styles.buttonDisabled,
                webPointer,
              ]}
              disabled={deploying}
              onPress={onPreviewMerged}
              accessibilityRole="button"
              accessibilityLabel="Preview merged compose"
            >
              <Text style={panelStyles.toolbarBtnTextSecondary}>Preview</Text>
            </Pressable>
            <Pressable
              style={[
                panelStyles.toolbarBtnSecondary,
                styles.splitCaret,
                deploying && styles.buttonDisabled,
                webPointer,
              ]}
              disabled={deploying}
              onPress={() => setPreviewMenuOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="Preview options"
              accessibilityState={{ expanded: previewMenuOpen }}
            >
              <HeaderChevron size={12} color={colors.textChip} />
            </Pressable>
          </View>
          <Button
            label="Deploy"
            busyLabel="Deploying…"
            variant="primary"
            busy={deploying}
            disabled={deploying || deployBlocked}
            onPress={onDeploy}
            accessibilityLabel="Deploy environment"
          />
        </View>
        {deployStatus ? (
          <Text style={panelStyles.detailLine}>{deployStatus}</Text>
        ) : null}
      </Section>

      <Modal
        visible={previewMenuOpen}
        transparent
        animationType={isCompact ? 'slide' : 'fade'}
        onRequestClose={() => setPreviewMenuOpen(false)}
      >
        <View
          style={[
            styles.menuBackdrop,
            isCompact && styles.menuBackdropCompact,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPreviewMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss menu"
          />
          <View
            style={[
              styles.menuCard,
              isCompact
                ? styles.menuCardCompact
                : {
                    position: 'absolute',
                    top: previewMenuPosition.top,
                    left: previewMenuPosition.left,
                    width: 280,
                  },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
                webPointer,
              ]}
              onPress={() => {
                setPreviewMenuOpen(false)
                onPreviewMerged()
              }}
              accessibilityRole="menuitem"
              accessibilityLabel="Preview merged compose"
            >
              <Text style={styles.menuItemTitle}>Merged compose</Text>
              <Text style={styles.menuItemSub}>
                Project base combined with this environment’s overrides,
                including TurboPanel’s own settings
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
                webPointer,
              ]}
              onPress={() => {
                setPreviewMenuOpen(false)
                onPreviewPrepared()
              }}
              accessibilityRole="menuitem"
              accessibilityLabel="Preview prepared compose"
            >
              <Text style={styles.menuItemTitle}>Prepared compose</Text>
              <Text style={styles.menuItemSub}>
                Deploy-ready document after variables, naming, and
                site split
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  )
}

function EnvironmentHostingSectionPanel({
  orgId,
  hostingRows,
  hostingEditors,
  setHostingEditors,
  tlsLibrary,
  publicIps,
  savingHosting,
  onSaveHosting,
  hostingRowActions,
  focusHostingId,
}: Readonly<{
  orgId: string
  /**
   * One descriptor per rendered route — every `x-turbopanel.hosting` entry a
   * service declares, or its single panel row when it declares none. Built by
   * {@link buildHostingPanelRows} so this component never has to decide who
   * owns a route.
   */
  hostingRows: HostingPanelRowDescriptor[]
  hostingEditors: Record<string, HostingEditorState>
  setHostingEditors: Dispatch<SetStateAction<Record<string, HostingEditorState>>>
  tlsLibrary: TlsRecord[]
  publicIps: IpRecord[]
  /** `editorKey` of the row being saved, or null. */
  savingHosting: string | null
  onSaveHosting: (row: HostingPanelRowDescriptor) => void
  hostingRowActions: HostingRowActions
  focusHostingId: string | null
}>) {
  // Per-row expand-in-place; deep-linked (focused) rows open by default.
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const rowKeys = hostingRows.map((row) => row.editorKey)
  const focusedRow = hostingRows.find(
    (row) => focusHostingId != null && row.hostingId === focusHostingId,
  )
  const selectedKey = pickHostKey(rowKeys, pickedKey, focusedRow?.editorKey ?? null)
  const pickerEntries = hostingRows.map((row) => ({
    key: row.editorKey,
    label: hostPickerLabel({
      hostnames: (hostingEditors[row.editorKey] ?? row.seed).hostnames,
      composeServiceName: row.composeServiceName,
      protocol: (hostingEditors[row.editorKey] ?? row.seed).protocol,
    }),
  }))
  return (
    <Section title="Hosting" note="Point each service at a hostname, or open a raw port for it">
      {hostingRows.length === 0 ? (
        <EmptyState title="Add services to Compose before configuring hostnames." />
      ) : (
        <View style={styles.hostingList}>
          {hostingRows.length > 1 ? (
            <HostingHostPicker
              entries={pickerEntries}
              selectedKey={selectedKey}
              onSelect={setPickedKey}
            />
          ) : null}
          {hostingRows.filter((row) => row.editorKey === selectedKey).map((row) => {
            const editor = hostingEditors[row.editorKey] ?? row.seed
            const focused =
              focusHostingId != null && row.hostingId === focusHostingId
            // The picked hostname is always open; the picker replaced the
            // per-row expand toggle.
            const expanded = expandedRows[row.editorKey] ?? true
            return (
              <HostingPanelRow
                key={row.editorKey}
                orgId={orgId}
                composeServiceName={row.composeServiceName}
                serviceContext={row.serviceContext}
                hostingId={row.hostingId}
                composeRoute={row.source.kind === 'compose'
                  ? row.source.route
                  : null}
                composeEntry={row.source.kind === 'compose' ? row.source.entry : null}
                composeState={row.source.kind === 'compose' ? row.source.state : undefined}
                configurationHref={composeEditorHrefFor(row, hostingRowActions)}
                rowError={hostingRowActions.rowErrors[row.editorKey]}
                savedNote={hostingRowActions.savedNotes[row.editorKey] ?? null}
                onRemoveHostname={() => hostingRowActions.onRemoveHostname(row)}
                onManageHere={() => hostingRowActions.onManageHere(row)}
                composeEditable={isEditableRow(row)}
                removalNote={removalNoteFor(row)}
                focused={focused}
                expanded={expanded}
                onToggleExpanded={() =>
                  setExpandedRows((current) => ({
                    ...current,
                    [row.editorKey]: !expanded,
                  }))
                }
                editor={editor}
                tlsOptions={tlsLibrary}
                publicIps={publicIps}
                saving={savingHosting === row.editorKey}
                disabled={savingHosting !== null}
                onChange={(patch) =>
                  setHostingEditors((current) => ({
                    ...current,
                    [row.editorKey]: { ...editor, ...patch },
                  }))
                }
                onSave={() => onSaveHosting(row)}
              />
            )
          })}
        </View>
      )}
    </Section>
  )
}

function EnvironmentServiceSettingsSectionPanel({
  orgId,
  serviceNames,
  services,
  canManage,
  onServiceChange,
}: Readonly<{
  orgId: string
  serviceNames: string[]
  services: ServiceRecord[]
  canManage: boolean
  onServiceChange: (nextService: ServiceRecord) => void
}>) {
  return (
    <Section
      title="Service settings"
      note="Per-service deploy options"
      collapsible
      defaultCollapsed
    >
      {serviceNames.length === 0 ? (
        <EmptyState title="Add services to Compose first." />
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
    </Section>
  )
}

function EnvironmentContainersSectionPanel({
  orgId,
  environmentId,
  services,
  containersByService,
  allServers,
}: Readonly<{
  orgId: string
  environmentId: string
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  allServers: OrgServerRecord[]
}>) {
  const folders = useEnvironmentFolders(orgId, environmentId)
  const removedIds = removedFromComposeServiceIds(folders.data?.folders ?? [])
  // The folders list holds only the first 20 rows, so removed sites past it can be missed.
  const partial = (folders.data?.total ?? 0) > (folders.data?.folders.length ?? 0)
  const listed = containerCardServices(
    services,
    Object.fromEntries(
      services.map((service) => [service.id, (containersByService[service.id] ?? []).length]),
    ),
    removedIds,
  )
  return (
    <Section title="Containers" note="Deployed containers and their status">
      {partial ? (
        <Text style={panelStyles.muted}>
          Only the first 20 folders were checked, so a site removed from compose may not be
          marked here.
        </Text>
      ) : null}
      {listed.length === 0 ? (
        <EmptyState title="No containers deployed yet." />
      ) : (
        <View style={styles.containerList}>
          {listed.map((service) => {
            const containers = partitionContainersForDisplay(
              containersByService[service.id] ?? [],
            )
            const title =
              service.name?.trim() || String(service.composeServiceName ?? service.id)
            if (containers.length === 0) {
              // A removed site has no containers; show it so it does not look gone.
              return removedIds.has(service.id) ? (
                <RemovedServiceCard
                  key={service.id}
                  name={title}
                  foldersWhere="above"
                />
              ) : null
            }
            return (
              <View key={service.id} style={panelStyles.detailCard}>
                <View style={styles.hostingTitleRow}>
                  <Text style={panelStyles.detailTitle}>
                    {service.name?.trim() ||
                      String(service.composeServiceName ?? service.id)}
                  </Text>
                  {removedIds.has(service.id) ? (
                    <Badge label="Removed from compose" tone="danger" />
                  ) : null}
                </View>
                {containers.map((container) => (
                  <View
                    key={container.id}
                    style={[
                      styles.containerRow,
                      container.role === 'ingress' && styles.containerRowIngress,
                    ]}
                  >
                    <View style={styles.containerHeader}>
                      <Text style={panelStyles.detailLine}>
                        {containerDisplayName(container)}
                      </Text>
                      <ContainerRoleBadge role={container.role} />
                      <ContainerStatusBadge status={container.status} />
                    </View>
                    <Text style={panelStyles.detailLine}>
                      <Text style={panelStyles.detailLabel}>Host: </Text>
                      {containerHostLabel(container, allServers)}
                    </Text>
                    <ContainerLogTail orgId={orgId} container={container} />
                  </View>
                ))}
              </View>
            )
          })}
        </View>
      )}
    </Section>
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
  deployBlocked,
  deploying,
  deployStatus,
  onPreviewMerged,
  onPreviewPrepared,
  onDeploy,
  onSaveCompose,
  savingCompose,
  savingPlacement,
  onSavePlacement,
  inheritsProjectDefault = false,
  services,
  onServiceChange,
  hostingRows,
  hostingEditors,
  setHostingEditors,
  tlsLibrary,
  publicIps,
  savingHosting,
  onSaveHosting,
  hostingRowActions,
  containersByService,
  canManage,
  showEnvironmentPanel = true,
  showComposeOverlay = true,
  sections = ALL_ENVIRONMENT_DETAIL_SECTIONS,
  showEnvironmentChrome = true,
  focusHostingId = null,
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
  onPreviewMerged: () => void
  onPreviewPrepared: () => void
  onDeploy: () => void
  onSaveCompose: (compose: ComposeDocument) => Promise<void>
  savingCompose: boolean
  savingPlacement: boolean
  onSavePlacement: (serverId: string) => void
  inheritsProjectDefault?: boolean
  services: ServiceRecord[]
  onServiceChange: (nextService: ServiceRecord) => void
  hostingRows: HostingPanelRowDescriptor[]
  hostingEditors: Record<string, HostingEditorState>
  setHostingEditors: Dispatch<SetStateAction<Record<string, HostingEditorState>>>
  tlsLibrary: TlsRecord[]
  publicIps: IpRecord[]
  savingHosting: string | null
  onSaveHosting: (row: HostingPanelRowDescriptor) => void
  hostingRowActions: HostingRowActions
  containersByService: Record<string, ContainerRecord[]>
  canManage: boolean
  showEnvironmentPanel?: boolean
  showComposeOverlay?: boolean
  sections?: readonly EnvironmentDetailSectionId[]
  /** Deploy / placement / merged YAML chrome — off when reusing hosting-only. */
  showEnvironmentChrome?: boolean
  /** Hosting row id from a `?hostingId=` deep link on the Hosting tab. */
  focusHostingId?: string | null
  /**
   * Narrow the rendered rows to these compose services. The Services lens
   * expands hosting for the one service the operator clicked, rather than
   * sending them to a page listing every service.
   */
  filterServiceNames?: readonly string[]
}>) {
  const showSection = (id: EnvironmentDetailSectionId) => sections.includes(id)

  return (
    <>
      {showEnvironmentChrome && showEnvironmentPanel ? (
        <EnvironmentInfoPanel environment={environment} projectId={projectId} />
      ) : null}

      {showEnvironmentChrome && showComposeOverlay ? (
        <EnvironmentComposeOverlayPanel
          environment={environment}
          onSaveCompose={onSaveCompose}
          savingCompose={savingCompose}
        />
      ) : null}

      {showEnvironmentChrome ? (
        <EnvironmentDeployChromePanels
          placementServerId={placementServerId}
          sortedServers={sortedServers}
          savingPlacement={savingPlacement}
          inheritsProjectDefault={inheritsProjectDefault}
          onSavePlacement={onSavePlacement}
          deploying={deploying}
          deployBlocked={deployBlocked}
          onPreviewMerged={onPreviewMerged}
          onPreviewPrepared={onPreviewPrepared}
          onDeploy={onDeploy}
          deployStatus={deployStatus}
        />
      ) : null}

      {showSection('hosting') ? (
        <EnvironmentHostingSectionPanel
          orgId={orgId}
          hostingRows={hostingRows}
          hostingEditors={hostingEditors}
          setHostingEditors={setHostingEditors}
          tlsLibrary={tlsLibrary}
          publicIps={publicIps}
          savingHosting={savingHosting}
          onSaveHosting={onSaveHosting}
          hostingRowActions={hostingRowActions}
          focusHostingId={focusHostingId}
        />
      ) : null}

      {showSection('service-settings') ? (
        <EnvironmentServiceSettingsSectionPanel
          orgId={orgId}
          serviceNames={serviceNames}
          services={services}
          canManage={canManage}
          onServiceChange={onServiceChange}
        />
      ) : null}

      {showSection('storage') ? (
        <StorageSection
          orgId={orgId}
          environmentId={environment.id}
          defaultServerId={placementServerId}
        />
      ) : null}

      {showSection('containers') ? (
        <EnvironmentContainersSectionPanel
          orgId={orgId}
          environmentId={environment.id}
          services={services}
          containersByService={containersByService}
          allServers={allServers}
        />
      ) : null}
    </>
  )
}

/** Combined loading state for every query `EnvironmentDetailBody` depends on. */
function computeEnvironmentDetailLoading(queries: {
  environmentLoading: boolean
  hasEnvironment: boolean
  projectLoading: boolean
  serversLoading: boolean
  servicesLoading: boolean
  tlsLoading: boolean
  ipsLoading: boolean
  hasServiceIds: boolean
  hostingsLoading: boolean
  containersLoading: boolean
}): boolean {
  if (queries.environmentLoading && !queries.hasEnvironment) return true
  if (
    queries.projectLoading ||
    queries.serversLoading ||
    queries.servicesLoading ||
    queries.tlsLoading ||
    queries.ipsLoading
  ) {
    return true
  }
  return (
    queries.hasServiceIds &&
    (queries.hostingsLoading || queries.containersLoading)
  )
}

/**
 * First tracked entry (in `trackedEntries` order) whose command matches the
 * active deploy command and has reached a terminal status.
 */
function findTerminalDeployEntry(
  data: readonly CommandStatusRecord[],
  entries: readonly TrackedCommandEntry[],
  activeDeployCommandId: string | null,
): { entry: TrackedCommandEntry; record: CommandStatusRecord } | null {
  if (!activeDeployCommandId) return null
  const entry = entries.find(
    (row) => row.commandId === activeDeployCommandId,
  )
  if (!entry) return null
  // Join on command id: unreadable ids are dropped from the batched response.
  const record = commandStatusById(data).get(entry.commandId)
  if (!record || !isTerminalCommandStatus(record.status)) return null
  return { entry, record }
}

type PostDeployRefreshOptions = Readonly<{
  isCurrentAttempt: () => boolean
  refetchServices: () => Promise<{ data?: { services: ServiceRecord[] } }>
  refetchContainers: () => Promise<unknown>
  refetchHostings: () => Promise<unknown>
  getCachedServices: () => ServiceRecord[]
  hasContainersForService: (serviceId: string) => boolean
}>

/**
 * Deploy-preview modal + health-check-ack modal + variables panel — the
 * environment-chrome extras rendered once (non-embedded) per environment.
 * Pulled into its own component so the presence checks for `environment` /
 * `healthCheckPrompt` (and the nested preview-confirm ternary) are scored
 * against this component's own complexity budget, not the parent's.
 */
function EnvironmentDetailChromeExtras({
  orgId,
  environmentId,
  environment,
  canManage,
  placementServerId,
  pinnedServer,
  projectCompose,
  deploying,
  deployPending,
  previewOpen,
  onCancelPreview,
  deploy,
  healthCheckPrompt,
  onCancelHealthCheck,
  runDeploy,
}: Readonly<{
  orgId: string
  environmentId: string
  environment: EnvironmentRecord | null
  canManage: boolean
  placementServerId: string | null
  pinnedServer: OrgServerRecord | null
  projectCompose: ComposeDocument | null
  deploying: boolean
  deployPending: boolean
  previewOpen: {
    purpose: PreviewDeploymentPurpose
    mode: ComposePreviewMode
  } | null
  onCancelPreview: () => void
  deploy: () => Promise<void>
  healthCheckPrompt: { services: string[]; required: boolean } | null
  onCancelHealthCheck: () => void
  runDeploy: (acknowledgeHealthCheckWarnings?: boolean) => Promise<void>
}>) {
  return (
    <>
      {environment ? (
        <PreviewDeploymentModal
          visible={previewOpen != null}
          orgId={orgId}
          environmentId={environment.id}
          environmentLabel={
            environment.name?.trim() || 'this environment'
          }
          canManage={canManage}
          placementServerId={placementServerId}
          placementServerLabel={
            pinnedServer ? serverLabel(pinnedServer) : placementServerId
          }
          projectCompose={projectCompose}
          environmentCompose={environment.options?.compose}
          deploying={deployPending}
          purpose={previewOpen?.purpose ?? 'inspect'}
          initialMode={previewOpen?.mode ?? 'merged'}
          confirmLabel="Deploy"
          onCancel={onCancelPreview}
          onConfirm={
            previewOpen?.purpose === 'confirm'
              ? () => {
                  deploy().catch(() => {
                    // Errors are surfaced via deployStatus.
                  })
                }
              : undefined
          }
        />
      ) : null}

      {healthCheckPrompt ? (
        <HealthCheckAckModal
          services={healthCheckPrompt.services}
          required={healthCheckPrompt.required}
          deploying={deploying}
          onCancel={onCancelHealthCheck}
          onConfirm={() => {
            runDeploy(true).catch(() => {
              // Errors are surfaced via deployStatus.
            })
          }}
        />
      ) : null}

      <VariablesSection orgId={orgId} parentField={{ environmentId }} />
    </>
  )
}

/** Poll (up to 5 attempts, 400ms apart) until containers show up post-deploy. */
async function refreshEnvironmentAfterDeploy(
  options: PostDeployRefreshOptions,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!options.isCurrentAttempt()) return
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 400))
    }
    const [servicesResult] = await Promise.all([
      options.refetchServices(),
      options.refetchContainers(),
      options.refetchHostings(),
    ])
    const refreshedServices =
      servicesResult.data?.services ?? options.getCachedServices()
    const hasContainers = refreshedServices.some((service) =>
      options.hasContainersForService(service.id),
    )
    if (attempt > 0 && hasContainers) break
  }
}

export function EnvironmentDetailBody({
  orgId,
  projectId,
  environmentId,
  embedded = false,
  showComposeOverlay = true,
  sections,
  focusHostingId = null,
  filterServiceNames,
}: Readonly<{
  orgId: string
  projectId: string
  environmentId: string
  embedded?: boolean
  /** Compose overlay editor — off on the Hosting tab (edit on Compose / Services). */
  showComposeOverlay?: boolean
  /**
   * Resource panels to render. Default: all four (full environment body).
   * Pass e.g. `['hosting']` to reuse hostnames/ports/TLS without Storage /
   * Service settings / Containers (Hosting tab).
   */
  sections?: readonly EnvironmentDetailSectionId[]
  /** Hosting row id from a `?hostingId=` deep link on the Hosting tab. */
  focusHostingId?: string | null
  /**
   * Narrow the rendered rows to these compose services. The Services lens
   * expands hosting for the one service the operator clicked, rather than
   * sending them to a page listing every service.
   */
  filterServiceNames?: readonly string[]
}>) {
  const resolvedSections = sections ?? ALL_ENVIRONMENT_DETAIL_SECTIONS
  const showEnvironmentChrome = sections == null
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
  const releaseHostingMutation = useReleaseHostingFromCompose(orgId)
  const letsEncryptMutation = useRequestLetsEncrypt(orgId)

  const [error, setError] = useState<string | null>(null)
  const [savingHosting, setSavingHosting] = useState<string | null>(null)
  const [hostingRowErrors, setHostingRowErrors] = useState<
    Record<string, HostingRowError>
  >({})
  const [hostingSavedNotes, setHostingSavedNotes] = useState<
    Record<string, HostingSaveNote>
  >({})
  // Why Let's Encrypt was refused on the last save that asked for it, by hosting id.
  const [certificateRefusals, setCertificateRefusals] = useState<
    Record<string, LetsEncryptRefusal>
  >({})
  const [healthCheckPrompt, setHealthCheckPrompt] = useState<{
    services: string[]
    required: boolean
  } | null>(null)
  const [deployStatus, setDeployStatus] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState<{
    purpose: PreviewDeploymentPurpose
    mode: ComposePreviewMode
  } | null>(null)
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
  const allServers = orEmptyArray(serversQuery.data?.servers)
  const tlsLibrary = tlsQuery.data?.tls ?? []
  const publicIps = ipsQuery.data?.ips ?? []
  const hostingsByService = hostingsQuery.hostingsByService
  const containersByService = containersQuery.containersByService
  // Memoized because `hostingRows` depends on it: a fresh `[]` every render
  // would rebuild every descriptor and re-seed the editors mid-edit.
  const resolvedServices = useMemo(() => services ?? [], [services])

  const loading = computeEnvironmentDetailLoading({
    environmentLoading: environmentQuery.isLoading,
    hasEnvironment: environment != null,
    projectLoading: projectQuery.isLoading,
    serversLoading: serversQuery.isLoading,
    servicesLoading: servicesQuery.isLoading,
    tlsLoading: tlsQuery.isLoading,
    ipsLoading: ipsQuery.isLoading,
    hasServiceIds: serviceIds.length > 0,
    hostingsLoading: hostingsQuery.isLoading,
    containersLoading: containersQuery.isLoading,
  })

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
        userErrorMessage(queryError, 'Failed to load environment'),
      )
    }
  }, [queryError])

  useEffect(() => {
    if (!commandsQuery.data || trackedEntries.length === 0) return
    const terminal = findTerminalDeployEntry(
      commandsQuery.data,
      trackedEntries,
      activeDeployCommandId,
    )
    if (!terminal) return
    const { entry, record } = terminal

    setDeployStatus(deployStatusMessage(record))
    setActiveDeployCommandId(null)
    setTrackedEntries((current) =>
      current.filter((row) => row.commandId !== entry.commandId),
    )

    if (record.status !== 'succeeded') return

    const refreshAttempt = ++postDeployRefreshRef.current
    void refreshEnvironmentAfterDeploy({
      isCurrentAttempt: () => postDeployRefreshRef.current === refreshAttempt,
      refetchServices: () => servicesQuery.refetch(),
      refetchContainers: () => containersQuery.refetchAll(),
      refetchHostings: () => hostingsQuery.refetchAll(),
      getCachedServices: () => servicesQuery.data?.services ?? [],
      hasContainersForService: (serviceId) => {
        const rows = queryClient.getQueryData<{ containers: ContainerRecord[] }>(
          queryKeys.org(orgId).containers.list({ serviceId }),
        )?.containers
        return (rows?.length ?? 0) > 0
      },
    })
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
      mergeComposeOverlay(
        stripComposePlacement(normalizeCompose(projectCompose)),
        environment?.options?.compose,
      ),
    [environment?.options?.compose, projectCompose],
  )
  const serviceNames = useMemo(() => {
    const all = composeServiceNames(mergedCompose)
    if (!filterServiceNames) return all
    const keep = new Set(filterServiceNames)
    return all.filter((name) => keep.has(name))
  }, [mergedCompose, filterServiceNames])
  // The overlay on its own, not merged: it is the only document this surface
  // can author, so it decides which compose-declared routes are editable here.
  const overlayCompose = useMemo(
    () => normalizeCompose(environment?.options?.compose),
    [environment?.options?.compose],
  )
  const hostingRows = useMemo(
    () =>
      buildHostingPanelRows({
        serviceNames,
        services: resolvedServices,
        mergedCompose,
        overlayCompose,
        hostingsByService,
      }),
    [
      serviceNames,
      resolvedServices,
      mergedCompose,
      overlayCompose,
      hostingsByService,
    ],
  )

  // Each editor follows its row while it has no unsaved edits (a save, a deploy).
  const {
    editors: hostingEditors,
    setEditors: setHostingEditors,
    markSaved: markEditorsSaved,
  } = useSyncedEditors(hostingRows, loading)
  useLeaveWarning(savingHosting !== null)
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
        (a.name ?? a.id).localeCompare(b.name ?? b.id),
      ),
    [allServers],
  )

  const savingCompose = persistEnvironmentCompose.isPending
  const savingPlacement = updateEnvironmentMutation.isPending
  const deploying =
    deployEnvironmentMutation.isPending ||
    activeDeployCommandId !== null ||
    trackedEntries.length > 0

  /**
   * After a save: refetch, then refill the saved rows' editors from the
   * answer (never from rows read before the save, which showed an empty form
   * after a successful save). Other rows refill only without unsaved edits.
   */
  const refreshEditorsAfterSave = async (savedKeys: readonly string[]) => {
    await Promise.all([
      servicesQuery.refetch(),
      containersQuery.refetchAll(),
      hostingsQuery.refetchAll(),
    ])
    markEditorsSaved(savedKeys)
  }

  /**
   * Save the environment's compose file. `onError` says where a refusal is
   * shown: the top of the page by default, next to the hosting row's control
   * when a row saved it. Answers whether it saved.
   */
  const saveCompose = async (
    compose: ComposeDocument,
    onError: (message: string) => void = setError,
    savedKeys: readonly string[] = [],
  ): Promise<boolean> => {
    setError(null)
    const result = await persistEnvironmentCompose.run(compose)
    if (!result.ok) {
      onError(failedRunMessage(result, 'Could not save the compose file.'))
      return false
    }
    await refreshEditorsAfterSave(savedKeys)
    return true
  }

  const setSavedNote = (editorKey: string, note: HostingSaveNote | null) => {
    setHostingSavedNotes((current) => {
      const { [editorKey]: _previous, ...rest } = current
      return note ? { ...rest, [editorKey]: note } : rest
    })
  }

  /** Every row problem is shown in plain words: no request paths or codes. */
  const setRowError = (editorKey: string, rowError: HostingRowError | null) => {
    setHostingRowErrors((current) => {
      const { [editorKey]: _previous, ...rest } = current
      if (!rowError) return rest
      return {
        ...rest,
        [editorKey]: { ...rowError, message: hostingActionErrorMessage(rowError.message) },
      }
    })
  }

  const savePlacement = async (serverIdToPin: string) => {
    setError(null)
    const result = await updateEnvironmentMutation.run({
      serverId: serverIdToPin,
    })
    if (!result.ok) {
      setError(failedRunMessage(result, 'Could not save the server for this environment.'))
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
      setPreviewOpen(null)
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
      setPreviewOpen(null)
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
        setPreviewOpen(null)
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

  const openComposeInspect = (mode: ComposePreviewMode) => {
    setError(null)
    setPreviewOpen({ purpose: 'inspect', mode })
  }

  const openDeployConfirm = useCallback(() => {
    setError(null)
    setPreviewOpen({ purpose: 'confirm', mode: 'prepared' })
  }, [])

  /**
   * Persist one edited compose route by rewriting the environment overlay.
   *
   * Never `PATCH /hostings`: the row this renders is materialized from the
   * document and the API answers a write to it with
   * `409 hosting_owned_by_compose`. The next deploy re-projects the row from
   * what is saved here.
   */
  const saveComposeHostingRow = async (
    row: HostingPanelRowDescriptor,
    overlayIndex: number,
  ): Promise<void> => {
    const editor = hostingEditors[row.editorKey] ?? row.seed
    const entry = composeHostingEntryFromEditor(editor, row.serviceContext)
    if (!entry) {
      setRowError(row.editorKey, { field: 'hostname', message: EMPTY_COMPOSE_HOSTNAME_MESSAGE })
      return
    }
    const entries = [
      ...readComposeHostingEntries(overlayCompose, row.composeServiceName),
    ]
    entries[overlayIndex] = entry
    const saved = await saveCompose(
      writeComposeHostingEntries(
        overlayCompose,
        row.composeServiceName,
        entries,
      ),
      (message) => setRowError(row.editorKey, { field: 'save', message }),
      [row.editorKey],
    )
    // A new hostname renames the route, and with it the row the note goes on.
    if (saved) {
      setSavedNote(composeRowKeyAfterSave(row, entry), {
        tone: 'ok',
        message: 'Saved. It goes live on the next deploy.',
      })
    }
  }

  /** Persist one panel-authored row straight to `/hostings`, as before. */
  const savePanelHostingRow = async (
    row: HostingPanelRowDescriptor,
    editor: HostingEditorState = hostingEditors[row.editorKey] ?? row.seed,
    onError: (message: string) => void = (message) =>
      setRowError(row.editorKey, { field: 'save', message }),
  ): Promise<boolean> => {
    const service = resolvedServices.find(
      (item) => item.composeServiceName === row.composeServiceName,
    )
    if (!service) {
      onError(SERVICE_NOT_SAVED_MESSAGE)
      return false
    }
    const result = await upsertHostingMutation.run({
      serviceId: service.id,
      ...(row.hostingId ? { hostingId: row.hostingId } : {}),
      body: {
        name: row.composeServiceName,
        metadata: { composeServiceName: row.composeServiceName },
        options: buildHostingOptions(editor),
        tlsId: editor.tlsId,
        ipId: editor.ipId,
      },
    })
    if (!result.ok) {
      onError(failedRunMessage(result, 'Could not save this hostname.'))
      return false
    }
    const savedHostingId =
      row.hostingId ??
      ('id' in result.value && typeof result.value.id === 'string' ? result.value.id : null)
    const wantsCertificate = wantsLetsEncrypt(editor)
    // The hosting is already saved; a refused certificate is said next to its
    // Certificate section (with the fix when there is one), never undone.
    const certificateStep = await certificateAfterSave({
      hostingId: savedHostingId,
      wantsCertificate,
      request: letsEncryptMutation.run,
    })
    if (certificateStep) {
      setCertificateRefusals((current) =>
        withCertificateRefusal(current, certificateStep.hostingId, certificateStep.refusal)
      )
    }
    await refreshEditorsAfterSave([row.editorKey])
    setSavedNote(row.editorKey, hostingSaveNote(wantsCertificate, certificateStep?.refusal ?? null))
    return true
  }

  /** Run one row's action with the row marked busy and its last problem cleared. */
  const runRowAction = async (
    row: HostingPanelRowDescriptor,
    action: () => Promise<void>,
  ) => {
    setSavingHosting(row.editorKey)
    setError(null)
    setRowError(row.editorKey, null)
    setSavedNote(row.editorKey, null)
    try {
      await action()
    } finally {
      setSavingHosting(null)
    }
  }

  const saveHosting = (row: HostingPanelRowDescriptor) =>
    runRowAction(row, async () => {
      if (row.source.kind === 'panel') {
        await savePanelHostingRow(row)
        return
      }
      // Nothing to save until the next deploy has removed it.
      if (row.source.kind === 'removing') return
      if (row.source.overlayIndex === null) {
        setRowError(row.editorKey, { field: 'save', message: SHARED_FILE_HOSTNAME_MESSAGE })
        return
      }
      await saveComposeHostingRow(row, row.source.overlayIndex)
    })

  /** The environment's file without this row's entry, or null (with the reason shown). */
  const overlayWithoutRow = (row: HostingPanelRowDescriptor): ComposeDocument | null => {
    const next = row.source.kind === 'compose'
      ? withoutComposeHostingRoute(overlayCompose, row.composeServiceName, row.source.route)
      : null
    if (!next) {
      setRowError(row.editorKey, { field: 'actions', message: SHARED_FILE_HOSTNAME_MESSAGE })
    }
    return next
  }

  const actionsErrorSink = (row: HostingPanelRowDescriptor) => (message: string) =>
    setRowError(row.editorKey, { field: 'actions', message })

  /** Remove hostname: drop the entry; the next deploy removes (or hands back) its hosting. */
  const removeComposeHostname = (row: HostingPanelRowDescriptor) =>
    runRowAction(row, async () => {
      const next = overlayWithoutRow(row)
      if (next) await saveCompose(next, actionsErrorSink(row))
    })

  /** Manage on this screen instead: see `moveComposeHostnameToPanel` for the order. */
  const moveRowToPanel = (row: HostingPanelRowDescriptor) =>
    runRowAction(row, async () => {
      if (row.source.kind !== 'compose') return
      const next = overlayWithoutRow(row)
      if (!next) return
      const onError = actionsErrorSink(row)
      const editor = hostingEditors[row.editorKey] ?? row.seed
      const certificate = panelCertificateForMovedRoute(row.source.entry, tlsLibrary)
      if (!row.hostingId && certificate.missingRef !== null) {
        onError(missingCertificateMessage(certificate.missingRef))
        return
      }
      const serviceId = resolvedServices.find(
        (item) => item.composeServiceName === row.composeServiceName,
      )?.id
      await moveComposeHostnameToPanel({ hostingId: row.hostingId, next }, {
        release: async (hostingId) => {
          const released = await releaseHostingMutation.run({ hostingId, serviceId })
          if (!released.ok) {
            onError(failedRunMessage(released, 'Could not hand this hostname to this screen.'))
          }
          return released.ok
        },
        saveFile: (document) => saveCompose(document, onError),
        createPanelHosting: () =>
          savePanelHostingRow(
            { ...row, source: { kind: 'panel' }, hostingId: null },
            {
              ...editor,
              tlsId: certificate.tlsId,
              getLetsEncrypt: certificate.getLetsEncrypt,
              tlsAutomatic: false,
              protocol: 'http',
            },
            onError,
          ),
      })
    })

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

  const certificateActions = useMemo(
    () => ({
      // The deploy confirm only renders with the environment chrome.
      ...(showEnvironmentChrome
        ? { onDeploy: openDeployConfirm, deployDisabled: deployBlocked || deploying }
        : {}),
      refusals: certificateRefusals,
      onRefusal: (hostingId: string, refusal: LetsEncryptRefusal | null) =>
        setCertificateRefusals((current) => withCertificateRefusal(current, hostingId, refusal)),
    }),
    [showEnvironmentChrome, openDeployConfirm, deployBlocked, deploying, certificateRefusals]
  )

  const hostingRowActions: HostingRowActions = {
    rowErrors: hostingRowErrors,
    savedNotes: hostingSavedNotes,
    environmentComposeHref: projectEnvironmentComposeHref(orgId, projectId, environmentId),
    baseComposeHref: projectComposeHref(orgId, projectId),
    onRemoveHostname: (row) => {
      void removeComposeHostname(row)
    },
    onManageHere: (row) => {
      void moveRowToPanel(row)
    },
  }

  if (loading && !environment) {
    return <LoadingState />
  }

  const body = (
    <View style={styles.body}>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

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
          onPreviewMerged={() => openComposeInspect('merged')}
          onPreviewPrepared={() => openComposeInspect('prepared')}
          onDeploy={openDeployConfirm}
          onSaveCompose={async (compose) => {
            await saveCompose(compose)
          }}
          savingCompose={savingCompose}
          savingPlacement={savingPlacement}
          onSavePlacement={(nextServerId) => {
            void savePlacement(nextServerId)
          }}
          inheritsProjectDefault={inheritsProjectDefault}
          services={resolvedServices}
          onServiceChange={updateServiceInCache}
          hostingRows={hostingRows}
          hostingEditors={hostingEditors}
          setHostingEditors={setHostingEditors}
          tlsLibrary={tlsLibrary}
          publicIps={publicIps}
          savingHosting={savingHosting}
          onSaveHosting={(row) => {
            saveHosting(row).catch((err: unknown) => {
              setRowError(row.editorKey, {
                field: 'save',
                message: userErrorMessage(err, 'Could not save this hostname.'),
              })
            })
          }}
          hostingRowActions={hostingRowActions}
          containersByService={containersByService}
          canManage={canManage}
          showEnvironmentPanel={!embedded}
          showComposeOverlay={showComposeOverlay}
          sections={resolvedSections}
          showEnvironmentChrome={showEnvironmentChrome}
          focusHostingId={focusHostingId}
        />
      ) : null}

      {showEnvironmentChrome ? (
        <EnvironmentDetailChromeExtras
          orgId={orgId}
          environmentId={environmentId}
          environment={environment}
          canManage={canManage}
          placementServerId={placementServerId}
          pinnedServer={pinnedServer}
          projectCompose={projectCompose}
          deploying={deploying}
          deployPending={deployEnvironmentMutation.isPending}
          previewOpen={previewOpen}
          onCancelPreview={() => {
            if (deployEnvironmentMutation.isPending) return
            setPreviewOpen(null)
          }}
          deploy={deploy}
          healthCheckPrompt={healthCheckPrompt}
          onCancelHealthCheck={() => setHealthCheckPrompt(null)}
          runDeploy={runDeploy}
        />
      ) : null}
    </View>
  )

  return (
    <HostingCertificateActionsContext.Provider value={certificateActions}>
      {body}
    </HostingCertificateActionsContext.Provider>
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
  deployActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  splitGroup: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  splitPrimary: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  splitCaret: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    paddingHorizontal: 10,
    minWidth: 32,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  menuBackdropCompact: {
    justifyContent: 'flex-end',
  },
  menuCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgPanel,
    overflow: 'hidden',
    zIndex: 2,
  },
  menuCardCompact: {
    margin: spacing.md,
    marginBottom: spacing.xl,
  },
  menuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 4,
  },
  menuItemPressed: {
    backgroundColor: colors.bgSecondary,
  },
  menuItemTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  menuItemSub: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  hostingList: { gap: spacing.sm },
  hostingRowFocused: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  hostingTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  hostingSummaryPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hostingSummaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  hostingSummaryText: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
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
  tlsLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  savedNote: {
    color: colors.textBody,
    fontSize: 13,
  },
  tlsHint: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: spacing.xs,
  },
  wwwResult: {
    color: colors.textBody,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
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
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
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
})
