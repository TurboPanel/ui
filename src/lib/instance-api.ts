import type { ComposeDocument } from '@/lib/compose'
import { resolveApiUrl } from '@/lib/control-plane'
import { getActiveControlPlaneOrigin } from '@/lib/control-plane-accounts'
import { formatFetchFailureDetail, isHttpStatusError } from '@/lib/fetch-error-detail'
import type { ManagedIngressPorts } from '@/lib/managed-ingress-ports'
import type {
  ManagedBackupRecord,
  ManagedConnectionRole,
  ManagedDetailResponse,
  ManagedEnvironmentRecord,
  ManagedListRecord,
  ManagedMemberRecord,
  ManagedServiceEngine,
  ManagedSettings,
  ManagedSqlAccessScope,
  ManagedUserRecord,
} from '@/lib/managed-services'
import type { ManagedSslMode } from '@/lib/managed-ssl'
import { getActiveOrganizationId, ORG_ID_HEADER } from '@/lib/org-context'
export {
  isForbiddenError,
  isHttpStatusError,
  isServerPlacementRequiredError,
} from '@/lib/fetch-error-detail'

export type { ComposeDocument } from '@/lib/compose'
export type { ManagedIngressPorts } from '@/lib/managed-ingress-ports'
export type {
  ManagedAccessEndpoint,
  ManagedBackupRecord,
  ManagedConnectionInfo,
  ManagedConnectionRole,
  ManagedDetailResponse,
  ManagedEngineAvailability,
  ManagedEnvironmentRecord,
  ManagedListRecord,
  ManagedMemberRecord,
  ManagedMemberRole,
  ManagedMemberTransport,
  ManagedReleaseView,
  ManagedReplicaClass,
  ManagedReplicationHealth,
  ManagedServerSummary,
  ManagedServiceEngine,
  ManagedSettings,
  ManagedSqlAccessScope,
  ManagedSslView,
  ManagedStatus,
  ManagedUserRecord,
} from '@/lib/managed-services'
export type { ManagedSslMode } from '@/lib/managed-ssl'

/** Exported so panels compare against symbols, not string literals. */
export const USERNAME_IN_USE_ERROR = 'username_in_use'
export const MANAGED_MEMBER_EXISTS_ERROR = 'managed_member_exists'
export const MANAGED_REPLICA_NOT_PROMOTABLE_ERROR = 'managed_replica_not_promotable'
export const MANAGED_AUTOMATIC_FAILOVER_BLOCKED_ERROR = 'managed_automatic_failover_blocked'
export const MANAGED_NO_READ_TARGETS_ERROR = 'managed_no_read_targets'
export const FAILOVER_REPLICA_REQUIRES_DATACENTER_TRANSPORT_ERROR =
  'failover_replica_requires_datacenter_transport'
export const MANAGED_MEMBER_IS_PRIMARY_ERROR = 'managed_member_is_primary'
export const DATACENTER_REQUIRED_ERROR = 'datacenter_required'
export const DATACENTER_CIDR_REQUIRED_ERROR = 'datacenter_cidr_required'
export const DATACENTER_IP_REQUIRED_ERROR = 'datacenter_ip_required'
export const DATACENTER_HAS_MEMBERS_ERROR = 'datacenter_has_members'
export const DATACENTER_HAS_NETWORKS_ERROR = 'datacenter_has_networks'
export const SUBNET_OVERLAPS_ERROR = 'subnet_overlaps'
export const SUBNET_HAS_MEMBERS_ERROR = 'subnet_has_members'
export const INVALID_CIDR_ERROR = 'invalid_cidr'
export const ADDRESS_NOT_IN_ANY_SUBNET_ERROR = 'address_not_in_any_subnet'
export const ADDRESS_IN_USE_ERROR = 'address_in_use'
export const PRIVATE_FAMILY_MISMATCH_ERROR = 'private_family_mismatch'
export const PRIVATE_PATH_UNAVAILABLE_ERROR = 'private_path_unavailable'
export const PEER_TUNNEL_ADDRESS_REQUIRED_ERROR = 'peer_tunnel_address_required'
export const MANAGED_PRIVATE_PORT_EXHAUSTED_ERROR = 'managed_private_port_exhausted'
export const MANAGED_LISTENER_BIND_CONFLICT_ERROR = 'managed_listener_bind_conflict'
export const MANAGED_REPLICA_NOT_STREAMING_ERROR = 'managed_replica_not_streaming'
export const MANAGED_REPLICA_LAGGING_ERROR = 'managed_replica_lagging'
export const MANAGED_REPLICA_HEALTH_STALE_ERROR = 'managed_replica_health_stale'
export const MANAGED_PRIMARY_FENCE_FAILED_ERROR = 'managed_primary_fence_failed'
export const MANAGED_USER_HAS_BINDINGS_ERROR = 'managed_user_has_bindings'
export const MANAGED_DATABASE_HAS_BINDINGS_ERROR = 'managed_database_has_bindings'
export const BINDING_KEY_PREFIX_IN_USE_ERROR = 'binding_key_prefix_in_use'
export const BINDING_ENGINE_DEFAULTS_IN_USE_ERROR = 'binding_engine_defaults_in_use'
export const BINDING_KEY_CONFLICT_ERROR = 'binding_key_conflict'
export const BINDING_ENDPOINT_UNAVAILABLE_ERROR = 'binding_endpoint_unavailable'
export const FABRIC_RECONCILE_FAILED_ERROR = 'fabric_reconcile_failed'
export const FABRIC_RECONCILE_PENDING_ERROR = 'fabric_reconcile_pending'
export const BINDING_PASSWORD_UNAVAILABLE_ERROR = 'binding_password_unavailable' // NOSONAR typescript:S2068 — API error code, not a credential
export const BINDING_ENGINE_UNSUPPORTED_ERROR = 'binding_engine_unsupported'
export const BINDING_OWNED_VARIABLE_ERROR = 'binding_owned_variable'
export const CA_ROTATION_IN_PROGRESS_ERROR = 'ca_rotation_in_progress'
export const NO_PENDING_ROTATION_ERROR = 'no_pending_rotation'
export const CA_ROTATION_NOT_CONVERGED_ERROR = 'ca_rotation_not_converged'
export const DATABASE_NOT_FOUND_ERROR = 'database_not_found'
export const REPOSITORY_REFERENCED_BY_COMPOSE_ERROR = 'source_referenced_by_compose'
export const TAG_NAME_IN_USE_ERROR = 'tag_name_in_use'
export const TASK_NAME_IN_USE_ERROR = 'task_name_in_use'
export const TASK_SCHEDULE_INVALID_ERROR = 'task_schedule_invalid'
export const TASK_LIMIT_REACHED_ERROR = 'task_limit_reached'

const CLIENT_API = '/api/client/v1'
const INSTALL_API = '/api/install/v1'
const ADMIN_API = '/api/admin/v1'

function controlPlaneUrl(path: string): string {
  return resolveApiUrl(path, getActiveControlPlaneOrigin())
}

/**
 * Dev-sync (`POST /api/developer/v1/daemon/sync-dev`) is Deno-only, superadmin /
 * local-console authenticated, and exposed through the turbopanel-dev terminal
 * console — not this web client. There is no client-surface helper here by design.
 */
export const DEV_SYNC_WEB_AVAILABLE = false

export type SessionInfo = {
  userId: string | null
  email: string | null
  role: string | null
  /** Deno self-hosted only — absent on Workers. */
  needsInstall?: boolean
}

export type OrganizationRecord = {
  id: string
  name: string | null
  createdAt: string
}

export type InstallStatus = {
  /**
   * Control-plane runtime from `GET /api/client/v1/status`.
   * Workers (HA) → blue auth chrome; Deno (self-hosted) → green.
   */
  runtime?: 'deno' | 'workers'
  /** Deno self-hosted only — absent on Workers (use sign-up for bootstrap). */
  needsInstall?: boolean
  /** Deno self-hosted only — absent on Workers. */
  isInstallMode?: boolean
  /** Workers: defaults to true when env and DB are unset (sign-up is the bootstrap path). */
  isSignupEnabled: boolean
  isSignupEmailVerificationEnabled?: boolean
}

export async function fetchSession(): Promise<SessionInfo | null> {
  const response = await fetch(controlPlaneUrl(`${CLIENT_API}/authn/session`), {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) detail = body.error
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${CLIENT_API}/authn/session failed: ${detail}`)
  }

  const body = (await response.json()) as SessionInfo & { ok: true }
  return {
    userId: body.userId ?? null,
    email: body.email ?? null,
    role: body.role ?? null,
    ...(body.needsInstall === undefined ? {} : { needsInstall: body.needsInstall }),
  }
}

export async function signIn(email: string, password: string): Promise<SessionInfo> {
  const body = await apiFetch<SessionInfo & { ok: true }>(`${CLIENT_API}/auth/sign-in`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return {
    userId: body.userId ?? null,
    email: body.email ?? null,
    role: body.role ?? null,
    ...(body.needsInstall === undefined ? {} : { needsInstall: body.needsInstall }),
  }
}

export async function bootstrapInstall(username: string, password: string): Promise<{ ok: true }> {
  return await apiFetch(`${INSTALL_API}/bootstrap`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function signOut(): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/sign-out`, {
    method: 'POST',
  })
}

export async function fetchInstallStatus(): Promise<InstallStatus> {
  const body = await apiFetch<InstallStatus & { ok: true; needsInstall?: boolean }>(
    `${CLIENT_API}/status`
  )
  return {
    ...(body.runtime === 'deno' || body.runtime === 'workers' ? { runtime: body.runtime } : {}),
    ...(body.needsInstall === undefined ? {} : { needsInstall: body.needsInstall }),
    ...(body.isInstallMode === undefined && body.needsInstall === undefined
      ? {}
      : { isInstallMode: body.isInstallMode ?? body.needsInstall ?? false }),
    isSignupEnabled: body.isSignupEnabled ?? false,
    ...(body.isSignupEmailVerificationEnabled === undefined
      ? {}
      : {
          isSignupEmailVerificationEnabled: body.isSignupEmailVerificationEnabled,
        }),
  }
}

export async function signUp(email: string, password: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/auth/sign-up`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function verifyEmail(token: string): Promise<{ ok: true }> {
  const params = new URLSearchParams({ token })
  return await apiFetch(`${CLIENT_API}/auth/verify-email?${params.toString()}`)
}

export type ServerGeo = {
  asOrganization?: string
  country?: string
  city?: string
  continent?: string
  region?: string
  regionCode?: string
  timezone?: string
  longitude?: string
  latitude?: string
  postalCode?: string
  metroCode?: string
  asn?: number
  datacenter?: string
  capturedAt?: string
}

export type ServerOsFamily = 'linux' | 'windows' | 'freebsd' | 'darwin'

export type ServerOsVariant = 'raspberry-pi-os'

export type ServerOsMetadata = {
  family?: ServerOsFamily
  id?: string
  variant?: ServerOsVariant
  version?: string
  codename?: string
  prettyName?: string
  architecture?: string
}

export type ServerCpuCoreSplit = {
  total: number
  p?: number
  e?: number
}

export type ServerCpuCache = {
  l1?: number
  l1d?: number
  l1i?: number
  l2?: number
  l3?: number
  l4?: number
}

export type ServerCpuSocket = {
  vendorId?: string
  name?: string
  architecture?: string
  cores?: ServerCpuCoreSplit
  threads?: ServerCpuCoreSplit
  cache?: ServerCpuCache
  speedMhz?: number
  turboMhz?: number
}

export type ServerGpu = {
  vendorId?: string
  name?: string
  memoryBytes?: number
  driver?: string
  pciId?: string
  pciSlot?: string
}

/** Static host capacity from daemon hello — inventory totals + load bars. */
export type ServerHostResources = {
  cpus?: ServerCpuSocket[]
  gpus?: ServerGpu[]
  memory?: { totalBytes?: number }
  swap?: { totalBytes?: number }
  ips?: ServerReportedIp[]
}

export type ServerOsLogoKey = 'debian' | 'raspberry-pi-os'

export type ServerReportedIpScope = 'private' | 'public'

export type ServerReportedIp = {
  address: string
  version: 4 | 6
  scope: ServerReportedIpScope
  cidr?: string
  interface?: string
  /** Address sits on the interface carrying the host's default route. */
  preferred?: boolean
}

/**
 * Which fact `OrgServerRecord.address` came from.
 *
 * - `observed` — the peer address the control plane saw the daemon connect
 *   from (through a Cloudflare Tunnel, that is `CF-Connecting-IP`).
 * - `interface` — a host interface the daemon reported. Used when the observed
 *   address was the reverse proxy or a forwarded port rather than the host.
 * - `local` — daemon shares a host with the control plane (Unix socket).
 */
export type ServerAddressSource = 'observed' | 'interface' | 'local'

export type ServerTimeSync = {
  timezone?: string
  ntpEnabled?: boolean
  ntpSynced?: boolean
  ntpServers?: string[]
  fallbackNtpServers?: string[]
  lastSyncedAt?: string
  capturedAt?: string
}

export type ServerDockerMetadata = {
  /** Docker CLI version (`docker --version`). */
  version?: string
  /** Compose plugin version (`docker compose version`). */
  composeVersion?: string
}

export type ServerTimezoneSource = 'server' | 'organization' | 'datacenter' | null

export type HostDefaultsSource = 'server' | 'organization' | 'datacenter'

export type NtpDefaults = {
  enabled?: boolean
  servers?: string[]
  fallbackServers?: string[]
}

export type OrgHostDefaults = {
  sshPort: number | null
  ntp: NtpDefaults | null
  defaultFabricEnabled: boolean
}

export type ServerDatacenterRef = {
  id: string
  name: string | null
}

export type OrgServerRecord = {
  id: string
  name: string | null
  organizationId: string | null
  licenseId: string | null
  options: Record<string, unknown> | null
  createdAt: string
  connected: boolean
  hostname: string | null
  /** Raw peer address seen on the wire. Diagnostic — prefer `address`. */
  remoteAddress: string | null
  /** Best-known network address for this host; null until one is known. */
  address: string | null
  addressSource: ServerAddressSource | null
  addressScope: ServerReportedIpScope | null
  /** Host interface `address` belongs to, when known. */
  addressInterface: string | null
  lastInboundAt: string | null
  connectedAt: string | null
  /** Last online/offline transition (`server.status_changed_at`). */
  statusChangedAt: string | null
  geo: ServerGeo | null
  /** Host OS from server.os_* columns (daemon hello); null until reported. */
  os: ServerOsMetadata | null
  /** Formatted label e.g. "Debian 13.5 (Trixie)". */
  osDisplay: string | null
  /** Logo key for the OS column (`debian` / `raspberry-pi-os`). */
  osLogo: ServerOsLogoKey | null
  /** Capacity totals from daemon hello (`server.metadata.resources`, including ips). */
  resources: ServerHostResources | null
  colocatedWithInstance?: boolean
  ips: ServerReportedIp[] | null
  timeSync: ServerTimeSync | null
  /**
   * Docker CLI / Compose plugin versions (`server.metadata.docker`).
   * Null when Docker is not installed or has not been reported.
   */
  docker: ServerDockerMetadata | null
  timezone: string | null
  timezoneSource: ServerTimezoneSource
  /** Effective SSH listen port (server → datacenter → org → 22). */
  sshPort: number
  sshPortSource: HostDefaultsSource | null
  /** Effective desired NTP settings (not the observed timeSync facts). */
  ntpDefaults: NtpDefaults | null
  ntpDefaultsSource: HostDefaultsSource | null
  /** Datacenter memberships (IP pins); a server may belong to many. */
  datacenters: ServerDatacenterRef[]
}

export type ServerDetailRecord = OrgServerRecord & {
  orgDefaultTimezone: string | null
  enforceServerTimezone: boolean
  datacenterDefaultTimezone: string | null
  datacenterEnforceServerTimezone: boolean
  colocatedWithInstance: boolean
  labels?: { key: string; value: string }[]
}

export type NtpSetInput = {
  enabled?: boolean
  servers?: string[]
  fallbackServers?: string[]
}

export type OrgDefaultTimezoneSettings = {
  defaultServerTimezone: string | null
  enforceServerTimezone: boolean
}

/** Ensure memberships are always an array (stale cache / older instance). */
function normalizeOrgServer<T extends OrgServerRecord>(server: T): T {
  return {
    ...server,
    datacenters: server.datacenters ?? [],
    sshPort: server.sshPort ?? 22,
    sshPortSource: server.sshPortSource ?? null,
    ntpDefaults: server.ntpDefaults ?? null,
    ntpDefaultsSource: server.ntpDefaultsSource ?? null,
  }
}

export async function fetchOrgServers(): Promise<{ servers: OrgServerRecord[] }> {
  const body = await apiFetch<{ servers: OrgServerRecord[] }>(`${CLIENT_API}/servers`)
  return { servers: body.servers.map((server) => normalizeOrgServer(server)) }
}

export async function fetchServer(serverId: string): Promise<ServerDetailRecord> {
  const body = await apiFetch<{ ok: true; server: ServerDetailRecord }>(
    `${CLIENT_API}/servers/${serverId}`
  )
  return normalizeOrgServer(body.server)
}

export type ServerLabelPair = { key: string; value: string }

export async function fetchServerLabels(serverId: string): Promise<ServerLabelPair[]> {
  const body = await apiFetch<{ ok: true; labels: ServerLabelPair[] }>(
    `${CLIENT_API}/servers/${serverId}/labels`
  )
  return body.labels
}

/** Replace-all. Pass `{}` to clear every label. */
export async function saveServerLabels(
  serverId: string,
  labels: Record<string, string>
): Promise<ServerLabelPair[]> {
  const body = await apiFetch<{ ok: true; labels: ServerLabelPair[] }>(
    `${CLIENT_API}/servers/${serverId}/labels`,
    {
      method: 'PUT',
      body: JSON.stringify({ labels }),
    }
  )
  return body.labels
}

export async function updateServer(
  serverId: string,
  body: {
    name?: string | null
    options?: {
      sshPort?: number | null
      ntp?: NtpDefaults | null
      hosting?: { enabled: boolean }
    }
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function setServerTimezone(
  serverId: string,
  timezone: string
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/timezone`, {
    method: 'POST',
    body: JSON.stringify({ timezone }),
  })
}

/**
 * Applies NTP settings on the daemon. The body must include at least one of
 * `enabled`, `servers`, or `fallbackServers` — otherwise the instance returns 400.
 */
export async function setServerNtp(
  serverId: string,
  input: NtpSetInput
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/ntp`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchTimezones(): Promise<{ timezones: string[] }> {
  return await apiFetch(`${CLIENT_API}/timezones`)
}

export async function fetchOrgDefaultTimezone(orgId: string): Promise<OrgDefaultTimezoneSettings> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/default-timezone`)
}

export async function saveOrgDefaultTimezone(
  orgId: string,
  patch: Partial<OrgDefaultTimezoneSettings>
): Promise<OrgDefaultTimezoneSettings> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/default-timezone`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export async function fetchOrgHostDefaults(orgId: string): Promise<OrgHostDefaults> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/host-defaults`)
}

export async function saveOrgHostDefaults(
  orgId: string,
  patch: Partial<OrgHostDefaults>
): Promise<OrgHostDefaults> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/host-defaults`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export type OrgServerCapacity = {
  maxServers: number | null
  serverCount: number
  reservedSeatCount: number
  usedSeats: number
  availableSeats: number | null
}

export async function fetchOrgServerCapacity(orgId: string): Promise<OrgServerCapacity> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/server-capacity`)
}

export async function saveOrgServerCapacity(
  orgId: string,
  maxServers: number | null
): Promise<OrgServerCapacity & { ok: true }> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/server-capacity`, {
    method: 'PUT',
    body: JSON.stringify({ maxServers }),
  })
}

export type OrgDefaultEnvironment = {
  defaultEnvironmentName: string | null
}

export async function fetchOrgDefaultEnvironment(orgId: string): Promise<OrgDefaultEnvironment> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/default-environment`)
}

export async function saveOrgDefaultEnvironment(
  orgId: string,
  defaultEnvironmentName: string | null
): Promise<OrgDefaultEnvironment & { ok: true }> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/default-environment`, {
    method: 'PUT',
    body: JSON.stringify({ defaultEnvironmentName }),
  })
}

/**
 * Organization-wide managed-database defaults. `sslMode` / `ports` are the
 * configured values (`null` = inheriting the platform value); the `effective*`
 * fields are what a managed service with no override resolves to today.
 *
 * Ports are per protocol family and organization-wide on purpose: one shared
 * ProxySQL fronts every managed cluster on a server, so a per-service port
 * would defeat the shared listener. MariaDB rides `mysqlFamily`.
 */
export type OrgManagedDefaults = {
  sslMode: ManagedSslMode | null
  effectiveSslMode: ManagedSslMode
  ports: {
    postgres: number | null
    mysqlFamily: number | null
  }
  effectivePorts: ManagedIngressPorts
}

/** `undefined` on a key leaves it unchanged; `null` clears it to the default. */
export type OrgManagedDefaultsPatch = {
  sslMode?: ManagedSslMode | null
  ports?: { postgres?: number | null; mysqlFamily?: number | null } | null
}

export async function fetchOrgManagedDefaults(orgId: string): Promise<OrgManagedDefaults> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/managed-defaults`)
}

export async function saveOrgManagedDefaults(
  orgId: string,
  patch: OrgManagedDefaultsPatch
): Promise<OrgManagedDefaults & { ok: true }> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/managed-defaults`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export type OrgFabricRecord = {
  id: string
  cidr: string
  status?: string
  allowRelay: boolean
}

export type RelayRole = 'gateway' | 'member'

export type FabricRelayPathKind =
  'direct_lan' | 'direct_public' | 'direct_nat' | 'gateway' | 'relay' | 'unreachable'

export type FabricRelayPathState = {
  peerServerId: string
  selected: FabricRelayPathKind
  endpoint?: string
  viaServerId?: string
  lastHandshakeAt?: string
  latencyMs?: number
  degraded: boolean
}

/** Host Docker bridge for a spanning compose network on this relay (table `subnet`). The relay API field stays `segments[]` on purpose. */
export type FabricRelaySegment = {
  name: string
  subnet: string
  mtu?: number
  gateway?: string
}

/** Public relay surface — never includes `presharedKey`. */
export type RelayRecord = {
  serverId: string
  address: string
  role: RelayRole
  advertisedCidrs: string[]
  /** Effective list the gateway will advertise (override or derived IPv4). */
  resolvedAdvertisedCidrs: string[]
  keepalive: number | null
  endpointAddress: string | null
  resolvedEndpoint: string | null
  publicKey: string | null
  prefix: string
  hasPresharedKey: boolean
  /**
   * Compose-bridge subnets (table `subnet`). Deliberately still named
   * `segments[]` — the control plane kept the relay API field as-is.
   */
  segments: FabricRelaySegment[]
  lastHandshakeAt: string | null
  transferRxBytes?: number
  transferTxBytes?: number
  paths: FabricRelayPathState[]
  allowRelay: boolean | null
  effectiveAllowRelay: boolean
  preferredGatewayIds: string[]
  gatewayEligible: boolean
}

export type OrgFabricSettings = {
  enabled: boolean
  fabric?: OrgFabricRecord
  relays: RelayRecord[]
}

export const GATEWAY_DATACENTER_REQUIRED_ERROR = 'gateway_datacenter_required'
export const GATEWAY_DATACENTER_CIDR_REQUIRED_ERROR = 'gateway_datacenter_cidr_required'
export const PREFERRED_GATEWAY_INVALID_ERROR = 'preferred_gateway_invalid'

export type FabricRelayWireRow = {
  serverId: string
  address: string
  role: RelayRole
  advertisedCidrs?: string[]
  resolvedAdvertisedCidrs?: string[]
  keepalive: number | null
  endpointAddress: string | null
  resolvedEndpoint?: string | null
  publicKey: string | null
  prefix: string
  hasPresharedKey?: boolean
  /** Compose-bridge subnets; field name kept as `segments[]`. */
  segments?: FabricRelaySegment[]
  lastHandshakeAt?: string | null
  transferRxBytes?: number
  transferTxBytes?: number
  observed?: {
    lastHandshakeAt?: string
    transferRx?: number
    transferTx?: number
  } | null
  paths?: FabricRelayPathState[]
  allowRelay?: boolean | null
  effectiveAllowRelay?: boolean
  preferredGatewayIds?: string[]
  gatewayEligible?: boolean
}

export function toRelayRecord(row: FabricRelayWireRow): RelayRecord {
  const observed = row.observed
  const lastHandshakeAt = row.lastHandshakeAt ?? observed?.lastHandshakeAt ?? null
  const transferRx = row.transferRxBytes ?? observed?.transferRx
  const transferTx = row.transferTxBytes ?? observed?.transferTx
  return {
    serverId: row.serverId,
    address: row.address,
    role: row.role,
    advertisedCidrs: row.advertisedCidrs ?? [],
    resolvedAdvertisedCidrs: row.resolvedAdvertisedCidrs ?? [],
    keepalive: row.keepalive,
    endpointAddress: row.endpointAddress,
    resolvedEndpoint: row.resolvedEndpoint ?? null,
    publicKey: row.publicKey,
    prefix: row.prefix,
    hasPresharedKey: row.hasPresharedKey === true,
    segments: row.segments ?? [],
    lastHandshakeAt,
    ...(transferRx !== undefined ? { transferRxBytes: transferRx } : {}),
    ...(transferTx !== undefined ? { transferTxBytes: transferTx } : {}),
    paths: row.paths ?? [],
    allowRelay: row.allowRelay ?? null,
    effectiveAllowRelay: row.effectiveAllowRelay === true,
    preferredGatewayIds: row.preferredGatewayIds ?? [],
    gatewayEligible: row.gatewayEligible === true,
  }
}

function toOrgFabricSettings(body: {
  enabled: boolean
  fabric?: OrgFabricRecord
  relays?: FabricRelayWireRow[]
}): OrgFabricSettings {
  return {
    enabled: body.enabled,
    ...(body.fabric
      ? {
          fabric: {
            ...body.fabric,
            allowRelay: body.fabric.allowRelay === true,
          },
        }
      : {}),
    relays: (body.relays ?? []).map(toRelayRecord),
  }
}

export async function fetchOrgFabric(orgId: string): Promise<OrgFabricSettings> {
  const body = await apiFetch<{
    enabled: boolean
    fabric?: OrgFabricRecord
    relays?: FabricRelayWireRow[]
  }>(`${CLIENT_API}/organizations/${orgId}/fabric`)
  return toOrgFabricSettings(body)
}

export async function saveOrgFabric(
  orgId: string,
  enabled: boolean,
  extras?: Readonly<{ allowRelay?: boolean }>
): Promise<OrgFabricSettings> {
  const payload: { enabled: boolean; allowRelay?: boolean } = { enabled }
  if (extras?.allowRelay !== undefined) {
    payload.allowRelay = extras.allowRelay
  }
  const body = await apiFetch<{
    enabled: boolean
    fabric?: OrgFabricRecord
    relays?: FabricRelayWireRow[]
  }>(`${CLIENT_API}/organizations/${orgId}/fabric`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return toOrgFabricSettings(body)
}

export type PatchOrgFabricRelayBody = {
  role?: RelayRole
  advertisedCidrs?: string[]
  keepalive?: number | null
  endpointAddress?: string | null
  /** Write-only — never returned on RelayRecord. */
  presharedKey?: string
  allowRelay?: boolean | null
  preferredGatewayIds?: string[] | null
}

export async function patchOrgFabricRelay(
  orgId: string,
  serverId: string,
  body: PatchOrgFabricRelayBody
): Promise<{ ok: true; relay: RelayRecord }> {
  const result = await apiFetch<{ ok: true; relay: FabricRelayWireRow }>(
    `${CLIENT_API}/organizations/${orgId}/fabric/relays/${serverId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  )
  return { ok: true, relay: toRelayRecord(result.relay) }
}

export type FabricApplyRelayResult = {
  serverId: string
  commandId?: string
  status: 'queued' | 'failed' | 'skipped' | 'converged'
  error?: string
}

export type FabricApplyResponse = {
  ok: true
  fabricId: string
  interfaceName: string
  results: FabricApplyRelayResult[]
}

export async function applyOrgFabric(orgId: string): Promise<FabricApplyResponse> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/fabric/apply`, {
    method: 'POST',
  })
}

export type ServerDeleteBlocker = {
  kind: 'network' | 'container'
  count: number
}

export class ServerDeleteBlockedError extends Error {
  readonly code = 'server_has_blockers'
  readonly blockers: ServerDeleteBlocker[]

  constructor(message: string, blockers: ServerDeleteBlocker[]) {
    super(message)
    this.name = 'ServerDeleteBlockedError'
    this.blockers = blockers
  }
}

function formatDeleteBlockerMessage(kind: 'network' | 'container', count: number): string {
  let label: string
  if (kind === 'network') {
    label = count === 1 ? 'network' : 'networks'
  } else {
    label = count === 1 ? 'container' : 'containers'
  }
  return `Remove ${count} ${label} on this server before deleting it.`
}

export function formatServerDeleteBlockedError(err: unknown): string {
  if (err instanceof ServerDeleteBlockedError) {
    const parts: string[] = []
    const networkBlock = err.blockers.find((blocker) => blocker.kind === 'network')
    if (networkBlock) {
      parts.push(formatDeleteBlockerMessage('network', networkBlock.count))
    }
    const containerBlock = err.blockers.find((blocker) => blocker.kind === 'container')
    if (containerBlock) {
      parts.push(formatDeleteBlockerMessage('container', containerBlock.count))
    }
    if (parts.length > 0) {
      return parts.join(' ')
    }
    return err.message
  }
  return err instanceof Error ? err.message : 'Failed to delete server'
}

export async function deleteServer(
  serverId: string,
  organizationId?: string | null
): Promise<{ ok: true; serverId: string }> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const path = `${CLIENT_API}/servers/${serverId}`
  const response = await fetch(controlPlaneUrl(path), {
    method: 'DELETE',
    credentials: 'include',
    headers,
  })

  if (!response.ok) {
    let body: {
      error?: string
      code?: string
      blockers?: ServerDeleteBlocker[]
    } = {}
    try {
      body = (await response.json()) as typeof body
    } catch {
      // Non-JSON error body.
    }

    if (response.status === 409 && body.code === 'server_has_blockers' && body.blockers) {
      throw new ServerDeleteBlockedError(
        body.error ?? 'Cannot delete this server while dependent resources still exist',
        body.blockers
      )
    }

    const detail = body.error ?? `HTTP ${response.status}`
    throw new Error(`${path} failed: ${detail}`)
  }

  return (await response.json()) as { ok: true; serverId: string }
}

export async function fetchOrganizations(): Promise<{ organizations: OrganizationRecord[] }> {
  return await apiFetch(`${CLIENT_API}/organizations`)
}

export async function fetchOrganization(
  organizationId: string
): Promise<{ organization: OrganizationRecord }> {
  return await apiFetch(`${CLIENT_API}/organizations/${organizationId}`)
}

export async function createOrganization(body: {
  name: string
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/organizations`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateOrganization(
  organizationId: string,
  body: { name: string }
): Promise<{ ok: true; organization: OrganizationRecord }> {
  return await apiFetch(`${CLIENT_API}/organizations/${organizationId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export type InstallCompleteResult = SessionInfo & {
  organizationId: string
}

export async function completeInstall(body: {
  username: string
  password: string
  superadminEmail: string
  superadminPassword: string
}): Promise<InstallCompleteResult> {
  const response = await apiFetch<SessionInfo & { ok: true; organizationId: string }>(INSTALL_API, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return {
    userId: response.userId ?? null,
    email: response.email ?? null,
    role: response.role ?? null,
    needsInstall: false,
    organizationId: response.organizationId,
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  organizationId?: string | null
): Promise<T> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const response = await fetch(controlPlaneUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  })

  if (!response.ok) {
    let detail = formatFetchFailureDetail(response.status)
    try {
      const body = (await response.json()) as {
        error?: string
        issues?: { message?: string }[]
      }
      if (
        body.error === 'compose_invalid' &&
        Array.isArray(body.issues) &&
        body.issues.length > 0
      ) {
        detail =
          body.issues
            .map((issue) => issue.message)
            .filter(
              (message): message is string => typeof message === 'string' && message.length > 0
            )
            .join('; ') || body.error
      } else if (body.error) {
        detail = formatFetchFailureDetail(response.status, body.error)
      }
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${path} failed: ${detail}`)
  }

  return (await response.json()) as T
}

export type HealthResponse = {
  ok: boolean
  license?: string
  revision?: { commit: string; sourceUrl: string }
}

export async function fetchHealth(): Promise<HealthResponse> {
  return await apiFetch('/api/health')
}

export type CreatedLicense = {
  licenseId: string
  licenseToken: string
  installCommand: string
}

export class ServerCapacityExceededError extends Error {
  readonly code = 'server_capacity_exceeded'
  readonly maxServers: number | null
  readonly usedSeats: number

  constructor(maxServers: number | null, usedSeats: number) {
    super(
      maxServers === null
        ? 'Server capacity exceeded'
        : `Server limit reached (${usedSeats} of ${maxServers})`
    )
    this.name = 'ServerCapacityExceededError'
    this.maxServers = maxServers
    this.usedSeats = usedSeats
  }
}

function throwIfLicenseCreateFailed(
  status: number,
  errorBody: {
    error?: string
    maxServers?: number | null
    usedSeats?: number
  }
): never {
  if (status === 409 && errorBody.error === 'server_capacity_exceeded') {
    throw new ServerCapacityExceededError(
      typeof errorBody.maxServers === 'number' ? errorBody.maxServers : null,
      typeof errorBody.usedSeats === 'number' ? errorBody.usedSeats : 0
    )
  }
  const detail = errorBody.error
    ? formatFetchFailureDetail(status, errorBody.error)
    : formatFetchFailureDetail(status)
  throw new Error(`${CLIENT_API}/licenses failed: ${detail}`)
}

/** Mint a one-shot registration key for the Add Server flow. */
export async function createLicense(
  name?: string,
  installBaseUrl?: string
): Promise<CreatedLicense> {
  const body: Record<string, string> = {}
  if (name) body.name = name
  if (installBaseUrl?.trim()) body.installBaseUrl = installBaseUrl.trim()

  const resolvedOrgId = getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const response = await fetch(controlPlaneUrl(`${CLIENT_API}/licenses`), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let errorBody: {
      error?: string
      maxServers?: number | null
      usedSeats?: number
    } = {}
    try {
      errorBody = (await response.json()) as typeof errorBody
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throwIfLicenseCreateFailed(response.status, errorBody)
  }

  return (await response.json()) as CreatedLicense
}

export type LicenseBoundServer = {
  id: string
  name: string | null
  connected: boolean
}

export type LicenseRecord = {
  id: string
  name: string | null
  createdAt: string
  revocable: boolean
  boundServer: LicenseBoundServer | null
}

export async function fetchLicenses(): Promise<{ licenses: LicenseRecord[] }> {
  return await apiFetch(`${CLIENT_API}/licenses`)
}

export async function deleteLicense(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/licenses/${id}`, {
    method: 'DELETE',
  })
}

export type PermissionKey =
  | 'organization:own'
  | 'organization:manage'
  | 'team:own'
  | 'team:manage'
  | 'system:read'
  | 'system:operate'
  | 'system:manage'

export type PermissionRecord = {
  key: PermissionKey
  displayName: string
}

export type AccessScopeKind = 'organization' | 'team'

// Deny grants are not supported by the instance — authorization only evaluates
// allow grants, so `effect` is always `"allow"`.
export type AccessGrantRecord = {
  id: string
  subjectKind: 'user' | 'team' | 'organization'
  subjectId: string
  resourceId: string
  effect: 'allow'
  permissionKey: string
}

export type CreateAccessBody = {
  resourceId: string
  subjectKind: 'user' | 'team' | 'organization'
  subjectId: string
  effect: 'allow'
  permissionKey: PermissionKey
}

export type ResolvedResourceId = {
  resourceId: string
  kind: string
  itemId: string
}

export type TeamRecord = {
  id: string
  name: string | null
  organizationId: string
  createdAt: string
  updatedAt: string
}

export async function fetchVisibleTeams(): Promise<{ teams: TeamRecord[] }> {
  return await apiFetch(`${CLIENT_API}/teams`)
}

export async function fetchPermissions(): Promise<{ permissions: PermissionRecord[] }> {
  return await apiFetch(`${CLIENT_API}/permissions`)
}

export async function resolveResourceId(
  kind: AccessScopeKind,
  itemId: string
): Promise<ResolvedResourceId> {
  const params = new URLSearchParams({ kind, itemId })
  return await apiFetch(`${CLIENT_API}/access/resource-id?${params.toString()}`)
}

export async function fetchAccessGrants(
  resourceId: string
): Promise<{ access: AccessGrantRecord[] }> {
  const params = new URLSearchParams({ resourceId })
  return await apiFetch(`${CLIENT_API}/access?${params.toString()}`)
}

export async function checkPermission(
  resourceId: string,
  permissionKey: PermissionKey
): Promise<{ allowed: boolean }> {
  const params = new URLSearchParams({ resourceId, permissionKey })
  return await apiFetch(`${CLIENT_API}/access/check?${params.toString()}`)
}

export type WorkspaceKind = 'turbopanel' | 'user'

export type WorkspaceRecord = {
  id: string
  name: string | null
  description: string | null
  organizationId: string
  /** Platform vs tenant workspace — never infer from name. */
  kind: WorkspaceKind
  createdAt: string
  updatedAt: string
}

export type EnvironmentRecord = {
  id: string
  name: string | null
  description: string | null
  projectId: string
  /** Whole-server placement pin — single source of truth (not compose). */
  serverId: string | null
  metadata: Record<string, unknown> | null
  /** `options.compose` is a versioned ComposeDocument. */
  options: { compose?: ComposeDocument } | null
  createdAt: string
  updatedAt: string
}

export type ProjectRecord = {
  id: string
  name: string | null
  description: string | null
  workspaceId: string
  /**
   * The one Git repository this project is, or `null` when it is not
   * repository-backed.
   *
   * **A repository-backed project is its repository**, so every
   * `x-turbopanel.source.sourceId` in the project's compose has to name this
   * row — the instance rejects a save that names a second one. Services still
   * carry their own source block for `branch` / `subdirectory` /
   * `buildCommand`, which is how one checkout builds two services out of a
   * monorepo. A project with no binding adopts the first repository its compose
   * names, so the create wizard does not have to send this field.
   */
  repositoryId: string | null
  metadata: {
    /**
     * Read-side type stamp. `system` is platform-owned and read-only — this
     * client never sends it on create or configure.
     */
    type?: 'docker-compose' | 'managed' | 'template' | 'empty' | 'system' | null
    /** Managed engine catalog code (`postgres`, …). */
    code?: string
    /**
     * Internal system-component idempotency key (e.g. `hosting-ingress`).
     * Never an authorization source — gate mutations on `workspace.kind` /
     * `system:*` permissions instead.
     */
    component?: string
  } | null
  /**
   * `options.compose` is a versioned ComposeDocument.
   * `options.containerNaming` is `uuid` (default) or `custom`.
   * `options.defaultServerId` is an optional placement pin inherited by
   * environments that have no `serverId` of their own.
   */
  options: {
    compose?: ComposeDocument
    containerNaming?: 'uuid' | 'custom'
    defaultServerId?: string
  } | null
  createdAt: string
  updatedAt: string
}

export type CatalogSummary = {
  code: string
  kind: 'managed' | 'template'
  displayName: string
  description: string
}

/**
 * Secret write-only rule: when `isSecret` is true, `value` is always `null` —
 * never display or pre-fill secret values; use masked write-only update forms.
 */
export type VariableRecord = {
  id: string
  key: string
  isSecret: boolean
  isLiteral: boolean
  forBuild: boolean
  forRuntime: boolean
  value: string | null
  organizationId: string | null
  workspaceId: string | null
  projectId: string | null
  environmentId: string | null
  serviceId: string | null
  hostingId: string | null
  serverId: string | null
  /**
   * When set, this variable is materialised by a service binding and is not
   * operator-editable. Secret values stay write-only / redacted.
   */
  bindingId: string | null
  description: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Managed DB principal → compose service binding.
 *
 * **Secret write-only rule:** binding password/URL/CA values never cross this
 * API. `keys[]` is metadata only (names of materialised env keys). Render
 * locked chips from `keys[]`; never invent a reveal for binding secrets.
 */
export type BindingRecord = {
  id: string
  principalId: string
  serviceId: string
  databaseName: string
  keyPrefix: string
  emitEngineDefaults: boolean
  keys: string[]
  endpoint: { host: string; port: number } | null
  engine: ManagedServiceEngine | null
  managedId: string | null
  managedEnvironmentId: string | null
  readSplit: boolean | null
  createdAt: string
  updatedAt: string
}

export type BindingImpactService = {
  serviceId: string
  name: string | null
  environmentId: string
  projectId: string
  keyPrefix: string
}

export type BindingRedeployRequired = {
  count: number
  services: BindingImpactService[]
}

export type VariableParentFilter =
  | { organizationId: string }
  | { workspaceId: string }
  | { projectId: string }
  | { environmentId: string }
  | { serviceId: string }
  | { hostingId: string }
  | { serverId: string }

export type CreateVariableBody = {
  key: string
  value?: string
  isSecret?: boolean
  isLiteral?: boolean
  forBuild?: boolean
  forRuntime?: boolean
  description?: string
} & (
  | { organizationId: string }
  | { workspaceId: string }
  | { projectId: string }
  | { environmentId: string }
  | { serviceId: string }
  | { hostingId: string }
  | { serverId: string }
)

export type CreateProjectBody = {
  workspaceId: string
  name?: string
  description?: string
  /**
   * Required. `empty` creates an untyped project with one environment named
   * from the org default (`defaultEnvironmentName`, falling back to
   * `Production`); configure later via setup.
   */
  type: 'empty' | 'docker-compose' | 'template' | 'managed'
  code?: string
  /**
   * Seeds the project's stored options at insert time. The create wizard sends
   * the compose it drafted so a compose project lands with its YAML already
   * saved instead of needing a follow-up PATCH.
   */
  options?: { compose?: ComposeDocument }
  /**
   * Pins the scaffolded default environment (org default name, else `Production`)
   * when creating a managed project.
   */
  serverId?: string
}

export type ConfigureProjectBody = {
  type: 'docker-compose' | 'template' | 'managed'
  code?: string
  serverId?: string
}

export type ManagedCommandResponse = {
  ok: true
  commandId: string
  status: 'queued'
  serverId: string
}

export type EnvironmentLifecycleAction = 'start' | 'stop' | 'restart'

export type HealthCheckPolicy = 'disabled' | 'warn' | 'required'

export type ServiceOptions = {
  preDeployCommand?: string
  postDeployCommand?: string
  build?: {
    disableCache?: boolean
  }
  operations?: {
    stopGracePeriodSeconds?: number
    maxRestartAttempts?: number
  }
  healthCheck?: {
    policy?: HealthCheckPolicy
  }
  resources?: {
    cpus?: number
    memoryBytes?: number
    memoryReservationBytes?: number
  }
}

export type ServiceRecord = {
  id: string
  name: string | null
  description: string | null
  environmentId: string
  /** Derived from the compose document — read-only; never send this on create/update. */
  composeServiceName: string
  metadata?: Record<string, unknown> | null
  options?: ServiceOptions | Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type HostingRecord = {
  id: string
  name: string | null
  description: string | null
  serviceId: string
  /** Pinned org TLS id; null/undefined = basic self-signed (Caddy tls internal). */
  tlsId?: string | null
  /** Pinned public IP id; null/undefined = any interface (server resolves bind). */
  ipId?: string | null
  metadata?: Record<string, unknown> | null
  options?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type TlsSource = 'upload' | 'lets_encrypt' | 'self_signed' | 'organization_ca'

export type TlsStatus = 'ready' | 'pending' | 'expired' | 'failed' | 'revoked'

export type TlsMetadata = {
  dnsNames: string[]
  hasWildcard: boolean
  notBefore: string
  notAfter: string
  fingerprintSha256: string
  subject: string
  issuer: string
  status: TlsStatus
}

export type TlsRecord = {
  id: string
  organizationId: string
  name: string | null
  source: TlsSource
  metadata: TlsMetadata
  options?: { prefer?: number; autoRenew?: boolean; requestedHostnames?: string[] } | null
  certificatePem?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Active organization CA — public fields only. **Never** includes a private key.
 * Shape matches the `tls` object from `GET /tls/ca` (ensure-or-create).
 */
export type OrganizationCaRecord = {
  id: string
  source: TlsSource
  certificatePem?: string | null
  metadata: TlsMetadata
  caGeneration: number | null
  status?: TlsStatus
  organizationId?: string
  name?: string | null
  createdAt?: string
  updatedAt?: string
}

export type OrganizationCaLeafHealth = {
  dueCount: number
  caGeneration: number
  caNotAfter: string | null
}

export type CaRotationResult = {
  serverId: string
  status: string
  kind?: string
  managedId?: string
  commandId?: string
  error?: string
}

export type CaRotationStatus = {
  rotationId: string
  fromGeneration: number
  toGeneration: number
  state: string
  results: CaRotationResult[]
  retiredCaStillRequired: boolean
}

/**
 * Allocator-owned container classifier.
 * - `service` — ordinary workload/engine replica
 * - `ingress` — per-service Traefik container or the shared per-server ProxySQL
 *   managed-ingress frontend (both named `<service.id>-in` at ordinal 1)
 * - `turbopanel` — platform `turbopanel-system` stack (`database` / `queue` /
 *   `analytics`) plus Orchestrator (`-ha`)
 */
export type ContainerRole = 'service' | 'ingress' | 'turbopanel'

export type ContainerRecord = {
  id: string
  serviceId: string
  /**
   * Denormalized `service.environmentId` from the control plane, so a
   * project-wide list can be grouped by environment without one request per
   * environment.
   */
  environmentId: string
  serverId: string
  containerId: string
  containerName: string
  status: string
  /**
   * Allocator-owned. `service` is the ordinary workload/engine replica;
   * `ingress` is the per-service Traefik container or the shared per-server
   * ProxySQL managed-ingress frontend (both named `<service.id>-in` at ordinal
   * 1); `turbopanel` is the platform `turbopanel-system` stack (`database` /
   * `queue` / `analytics`) plus Orchestrator (`-ha`).
   */
  role: ContainerRole
  composeServiceName: string
  metadata?: Record<string, unknown> | null
  options?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/** Kinds an operator can create through `POST /networks`. */
export type CreatableNetworkKind = 'datacenter' | 'docker'

/**
 * Kinds a `network` row can carry on read. `managed` is the platform-allocated
 * org-wide managed-engine network (one per org) — listable and filterable, but
 * never operator-created, patched, or deleted.
 */
export type NetworkKind = CreatableNetworkKind | 'managed'

export type NetworkRecord = {
  id: string
  organizationId: string
  datacenterId: string | null
  serverId: string | null
  kind: NetworkKind
  cidr: string | null
  name: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type DatacenterAddressPreference = 'ipv6' | 'ipv4'

export type DatacenterOptions = {
  defaultServerTimezone?: string | null
  enforceServerTimezone?: boolean
  addressPreference?: DatacenterAddressPreference
  sshPort?: number | null
  ntp?: NtpDefaults | null
}

export type DatacenterNameSuggestion = {
  name: string
  serverCount: number
  serverIds: string[]
  serverLabels: string[]
  geo: ServerGeo
}

export type DatacenterRecord = {
  id: string
  name: string | null
  description: string | null
  organizationId: string
  /** One CIDR per subnet; always present on list and detail (default `[]`). */
  privateCidrs: string[]
  metadata: Record<string, unknown> | null
  options: DatacenterOptions | null
  createdAt: string
  updatedAt: string
}

export type DatacenterSubnetRecord = {
  id: string
  cidr: string
  version: IpVersion
  name: string | null
  description: string | null
  memberCount: number
}

export type DatacenterMemberPin = {
  serverId: string
  address: string
  ipId: string
  networkId: string | null
}

export type DatacenterDetailRecord = DatacenterRecord & {
  subnets: DatacenterSubnetRecord[]
}

export type IpVersion = 4 | 6
export type IpAllocation = 'dedicated' | 'shared'
export type IpScope = 'public' | 'datacenter'

export type IpRecord = {
  id: string
  organizationId: string
  datacenterId: string | null
  networkId: string | null
  serverId: string | null
  address: string
  /** Server-derived from `address`, read-only — never send on create. */
  version: IpVersion
  allocation: IpAllocation
  scope: IpScope
  description: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export const IP_IN_USE_ERROR = 'ip_in_use'

export async function fetchVisibleWorkspaces(): Promise<{ workspaces: WorkspaceRecord[] }> {
  return await apiFetch(`${CLIENT_API}/workspaces`)
}

export const WORKSPACE_HAS_CHILDREN_ERROR = 'Cannot delete while child resources exist'

export const PROJECT_HAS_CHILDREN_ERROR = 'Cannot delete while child resources exist'

export const PROJECT_HAS_RUNNING_SERVICES_ERROR = 'project_has_running_services'
export const MANAGED_RUNTIME_PRESENT_ERROR = 'managed_runtime_present'

export const UNKNOWN_SYSTEM_COMPONENT_ERROR = 'unknown_system_component'
export const SYSTEM_COMPONENT_NOT_PROVISIONED_ERROR = 'system_component_not_provisioned'
export const SYSTEM_RECONCILE_UNAVAILABLE_ERROR = 'system_reconcile_unavailable'
export const SYSTEM_RESOURCE_IMMUTABLE_ERROR = 'system_resource_immutable'

export async function fetchWorkspace(id: string): Promise<{ workspace: WorkspaceRecord }> {
  return await apiFetch(`${CLIENT_API}/workspaces/${id}`)
}

export async function createWorkspace(body: {
  name?: string
  description?: string
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/workspaces`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateWorkspace(
  id: string,
  body: { name?: string; description?: string }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/workspaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteWorkspace(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/workspaces/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchVisibleEnvironments(
  projectId?: string
): Promise<{ environments: EnvironmentRecord[] }> {
  const params = projectId ? new URLSearchParams({ projectId }) : null
  const suffix = params ? `?${params.toString()}` : ''
  return await apiFetch(`${CLIENT_API}/environments${suffix}`)
}

export async function fetchVisibleProjects(
  workspaceId?: string
): Promise<{ projects: ProjectRecord[] }> {
  const params = workspaceId ? new URLSearchParams({ workspaceId }) : null
  const suffix = params ? `?${params.toString()}` : ''
  return await apiFetch(`${CLIENT_API}/projects${suffix}`)
}

export async function fetchProjectCatalog(): Promise<{ catalog: CatalogSummary[] }> {
  return await apiFetch(`${CLIENT_API}/project-catalog`)
}

export async function fetchProject(id: string): Promise<{ project: ProjectRecord }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}`)
}

export async function createProject(body: CreateProjectBody): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/projects`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** Apply type/catalog selection to an empty project (resumable setup). */
export async function configureProject(
  id: string,
  body: ConfigureProjectBody
): Promise<{ ok: true; alreadyConfigured: boolean }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}/configure`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateProject(
  id: string,
  body: {
    name?: string
    description?: string
    options?: {
      compose?: ComposeDocument
      containerNaming?: 'uuid' | 'custom'
      /** Optional default placement; `null` clears it. */
      defaultServerId?: string | null
    }
    workspaceId?: string
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteProject(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/projects/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchEnvironment(id: string): Promise<{ environment: EnvironmentRecord }> {
  return await apiFetch(`${CLIENT_API}/environments/${id}`)
}

export async function createEnvironment(body: {
  projectId: string
  name?: string
  description?: string
  serverId?: string | null
  metadata?: Record<string, unknown>
  options?: { compose?: ComposeDocument }
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/environments`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateEnvironment(
  id: string,
  body: {
    name?: string
    description?: string
    /** Whole-server placement pin; `null` clears it. */
    serverId?: string | null
    metadata?: Record<string, unknown>
    options?: { compose?: ComposeDocument }
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/environments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteEnvironment(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/environments/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchVariables(
  parentFilter: VariableParentFilter
): Promise<{ variables: VariableRecord[] }> {
  const params = new URLSearchParams(
    Object.entries(parentFilter).map(([key, value]) => [key, value])
  )
  return await apiFetch(`${CLIENT_API}/variables?${params.toString()}`)
}

export async function fetchVariable(id: string): Promise<{ variable: VariableRecord }> {
  return await apiFetch(`${CLIENT_API}/variables/${id}`)
}

export async function createVariable(body: CreateVariableBody): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/variables`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateVariable(
  id: string,
  body: {
    key?: string
    value?: string
    isSecret?: boolean
    isLiteral?: boolean
    forBuild?: boolean
    forRuntime?: boolean
    description?: string | null
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/variables/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteVariable(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/variables/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchVisibleServices(
  environmentId?: string
): Promise<{ services: ServiceRecord[] }> {
  const params = environmentId ? new URLSearchParams({ environmentId }) : null
  const suffix = params ? `?${params.toString()}` : ''
  return await apiFetch(`${CLIENT_API}/services${suffix}`)
}

/**
 * Not supported by the instance — services are created only by compose
 * reconcile. Kept only as a typed reference for the 400
 * `service_create_not_supported` contract; do not call from new UI code.
 */
export async function createService(
  environmentId: string,
  body: {
    name?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: ServiceOptions | Record<string, unknown>
  }
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/services`, {
    method: 'POST',
    body: JSON.stringify({ environmentId, ...body }),
  })
}

export async function updateService(
  id: string,
  body: {
    name?: string
    options?: ServiceOptions
    metadata?: Record<string, unknown> | null
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function fetchVisibleHostings(
  serviceId: string
): Promise<{ hostings: HostingRecord[] }> {
  const params = new URLSearchParams({ serviceId })
  return await apiFetch(`${CLIENT_API}/hostings?${params.toString()}`)
}

export async function createHosting(
  serviceId: string,
  body?: {
    name?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
    tlsId?: string | null
    ipId?: string | null
  }
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/hostings`, {
    method: 'POST',
    body: JSON.stringify({
      serviceId,
      ...(body?.name !== undefined ? { name: body.name } : {}),
      ...(body?.description !== undefined ? { description: body.description } : {}),
      ...(body?.metadata !== undefined ? { metadata: body.metadata } : {}),
      ...(body?.options !== undefined ? { options: body.options } : {}),
      ...(body?.tlsId !== undefined ? { tlsId: body.tlsId } : {}),
      ...(body?.ipId !== undefined ? { ipId: body.ipId } : {}),
    }),
  })
}

export async function updateHosting(
  hostingId: string,
  body: {
    name?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
    tlsId?: string | null
    ipId?: string | null
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/hostings/${hostingId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function fetchTlsLibrary(): Promise<{ tls: TlsRecord[] }> {
  return await apiFetch(`${CLIENT_API}/tls`)
}

export async function createTlsCertificate(body: {
  source: TlsSource
  name?: string
  certificatePem?: string
  privateKeyPem?: string
  hostnames?: string[]
  prefer?: number
  autoRenew?: boolean
  challengeType?: 'http-01' | 'dns-01'
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/tls`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteTlsCertificate(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/tls/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchContainers(
  serviceIdOrOptions?: string | { serviceId?: string; environmentId?: string; projectId?: string }
): Promise<{ containers: ContainerRecord[] }> {
  const options =
    typeof serviceIdOrOptions === 'string' ? { serviceId: serviceIdOrOptions } : serviceIdOrOptions
  const params = new URLSearchParams()
  if (options?.serviceId) params.set('serviceId', options.serviceId)
  if (options?.environmentId) params.set('environmentId', options.environmentId)
  // Whole-project scope in one call — never fan out per environment.
  if (options?.projectId) params.set('projectId', options.projectId)
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return await apiFetch(`${CLIENT_API}/containers${suffix}`)
}

export async function fetchContainer(id: string): Promise<{ container: ContainerRecord }> {
  return await apiFetch(`${CLIENT_API}/containers/${id}`)
}

/** Bounded on-demand `docker container logs` snapshot — never stored. */
export async function fetchContainerLogTail(
  containerId: string,
  tail?: number
): Promise<{ logs: string }> {
  const query = typeof tail === 'number' ? `?tail=${encodeURIComponent(String(tail))}` : ''
  return await apiFetch(`${CLIENT_API}/containers/${containerId}/logs${query}`)
}

export async function createContainer(body: {
  serviceId: string
  serverId: string
  containerId: string
  containerName: string
  status: string
  composeServiceName: string
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/containers`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateContainer(
  id: string,
  body: {
    containerId?: string
    containerName?: string
    status?: string
    composeServiceName?: string
    metadata?: Record<string, unknown> | null
    options?: Record<string, unknown>
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/containers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteContainer(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/containers/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchDatacenterNameSuggestions(options?: {
  unassignedOnly?: boolean
  limit?: number
}): Promise<{ suggestions: DatacenterNameSuggestion[] }> {
  const params = new URLSearchParams()
  if (options?.unassignedOnly === false) {
    params.set('unassignedOnly', '0')
  }
  if (options?.limit != null) {
    params.set('limit', String(options.limit))
  }
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return await apiFetch(`${CLIENT_API}/datacenters/name-suggestions${suffix}`)
}

export async function fetchDatacenters(): Promise<{
  datacenters: DatacenterRecord[]
}> {
  return await apiFetch(`${CLIENT_API}/datacenters`)
}

function normalizeDatacenterMemberPin(pin: DatacenterMemberPin): DatacenterMemberPin {
  return {
    serverId: pin.serverId,
    address: pin.address,
    ipId: pin.ipId ?? `${pin.serverId}:${pin.address}`,
    networkId: pin.networkId ?? null,
  }
}

function normalizeDatacenterDetail(datacenter: DatacenterDetailRecord): DatacenterDetailRecord {
  return {
    ...datacenter,
    privateCidrs: datacenter.privateCidrs ?? [],
    subnets: datacenter.subnets ?? [],
  }
}

export async function fetchDatacenter(id: string): Promise<{
  datacenter: DatacenterDetailRecord
  members: DatacenterMemberPin[]
}> {
  const body = await apiFetch<{
    datacenter: DatacenterDetailRecord
    members?: DatacenterMemberPin[]
  }>(`${CLIENT_API}/datacenters/${id}`)
  return {
    datacenter: normalizeDatacenterDetail(body.datacenter),
    members: (body.members ?? []).map(normalizeDatacenterMemberPin),
  }
}

export async function createDatacenter(body: {
  name?: string
  description?: string
  metadata?: Record<string, unknown>
  options?: DatacenterOptions
  /** Ignored — site CIDR is derived from the seed member's reported prefix. */
  cidr?: string
  /** At least one membership pin (daemon-reported private address). */
  members: { serverId: string; address: string }[]
  sourceServerId?: string
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/datacenters`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function addDatacenterMembers(
  datacenterId: string,
  members: { serverId: string; address: string }[]
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${datacenterId}/members`, {
    method: 'POST',
    body: JSON.stringify({ members }),
  })
}

/** Removes every pin for this server in the datacenter. */
export async function removeDatacenterMember(
  datacenterId: string,
  serverId: string
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${datacenterId}/members/${serverId}`, {
    method: 'DELETE',
  })
}

export async function createDatacenterSubnet(
  datacenterId: string,
  body: {
    cidr: string
    name?: string
    description?: string
  }
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${datacenterId}/subnets`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateDatacenterSubnet(
  datacenterId: string,
  networkId: string,
  body: {
    name?: string
    description?: string
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${datacenterId}/subnets/${networkId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteDatacenterSubnet(
  datacenterId: string,
  networkId: string
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${datacenterId}/subnets/${networkId}`, {
    method: 'DELETE',
  })
}

export async function updateDatacenter(
  id: string,
  body: Partial<{
    name: string | null
    description: string | null
    metadata: Record<string, unknown> | null
    options: DatacenterOptions | null
  }>
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteDatacenter(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/datacenters/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchIps(filters?: {
  datacenterId?: string
  serverId?: string
  networkId?: string
  scope?: IpScope
  allocation?: IpAllocation
}): Promise<{ ips: IpRecord[] }> {
  const params = new URLSearchParams()
  if (filters?.datacenterId) params.set('datacenterId', filters.datacenterId)
  if (filters?.serverId) params.set('serverId', filters.serverId)
  if (filters?.networkId) params.set('networkId', filters.networkId)
  if (filters?.scope) params.set('scope', filters.scope)
  if (filters?.allocation) params.set('allocation', filters.allocation)
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return await apiFetch(`${CLIENT_API}/ips${suffix}`)
}

export async function fetchIp(id: string): Promise<{ ip: IpRecord }> {
  return await apiFetch(`${CLIENT_API}/ips/${id}`)
}

export async function createIp(body: {
  address: string
  allocation: IpAllocation
  scope: IpScope
  description?: string
  datacenterId?: string | null
  networkId?: string | null
  serverId?: string | null
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/ips`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateIp(
  id: string,
  body: Partial<{
    description: string | null
    datacenterId: string | null
    networkId: string | null
    serverId: string | null
    metadata: Record<string, unknown> | null
    options: Record<string, unknown> | null
  }>
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/ips/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteIp(id: string): Promise<{ ok: true }> {
  const path = `${CLIENT_API}/ips/${id}`
  try {
    return await apiFetch<{ ok: true }>(path, { method: 'DELETE' })
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes('HTTP 409') &&
      err.message.includes(IP_IN_USE_ERROR)
    ) {
      throw new Error('This address is pinned to a hosting — unassign it first.')
    }
    throw err
  }
}

export async function fetchNetworks(filters?: {
  organizationId?: string
  datacenterId?: string
  serverId?: string
  kind?: NetworkKind
}): Promise<{ networks: NetworkRecord[] }> {
  const params = new URLSearchParams()
  if (filters?.organizationId) params.set('organizationId', filters.organizationId)
  if (filters?.datacenterId) params.set('datacenterId', filters.datacenterId)
  if (filters?.serverId) params.set('serverId', filters.serverId)
  if (filters?.kind) params.set('kind', filters.kind)
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return await apiFetch(`${CLIENT_API}/networks${suffix}`)
}

export async function createNetwork(body: {
  organizationId: string
  kind: CreatableNetworkKind
  datacenterId?: string | null
  serverId?: string | null
  cidr?: string | null
  name?: string
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/networks`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateNetwork(
  id: string,
  body: Partial<{
    kind: CreatableNetworkKind
    datacenterId: string | null
    serverId: string | null
    cidr: string | null
    name: string | null
    metadata: Record<string, unknown> | null
    options: Record<string, unknown> | null
  }>
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/networks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteNetwork(networkId: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/networks/${networkId}`, {
    method: 'DELETE',
  })
}

export async function createAccessGrant(
  body: CreateAccessBody
): Promise<{ ok: true; id: string; created?: boolean }> {
  return await apiFetch(`${CLIENT_API}/access`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function revokeAccessGrant(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/access/${id}`, {
    method: 'DELETE',
  })
}

export async function acceptInvitation(
  invitationId: string
): Promise<{ ok: true; organizationId: string }> {
  return await apiFetch(`${CLIENT_API}/invitations/${invitationId}/accept`, {
    method: 'POST',
  })
}

export type PublicUrlsResponse = {
  ok: boolean
  urls: string[]
  applied?: boolean
}

export type ApplyPublicUrlsResponse = {
  ok: boolean
  applied: boolean
  error?: string
}

export async function fetchPublicUrls(): Promise<PublicUrlsResponse> {
  return await apiFetch(`${ADMIN_API}/instance/public-urls`)
}

export async function savePublicUrls(urls: string[]): Promise<PublicUrlsResponse> {
  return await apiFetch(`${ADMIN_API}/instance/public-urls`, {
    method: 'PUT',
    body: JSON.stringify({ urls }),
  })
}

/**
 * Applying regenerates the control-plane certificate and reloads Caddy, so this
 * request commonly dies in transit (see `lib/control-plane-recovery.ts`). Pass a
 * `signal` to bound the wait: without one a dropped connection can leave the
 * socket hanging well past the control plane's own 180 s apply timeout.
 */
export async function applyPublicUrls(
  urls?: string[],
  signal?: AbortSignal
): Promise<ApplyPublicUrlsResponse> {
  return await apiFetch(`${ADMIN_API}/instance/public-urls/apply`, {
    method: 'POST',
    body: urls !== undefined ? JSON.stringify({ urls }) : undefined,
    signal,
  })
}

export type ReencryptSecretsCursor = {
  stage: 'variables' | 'tls' | 'principals' | 'email'
  afterId?: string
}

export type ReencryptSecretsResponse = {
  ok: boolean
  scanned: number
  reencrypted: number
  skipped: number
  failed: number
  completed: boolean
  cursor: ReencryptSecretsCursor | null
}

export type ReencryptSecretsRequest = {
  cursor?: ReencryptSecretsCursor | null
  limit?: number
}

export async function applyReencryptSecrets(
  body?: ReencryptSecretsRequest
): Promise<ReencryptSecretsResponse> {
  return await apiFetch(`${ADMIN_API}/secrets/reencrypt`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

export type DaemonCellSnapshot = {
  serverId: string
  version: number
  updatedAt: string
  hostname?: string
  machineKey?: string
  remoteAddress?: string
  keyId?: string
  connected: boolean
  connectedAt?: string
  lastInboundAt?: string
  lastOutboundAt?: string
  lastSeenAt?: string
  ips?: ServerReportedIp[]
  metadata?: {
    os?: ServerOsMetadata
    resources?: ServerHostResources
    ips?: ServerReportedIp[]
    timeSync?: ServerTimeSync
    geo?: ServerGeo
    cell?: {
      locationHint?: string
      generation?: number
      snapshotVersion?: number
    }
  }
}

export type FetchServerCellResponse = {
  ok: boolean
  snapshot: DaemonCellSnapshot
}

export type ServerStatusRecord = {
  serverId: string
  connected: boolean
  daemonStatus: 'online' | 'offline' | 'unknown' | null
  connectedAt: string | null
  statusChangedAt: string | null
  hostname: string | null
  remoteAddress: string | null
  geo: ServerGeo | null
  colocatedWithInstance: boolean
}

export async function fetchServersStatus(): Promise<{ servers: ServerStatusRecord[] }> {
  return await apiFetch(`${CLIENT_API}/servers/status`)
}

export async function fetchServerStatus(serverId: string): Promise<ServerStatusRecord> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/status`)
}

/**
 * **Admin/debug only.** Hits the Durable Object directly. Never call on a timer or from normal status views. Use `fetchServersStatus()` or `fetchServerStatus()` instead.
 * Future: global rate limiting should hook in here before this reaches the DO.
 * This endpoint hits the Durable Object directly — only call on explicit user action, never on a timer.
 */
export async function fetchServerCell(serverId: string): Promise<FetchServerCellResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/cell`)
}

export type ServerUpdateCommit = {
  commit: string
  buildId: string
  builtAt?: string
}

export type ServerUpdateStatus = {
  ok: boolean
  serverId: string
  channel: string
  current: ServerUpdateCommit | null
  target: (ServerUpdateCommit & { manifestUrl?: string }) | null
  updateAvailable: boolean
  colocatedWithInstance?: boolean
  updateBlocked?: boolean
  updateBlockedReason?: string
  status: 'idle' | 'updating' | 'error'
  targetStatus: 'ok' | 'unknown'
  targetError?: string
  lastUpdateError?: string
  queuedAt?: string
  canResetUpdateStatus?: boolean
}

export type ServerUpdateTriggerResult = {
  ok: boolean
  queued?: boolean
  status?: 'updating'
  serverId: string
  requestId?: string
  channel?: string
  error?: string
}

export type ServerUpdateResetResult = ServerUpdateStatus & {
  cleared: number
}

export type ServerBatchUpdateStatus = {
  ok: boolean
  channel: string
  target: (ServerUpdateCommit & { manifestUrl?: string }) | null
  targetStatus: 'ok' | 'unknown'
  targetError?: string
  servers: (ServerUpdateStatus & { serverId: string })[]
}

export type ServerBatchUpdateTriggerResult = {
  ok: boolean
  results: {
    serverId: string
    ok: boolean
    queued?: boolean
    status?: 'updating'
    requestId?: string
    channel?: string
    error?: string
  }[]
}

export async function fetchServerUpdate(serverId: string): Promise<ServerUpdateStatus> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/update`)
}

export async function fetchServersUpdateStatus(): Promise<ServerBatchUpdateStatus> {
  return await apiFetch(`${CLIENT_API}/servers/updates`)
}

export async function triggerServerUpdate(serverId: string): Promise<ServerUpdateTriggerResult> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/update`, {
    method: 'POST',
  })
}

export async function resetServerUpdateStatus(serverId: string): Promise<ServerUpdateResetResult> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/update/reset`, {
    method: 'POST',
  })
}

export async function triggerAllServerUpdates(): Promise<ServerBatchUpdateTriggerResult> {
  return await apiFetch(`${CLIENT_API}/servers/updates`, {
    method: 'POST',
  })
}

export type EmailSettingSource = 'env' | 'db' | 'default'

export type EmailSettingEntry = { value: string | null; source: EmailSettingSource }

export type EmailSettingsResponse = { ok: boolean; settings: Record<string, EmailSettingEntry> }

const ADMIN_EMAIL_SETTINGS_URL = `${ADMIN_API}/settings/email`

export async function fetchEmailSettings(): Promise<EmailSettingsResponse> {
  const raw = await apiFetch<{ settings: Record<string, EmailSettingEntry> }>(
    ADMIN_EMAIL_SETTINGS_URL
  )
  return { ok: true, settings: raw.settings ?? {} }
}

export async function saveEmailSettings(
  settings: Record<string, string | null>
): Promise<EmailSettingsResponse> {
  const raw = await apiFetch<{ settings: Record<string, EmailSettingEntry> }>(
    ADMIN_EMAIL_SETTINGS_URL,
    {
      method: 'PUT',
      body: JSON.stringify(settings),
    }
  )
  return { ok: true, settings: raw.settings ?? {} }
}

export type SignupSettingsResponse = {
  enabled: boolean
  dbValue: '0' | '1' | null
  isEnvForced: boolean
  envOverride: string | null
}

const ADMIN_SIGNUP_SETTINGS_URL = `${ADMIN_API}/settings/signup`

export async function fetchSignupSettings(): Promise<SignupSettingsResponse> {
  return await apiFetch<SignupSettingsResponse>(ADMIN_SIGNUP_SETTINGS_URL)
}

export async function saveSignupSettings(enabled: boolean): Promise<SignupSettingsResponse> {
  return await apiFetch<SignupSettingsResponse>(ADMIN_SIGNUP_SETTINGS_URL, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

/**
 * Webhook ingress paths, mirrored by hand from the control plane's
 * `GITHUB_WEBHOOK_PATH` / `GITLAB_WEBHOOK_PATH` in `turbopanel/src/surfaces.ts`.
 * That module is a different repo and runtime, so it cannot be imported here —
 * keep these two literals in step with it.
 */
export const GITHUB_WEBHOOK_PATH = '/webhook/github'
export const GITLAB_WEBHOOK_PATH = '/webhook/gitlab'

/**
 * A registered Git provider application, as either forge surface reports it.
 *
 * Presence-only: the sealed private key, OAuth client secret, and webhook
 * secret never leave the control plane, so the read shape carries
 * `hasPrivateKey` / `hasClientSecret` / `hasWebhookSecret` instead of a (masked
 * or otherwise) value.
 *
 * `organizationId === null` means the app is **instance-wide** — registered
 * once by an operator and usable by every organization. `readOnly` says whether
 * *this* viewer may edit it: an organization sees instance-wide apps so it can
 * connect through them, but only an instance admin can change one.
 */
export type ForgeSummary = {
  id: string
  organizationId: string | null
  provider: 'github' | 'gitlab'
  name: string
  baseUrl: string
  apiUrl: string | null
  externalAppId: string
  appSlug: string | null
  clientId: string | null
  redirectUri: string | null
  /** Opaque routing token in this app's webhook URL. */
  webhookRef: string
  webhookPath: string
  /** Absolute delivery URL; null when no public origin is configured. */
  webhookUrl: string | null
  readOnly: boolean
  hasPrivateKey: boolean
  hasClientSecret: boolean
  hasWebhookSecret: boolean
}

export type ForgeCreate = {
  provider: 'github' | 'gitlab'
  name: string
  externalAppId: string
  baseUrl?: string
  apiUrl?: string | null
  appSlug?: string | null
  clientId?: string | null
  redirectUri?: string | null
  privateKeyPem?: string | null
  clientSecret?: string | null
  webhookSecret?: string | null
}

/**
 * Partial write patch — omitted keys keep their stored value, so a save that
 * did not touch the private key must leave `privateKeyPem` out entirely rather
 * than send `''`. Nullable fields accept an explicit `null` to clear.
 * `provider` is immutable.
 */
export type ForgeUpdate = {
  name?: string
  externalAppId?: string
  baseUrl?: string
  apiUrl?: string | null
  appSlug?: string | null
  clientId?: string | null
  redirectUri?: string | null
  privateKeyPem?: string | null
  clientSecret?: string | null
  webhookSecret?: string | null
}

/**
 * Which collection to talk to.
 *
 * The two surfaces expose the same resource and differ only in scope: `admin`
 * manages instance-wide apps and is role-gated, `org` manages the current
 * organization's own and is gated on `organization:manage`. Everything below
 * takes the scope rather than duplicating the client.
 */
export type ForgeScope = 'admin' | 'org'

function forgesUrl(scope: ForgeScope, suffix = ''): string {
  const base = scope === 'admin' ? `${ADMIN_API}/forges` : `${CLIENT_API}/forges`
  return `${base}${suffix}`
}

export async function fetchForges(scope: ForgeScope): Promise<ForgeSummary[]> {
  const raw = await apiFetch<{ apps: ForgeSummary[] }>(forgesUrl(scope))
  return raw.apps
}

export async function createForge(
  scope: ForgeScope,
  input: ForgeCreate
): Promise<ForgeSummary> {
  const raw = await apiFetch<{ app: ForgeSummary }>(forgesUrl(scope), {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return raw.app
}

export async function updateForge(
  scope: ForgeScope,
  id: string,
  updates: ForgeUpdate
): Promise<ForgeSummary> {
  const raw = await apiFetch<{ app: ForgeSummary }>(
    forgesUrl(scope, `/${encodeURIComponent(id)}`),
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  )
  return raw.app
}

export async function deleteForge(scope: ForgeScope, id: string): Promise<void> {
  await apiFetch<void>(forgesUrl(scope, `/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  })
}

/** What the manifest flow needs to hand GitHub. */
export type GithubManifestStart = {
  manifest: Record<string, unknown>
  /** Where the browser POSTs the manifest. */
  createUrl: string
  state: string
}

/**
 * Ask the control plane for a GitHub App manifest.
 *
 * The returned manifest already points GitHub at the new app's own scoped
 * webhook URL, so the App is created self-identifying — nothing to copy by hand
 * afterwards.
 */
/**
 * Everything the wizard collects, in one shot.
 *
 * All of it is **creation-only** on GitHub's side — the name, the origin, the
 * webhook URL, the permission set are baked into the App and cannot be changed
 * from here afterwards. That is why the wizard asks rather than defaulting.
 */
export type GithubManifestStartInput = {
  name: string
  /** GitHub Enterprise origin; omit for github.com. */
  baseUrl?: string
  apiUrl?: string | null
  /** Blank means the acting user's personal account. */
  organizationLogin?: string | null
  /** Which published instance URL this App should deliver to. */
  webhookOrigin?: string | null
  /** `write` also subscribes the App to `pull_request`. */
  pullRequestAccess?: 'read' | 'write'
  customGitUser?: string | null
  customGitPort?: number | null
}

export async function startGithubAppManifest(
  scope: ForgeScope,
  input: GithubManifestStartInput
): Promise<GithubManifestStart> {
  return await apiFetch<GithubManifestStart>(
    forgesUrl(scope, '/github/manifest'),
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  )
}

/** What the provider currently holds for an app, as of a sync. */
export type ForgeProviderSnapshot = {
  permissions: Record<string, string>
  events: string[]
}

/**
 * Reconcile an app against the provider's own record of it.
 *
 * An operator can rename an App on GitHub and nothing announces it. Worse, the
 * slug builds the install URL — so a renamed App silently loses the ability to
 * connect new accounts until this runs.
 */
export async function syncForge(
  scope: ForgeScope,
  id: string
): Promise<{ app: ForgeSummary; provider: ForgeProviderSnapshot }> {
  return await apiFetch<{ app: ForgeSummary; provider: ForgeProviderSnapshot }>(
    forgesUrl(scope, `/${encodeURIComponent(id)}/sync`),
    { method: 'POST' }
  )
}

export type CommandStatus =
  | 'queued'
  | 'dispatching'
  | 'sent'
  | 'acked'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled'

export type PingLatencyBreakdown = {
  apiToConsumerMs: number | null
  consumerToCellMs: number | null
  cellToDaemonMs: number | null
  daemonProcessingMs: number | null
  daemonToRecordedMs: number | null
  totalRoundTripMs: number | null
}

export type CommandRecord = {
  id: string
  serverId: string
  actorEntityType: string
  actorEntityId: string
  type: string
  status: CommandStatus
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  attempts: number
  createdAt: string
  updatedAt: string
  queuedAt: string | null
  dispatchStartedAt: string | null
  sentAt: string | null
  ackedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  expiresAt: string | null
  latency?: PingLatencyBreakdown
}

export type CommandEnqueueResponse = {
  ok: true
  commandId: string
  status: string
  /** Present on environment.stop so callers can poll without re-resolving placement. */
  serverId?: string
}

export async function pingDaemon(serverId: string): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/ping`, {
    method: 'POST',
  })
}

export async function setServerHostname(
  serverId: string,
  hostname: string
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/hostname`, {
    method: 'POST',
    body: JSON.stringify({ hostname }),
  })
}

export async function rebootServer(serverId: string): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/reboot`, {
    method: 'POST',
  })
}

/**
 * Restart a provisioned system component on a server (e.g. hosting-ingress).
 * Returns the enqueue shape widened with `serverId` (mirrors ManagedCommandResponse).
 */
export async function restartSystemComponent(
  serverId: string,
  component: string
): Promise<CommandEnqueueResponse & { serverId: string }> {
  return await apiFetch(
    `${CLIENT_API}/servers/${serverId}/system/${encodeURIComponent(component)}/restart`,
    { method: 'POST' }
  )
}

export async function fetchCommand(serverId: string, commandId: string): Promise<CommandRecord> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/${commandId}`)
}

/**
 * Lean lifecycle projection returned by the batched status endpoint. Narrower
 * than {@link CommandRecord} on purpose — no dispatch payload, result summary,
 * or ping latency breakdown. Use {@link fetchCommand} when those are needed.
 */
export type CommandStatusRecord = {
  id: string
  serverId: string
  status: CommandStatus
  type: string
  queuedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  /** Whether a retained execution log exists for this command. */
  hasLog: boolean
}

/**
 * One request for many tracked command ids. Ids the session cannot read are
 * omitted from the response rather than failing the batch.
 */
export async function fetchCommandStatuses(ids: readonly string[]): Promise<CommandStatusRecord[]> {
  if (ids.length === 0) return []
  const body = await apiFetch<{ ok: true; commands: CommandStatusRecord[] }>(
    `${CLIENT_API}/commands/status`,
    {
      method: 'POST',
      body: JSON.stringify({ ids: [...ids] }),
    }
  )
  return body.commands
}

/**
 * One read of a command transcript (`GET /servers/:id/commands/:commandId/log`).
 *
 * `exists: false` is the "not started" state — the control plane deliberately
 * returns an empty body instead of 404 so a poll loop started before the first
 * daemon chunk does not have to special-case an error status.
 */
export type CommandLogResponse = {
  ok: true
  /** Transcript bytes decoded as UTF-8 (NDJSON `CommandOutputEvent` lines). */
  text: string
  /** Cursor to pass back as `from` on the next poll. */
  nextSeq: number
  /** Whether the transcript is final (the command reached a terminal status). */
  sealed: boolean
  /** Whether output was dropped after the retained-size cap. */
  truncated: boolean
  /** Whether any transcript exists at all. */
  exists: boolean
}

/**
 * Read a transcript from `from` (a chunk sequence, not a byte offset). Poll with
 * the previous response's `nextSeq`; stop once `sealed` is true.
 */
export async function fetchCommandLog(
  serverId: string,
  commandId: string,
  options?: Readonly<{ from?: number; max?: number }>
): Promise<CommandLogResponse> {
  const params = new URLSearchParams()
  if (typeof options?.from === 'number' && options.from > 0) {
    params.set('from', String(options.from))
  }
  if (typeof options?.max === 'number' && options.max > 0) {
    params.set('max', String(options.max))
  }
  const serialized = params.toString()
  const query = serialized.length > 0 ? `?${serialized}` : ''
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/commands/${commandId}/log${query}`)
}

/**
 * Which of a container's two output streams a line came from. Mirrors the
 * control plane's `ContainerLogStream` (`src/lib/container-logs/types.ts`).
 */
export type ContainerLogStream = 'stdout' | 'stderr'

/**
 * One container log line, fully identified.
 *
 * Container output is an **analytics row** stamped with
 * `organization → server → environment → service → container`, not a keyed
 * blob like an execution-log transcript. The two are read completely
 * differently and are deliberately not unified — see the control plane's
 * `src/lib/container-logs/AGENTS.md`.
 */
export type ContainerLogEventRecord = {
  /** ISO-8601 UTC timestamp of the line (millisecond precision). */
  timestamp: string
  organizationId: string
  serverId: string
  /** Null for containers outside an environment. */
  environmentId: string | null
  /** Null for one-off containers with no compose service. */
  serviceId: string | null
  containerId: string
  stream: ContainerLogStream
  message: string
}

/**
 * One deploy attempt against one server, read from the append-only `command`
 * table. `id` **is** the command id — pass it to {@link fetchCommandLog} for the
 * transcript.
 */
export type DeploymentHistoryRecord = {
  id: string
  /** Alias of {@link DeploymentHistoryRecord.id}, for transcript call sites. */
  commandId: string
  generation: number | null
  desiredHash: string | null
  /** Per-service replica counts captured at enqueue; null for older rows. */
  replicaCounts: Record<string, number> | null
  serverId: string
  serverName: string | null
  status: CommandStatus
  actorEntityType: string
  actorEntityId: string
  queuedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  /** Wall-clock duration of the attempt; null while still running. */
  durationMs: number | null
  errorCode: string | null
  errorMessage: string | null
  /** Whether a retained execution log exists (resolved store-side). */
  hasLog: boolean
}

/** Per-server convergence for one generation, read from *current* state. */
export type DeploymentServerConvergence = {
  serverId: string
  serverName: string | null
  status: CommandStatus
  appliedGeneration: number | null
  desiredGeneration: number | null
  deploymentStatus: 'pending' | 'applying' | 'applied' | 'failed' | 'draining' | null
  replicaCounts: Record<string, number> | null
  totalReplicas: number | null
}

/**
 * One deploy attempt plus its whole fan-out. `commands[]` holds every
 * `environment.deploy` command sharing the anchor's generation — one per
 * participating host, complete and unpaginated.
 */
export type DeploymentDetailRecord = {
  id: string
  environmentId: string
  generation: number | null
  desiredHash: string | null
  replicaCounts: Record<string, number>
  totalReplicas: number
  commands: DeploymentHistoryRecord[]
  servers: DeploymentServerConvergence[]
}

export type DeploymentHistoryPage = {
  ok: true
  deployments: DeploymentHistoryRecord[]
  /** Pass back as `before` for the next (older) page; null at the end. */
  nextCursor: string | null
}

/**
 * Deploy history for one environment, newest first. Keyset-paginated by command
 * id (UUIDv7, so id order matches time order) — never a polling read.
 */
export async function fetchEnvironmentDeployments(
  environmentId: string,
  options?: Readonly<{ limit?: number; before?: string }>
): Promise<DeploymentHistoryPage> {
  const params = new URLSearchParams()
  if (typeof options?.limit === 'number' && options.limit > 0) {
    params.set('limit', String(options.limit))
  }
  if (options?.before) {
    params.set('before', options.before)
  }
  const serialized = params.toString()
  const query = serialized.length > 0 ? `?${serialized}` : ''
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/deployments${query}`)
}

/** One deploy attempt and its multi-server fan-out. `deploymentId` is a command id. */
export async function fetchEnvironmentDeployment(
  environmentId: string,
  deploymentId: string
): Promise<{ ok: true; deployment: DeploymentDetailRecord }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/deployments/${deploymentId}`)
}

/**
 * How a push to a repository becomes a deploy.
 *
 * `immediate` deploys on push; `checks_passed` parks the SHA until the provider
 * reports an all-green result for it — a GitHub check **suite**, or a GitLab
 * **pipeline**; `disabled` leaves the repository wired up but unarmed. This is a property of the `repository` row, not of the
 * compose binding — one repository connected to several services has one
 * policy, and the webhook surface reads it from the row.
 */
export type RepositoryAutoDeploy = 'immediate' | 'checks_passed' | 'disabled'

export const REPOSITORY_AUTO_DEPLOY_OPTIONS: readonly {
  value: RepositoryAutoDeploy
  label: string
  hint: string
}[] = [
  {
    value: 'immediate',
    label: 'Immediately after push',
    hint: 'Every push to the tracked branch deploys.',
  },
  {
    value: 'checks_passed',
    label: 'Only after CI passes',
    hint:
      'A pushed commit waits for a green GitHub check suite (or GitLab pipeline) ' +
      'before it deploys.',
  },
  {
    value: 'disabled',
    label: 'Disabled',
    hint: 'The repository stays connected; deploys are manual only.',
  },
]

/**
 * Which provider backs a repository, and therefore which connect flow created it.
 *
 * `git` is the generic SSH/HTTPS lane: a clone URL plus a deploy key, no
 * provider API behind it. `gitlab` can be *either* — an OAuth connection or a
 * deploy key — which is why the create form asks.
 */
export const REPOSITORY_PROVIDERS = ['github', 'gitlab', 'git'] as const
export type RepositoryProvider = (typeof REPOSITORY_PROVIDERS)[number]

export const REPOSITORY_PROVIDER_OPTIONS: readonly {
  value: RepositoryProvider
  label: string
  hint: string
}[] = [
  {
    value: 'github',
    label: 'GitHub App',
    hint: 'Pick a repository the installed GitHub App can already read.',
  },
  {
    value: 'gitlab',
    label: 'GitLab',
    hint:
      'Connect a GitLab account over OAuth, or paste a project URL and use a ' +
      'generated read-only deploy key.',
  },
  {
    value: 'git',
    label: 'Other Git host',
    hint: 'Any https or ssh clone URL, authorized by a deploy key.',
  },
]

/** An org-owned Git repository binding services attach to by `sourceId`. */
export type RepositoryRecord = {
  id: string
  organizationId: string
  connectionId: string | null
  serviceId: string | null
  environmentId: string | null
  secretId: string | null
  provider: RepositoryProvider
  repositoryUrl: string
  repositoryExternalId: string | null
  defaultBranch: string | null
  subdirectory: string | null
  autoDeploy: RepositoryAutoDeploy
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/**
 * A provider connection this organization can read repositories through.
 *
 * GitHub calls it an App installation; GitLab has no per-repository install, so
 * the row records the OAuth-connected account instead. `provider` is what tells
 * the two apart in a picker that lists both.
 */
export type GitConnectionRecord = {
  id: string
  organizationId: string
  /**
   * The registered forge this connection was granted through.
   *
   * What lets the repository picker group connections under their forge, which
   * is the top level of the forge -> account -> repository hierarchy.
   */
  forgeId: string
  provider: string
  externalInstallationId: string
  accountLogin: string | null
  accountType: string | null
  suspendedAt: string | null
  suspended: boolean
  createdAt: string
  updatedAt: string
}

/** Narrow repository summary the connect-repository picker renders. */
export type GitRepositorySummary = {
  id: string
  fullName: string
  defaultBranch: string | null
  private: boolean
  cloneUrl: string | null
}

export async function fetchRepositories(): Promise<{ repositories: RepositoryRecord[] }> {
  return await apiFetch(`${CLIENT_API}/repositories`)
}

/** One probed file, as `GET /repositories/:id/inspect` reports it. */
export type RepositoryProbedFile = {
  path: string
  found: boolean
  content?: string
  bytes?: number
  reason?: 'not_found' | 'too_large' | 'not_a_file' | 'binary'
}

export type RepositoryInspection = {
  commitSha: string
  /** Which lane answered — provider REST, or a clone on a connected server. */
  via: 'provider' | 'daemon'
  files: RepositoryProbedFile[]
  entries: { path: string; kind: 'file' | 'dir'; bytes?: number }[]
}

/**
 * Read a connected repository so the wizard can see what is in it.
 *
 * The probe set is fixed server-side, not passed from here: a caller-supplied
 * path list would widen what a compromised session can learn from "do these
 * filenames exist" to "read any file in any connected repository".
 */
export async function inspectRepository(
  repositoryId: string,
  ref?: string,
): Promise<RepositoryInspection> {
  const query = ref && ref.length > 0 ? `?ref=${encodeURIComponent(ref)}` : ''
  return await apiFetch(`${CLIENT_API}/repositories/${repositoryId}/inspect${query}`)
}

/**
 * One repository plus the instance-wide webhook facts folded onto the read.
 *
 * The three extra fields are properties of the *instance*, not of the row, so
 * `GET /repositories` deliberately omits them — repeating an identical pair on
 * every entry would say nothing per row. They are also only attached for
 * `github` and `gitlab`: a generic `git` repository has no provider webhook to
 * point anywhere, which is why each one is optional here rather than nullable.
 *
 * `reachabilityNote` is non-null exactly when this instance looks unreachable
 * from the public internet, and is the only one of the three this org-facing
 * page renders — the address itself belongs to the admin Git-providers surface,
 * which is where an operator can actually act on it.
 */
export type RepositoryDetailRecord = RepositoryRecord & {
  /** Address to paste into the provider's webhook settings (github/gitlab only). */
  webhookUrl?: string | null
  /** Whether a provider could deliver to {@link RepositoryDetailRecord.webhookUrl}. */
  webhookReachable?: boolean
  /** Why deliveries cannot arrive, when they cannot. Null when they can. */
  reachabilityNote?: string | null
}

export async function fetchRepository(
  repositoryId: string
): Promise<{ repository: RepositoryDetailRecord }> {
  return await apiFetch(`${CLIENT_API}/repositories/${repositoryId}`)
}

export async function fetchGitConnections(): Promise<{
  connections: GitConnectionRecord[]
}> {
  return await apiFetch(`${CLIENT_API}/repositories/connections`)
}

export async function fetchConnectionRepositories(
  connectionId: string
): Promise<{ repositories: GitRepositorySummary[] }> {
  return await apiFetch(
    `${CLIENT_API}/repositories/connections/${connectionId}/repositories`,
  )
}

/**
 * Bind a repository to this organization, reusing the binding if it exists.
 *
 * This is how a repository gets attached now: the operator picks
 * **forge -> account -> repository** while creating or editing a project, and
 * this resolves that to a `repository` row underneath. The row itself never
 * appears in the console as a thing to manage.
 *
 * **Idempotent.** Two projects on the same repository share one row rather than
 * making two — which matters because auto-deploy and the default branch live on
 * the row, so duplicates would let one repository hold two different policies
 * while a single push fanned out to both.
 *
 * Must resolve *before* the project save that references it: an unknown
 * `sourceId` (compose document field, intentionally still named `source`) fails
 * the compose lint.
 */
export async function attachRepository(input: {
  connectionId: string
  repositoryExternalId: string
  repositoryUrl: string
  defaultBranch?: string | null
}): Promise<{ ok: true; id: string; reused: boolean }> {
  return await apiFetch<{ ok: true; id: string; reused: boolean }>(
    `${CLIENT_API}/repositories/attach`,
    { method: 'POST', body: JSON.stringify(input) }
  )
}

/**
 * Register a repository as an org-owned binding a compose service can bind to.
 *
 * `connectionId` is what makes a GitHub repository cloneable — the instance
 * mints a short-lived installation token per deploy from it, so a repository
 * created without one cannot be built. A GitLab repository is cloneable through
 * either a `connectionId` (its OAuth connection) or a `secretId` (a generated
 * deploy key); `git` repositories only ever use the latter.
 */
export async function createRepository(
  body: Readonly<{
    provider: RepositoryProvider
    repositoryUrl: string
    connectionId?: string | null
    /**
     * Deploy key from {@link createGitlabDeployKey}. For `gitlab`, supply
     * exactly one of this or `connectionId` — the instance rejects both.
     */
    secretId?: string | null
    repositoryExternalId?: string | null
    defaultBranch?: string | null
    autoDeploy?: RepositoryAutoDeploy
  }>
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/repositories`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateRepository(
  repositoryId: string,
  patch: Readonly<{
    autoDeploy?: RepositoryAutoDeploy
    defaultBranch?: string | null
    subdirectory?: string | null
  }>
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/repositories/${repositoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

/**
 * Disconnect a repository from the organization.
 *
 * Answers **409** {@link REPOSITORY_REFERENCED_BY_COMPOSE_ERROR} while any stored
 * compose document still names the repository in `x-turbopanel.source.sourceId` —
 * the row is what a bound service clones through, so dropping it would leave a
 * service that cannot build. Detach it from the service first.
 */
export async function deleteRepository(repositoryId: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/repositories/${repositoryId}`, {
    method: 'DELETE',
  })
}

/**
 * Query string for a connect redirect.
 *
 * `forgeId` names which registered application to connect through — an instance
 * may hold several per provider. `organizationId` is there because these are
 * **top-level browser navigations**, and a navigation carries no
 * `X-Turbopanel-Organization-Id`; the control plane accepts the query param as
 * the header's equivalent. Neither value is a secret: the session cookie
 * and the signed `state` are what authorize the flow.
 */
function connectQuery(forgeId: string): string {
  const params = new URLSearchParams({ forgeId })
  const organizationId = getActiveOrganizationId()
  if (organizationId) params.set('organizationId', organizationId)
  return params.toString()
}

/**
 * Where to send the browser to install a GitHub App on an account.
 *
 * Deliberately a URL rather than a fetch, exactly like
 * {@link gitlabOauthConnectUrl}: the endpoint answers `302` to GitHub's
 * installation page carrying a signed `state`, and the operator has to *land*
 * there to choose an account and pick repositories. Following it with `fetch`
 * would consume the redirect and show nothing.
 */
export function githubAppInstallUrl(forgeId: string): string {
  return controlPlaneUrl(`${CLIENT_API}/repositories/github/install?${connectQuery(forgeId)}`)
}

/**
 * Where to send the browser to connect a GitLab account.
 *
 * Deliberately a URL rather than a fetch: the endpoint answers `302` to
 * GitLab's authorize page, and the operator has to *land* there to approve the
 * grant. Following it with `fetch` would consume the redirect and show nothing.
 */
export function gitlabOauthConnectUrl(forgeId: string): string {
  return controlPlaneUrl(`${CLIENT_API}/repositories/gitlab/oauth?${connectQuery(forgeId)}`)
}

/** What the deploy-key endpoint hands back — the public half, exactly once. */
export type GitDeployKey = {
  ok: true
  /** Pass as `secretId` when creating the repository. */
  secretId: string
  /** `ssh-ed25519 …` line to add to the project as a **read-only** Deploy Key. */
  publicKey: string
  fingerprint: string
}

/**
 * Mint a read-only deploy keypair for a GitLab repository that will not use OAuth.
 *
 * The private half never leaves the instance unsealed; the public half comes
 * back **once**, here, and is not retrievable afterwards — so a caller that
 * drops it has to mint a new key. This is the recommended non-human path: the
 * key belongs to the project, so no individual leaving the organization breaks
 * its deploys.
 */
export async function createGitlabDeployKey(
  body: Readonly<{ name: string }>
): Promise<GitDeployKey> {
  return await apiFetch(`${CLIENT_API}/repositories/gitlab/deploy-keys`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * One Git-backed release of one compose service.
 *
 * Read from the append-only `command` history (`command.context.releases[]`),
 * not from `deployment` — a release exists *per service*, while a deployment
 * row is per `(environment, server)` and is overwritten on every redeploy. The
 * `commandId` is the deploy that published it, so it fetches the build
 * transcript through {@link fetchCommandLog} exactly like a history row does.
 */
/** One host's attempt at a release — the fan-out row behind a folded record. */
export type ReleaseAttempt = {
  commandId: string
  serverId: string
  status: CommandStatus
}

export type ReleaseRecord = {
  /** Representative attempt's command — the transcript this row opens. */
  commandId: string
  /** Representative attempt's server. See {@link ReleaseRecord.attempts}. */
  serverId: string
  /**
   * Every host this release was dispatched to.
   *
   * A release belongs to the *environment*, not to a server: one deploy fans out
   * to every participating host under a single release id, and the row's
   * `status` is the aggregate over all of them — `succeeded` only when every
   * host published it, which is the condition a rollback needs.
   */
  attempts: ReleaseAttempt[]
  composeServiceName: string
  releaseId: string
  sourceId: string
  commitSha: string
  /** Commit subject / author, when the source provider resolved them. */
  commitMessage?: string
  commitAuthor?: string
  /**
   * Railpack lane only: the OCI image this release resolved to, and the pinned
   * build inputs that produced it.
   *
   * A Railpack release publishes no directory — the image tag *is* its identity,
   * and rolling one back redeploys that tag rather than re-pointing `current`.
   * Absent on every native (directory) release, which is how the two lanes are
   * told apart in the list.
   */
  imageTag?: string
  railpackFrontendVersion?: string
  railpackPlanVersion?: string
  /** Aggregate status across every host in {@link ReleaseRecord.attempts}. */
  status: CommandStatus
  queuedAt: string | null
  finishedAt: string | null
  /**
   * The release this service is currently believed to be running: the newest
   * *succeeded* release for it. History-derived — the daemon does not report
   * its on-host `current` symlink back over the wire — but correct for every
   * change that went through this control plane, rollbacks included.
   */
  isLive: boolean
  /** Set when this row is itself a rollback: the release it re-promoted. */
  rollbackToReleaseId?: string
}

export type ServiceReleasesResponse = {
  ok: true
  releases: ReleaseRecord[]
}

/**
 * Releases for one environment, newest first. Pass `composeServiceName` to
 * narrow to a single service (the rollback picker always does).
 */
export async function fetchServiceReleases(
  environmentId: string,
  composeServiceName?: string,
  options?: Readonly<{ limit?: number }>
): Promise<ServiceReleasesResponse> {
  const params = new URLSearchParams()
  if (composeServiceName) params.set('composeServiceName', composeServiceName)
  if (typeof options?.limit === 'number' && options.limit > 0) {
    params.set('limit', String(options.limit))
  }
  const serialized = params.toString()
  const query = serialized.length > 0 ? `?${serialized}` : ''
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/releases${query}`)
}

/**
 * Re-promote an already-published release for one service.
 *
 * Enqueues an ordinary `environment.deploy` — the control plane does not fork a
 * second command type for rollback — so the returned `commandId` is tracked and
 * transcript-read exactly like a deploy's.
 */
export async function rollbackEnvironment(
  environmentId: string,
  body: Readonly<{ composeServiceName: string; releaseId: string }>
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/rollback`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export class DeployHealthCheckMissingError extends Error {
  readonly code = 'health_check_missing'
  readonly required: boolean
  readonly services: string[]

  constructor(required: boolean, services: string[]) {
    super('health_check_missing')
    this.name = 'DeployHealthCheckMissingError'
    this.required = required
    this.services = services
  }
}

export type ResourceLimitViolation = {
  scope: 'organization' | 'server'
  field: string
  limit: number
  requested: number
}

export class DeployResourceLimitExceededError extends Error {
  readonly code = 'resource_limit_exceeded'
  readonly violations: ResourceLimitViolation[]

  constructor(violations: ResourceLimitViolation[]) {
    super('resource_limit_exceeded')
    this.name = 'DeployResourceLimitExceededError'
    this.violations = violations
  }
}

type DeployConflictBody = {
  error?: string
  required?: boolean
  services?: string[]
  violations?: ResourceLimitViolation[]
}

async function throwIfDeployConflict(response: Response): Promise<void> {
  if (response.status !== 409) {
    return
  }
  try {
    const errorBody = (await response.json()) as DeployConflictBody
    if (errorBody.error === 'health_check_missing') {
      throw new DeployHealthCheckMissingError(
        errorBody.required === true,
        Array.isArray(errorBody.services) ? errorBody.services : []
      )
    }
    if (errorBody.error === 'resource_limit_exceeded') {
      throw new DeployResourceLimitExceededError(
        Array.isArray(errorBody.violations) ? errorBody.violations : []
      )
    }
    if (errorBody.error === 'fabric_reconcile_pending') {
      throw new Error(formatFetchFailureDetail(409, 'fabric_reconcile_pending'))
    }
  } catch (err) {
    if (
      err instanceof DeployHealthCheckMissingError ||
      err instanceof DeployResourceLimitExceededError ||
      (err instanceof Error && err.message.includes('fabric_reconcile_pending'))
    ) {
      throw err
    }
    // Fall through to generic error handling.
  }
}

async function throwClientFetchFailed(path: string, response: Response): Promise<never> {
  let detail = formatFetchFailureDetail(response.status)
  try {
    const errorBody = (await response.json()) as { error?: string }
    if (errorBody.error) {
      detail = formatFetchFailureDetail(response.status, errorBody.error)
    }
  } catch {
    // Non-JSON error body.
  }
  throw new Error(`${path} failed: ${detail}`)
}

export async function deployEnvironment(
  environmentId: string,
  body?: { acknowledgeHealthCheckWarnings?: boolean; noCache?: boolean }
): Promise<CommandEnqueueResponse> {
  const path = `${CLIENT_API}/environments/${environmentId}/deploy`
  const resolvedOrgId = getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const response = await fetch(controlPlaneUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body ?? {}),
  })

  await throwIfDeployConflict(response)

  if (!response.ok) {
    await throwClientFetchFailed(path, response)
  }

  return (await response.json()) as CommandEnqueueResponse
}

export type DeployPreviewWarning = {
  code:
    | 'empty_compose'
    | 'resource_limit_exceeded'
    | 'health_check_missing'
    | 'docker_external_network_unregistered'
    | 'fabric_reconcile_failed'
    | 'fabric_reconcile_pending'
    | 'site_principal_ambiguous'
  message: string
  details?: Record<string, unknown>
}

/**
 * Role of a compiled compose file. New responses use `'runtime'`
 * (`compose.yaml`). Older project/environment/platform roles may still appear
 * and must not be shown as what the daemon runs.
 */
export type ComposeFileRole = 'project' | 'environment' | 'platform' | 'runtime'

/**
 * Where a prepared compose layer was produced. Mirrors
 * `EnvironmentDeployComposeFileSource` on the instance command contract.
 * Only `inline` is emitted today; `repository` is reserved for later.
 */
export type ComposeFileSource = 'inline' | 'repository'

/**
 * One file in deploy-preview `composeFiles[]` (same wire shape as
 * `environment.deploy` → `EnvironmentDeployComposeFile`). Prefer `role:
 * 'runtime'` as the compiled snapshot the daemon writes as `compose.yaml`.
 */
export type DeployPreviewComposeFile = {
  filename: string
  role: ComposeFileRole
  /** Provenance; omit/`inline` today. */
  source?: ComposeFileSource
  /**
   * Repo-relative original path when `source: 'repository'`.
   * Populated once repository-pinned layers are supported; unused today.
   */
  path?: string
  content: string
}

/** Per-server compiled compose when an environment is scheduled across hosts. */
export type DeployPreviewServer = {
  serverId: string
  name: string
  composeFiles: DeployPreviewComposeFile[]
  services: string[]
}

/** Compiled Compose standalone secret (paths only — never values). */
/**
 * What one Git-backed service would check out and build, from the prepare
 * layer's already-resolved `sourceMaterial[]`.
 *
 * Preview never mints a token or seals a secret, so this is shape only —
 * and deliberately only the non-secret half: which source, which ref, which
 * commit, and the release id the deploy would publish under.
 */
export type DeployPreviewSource = {
  composeServiceName: string
  sourceId: string
  provider: 'github' | 'git'
  /** Secret-free by contract on both wire parsers. */
  cloneUrl: string
  ref: string
  commitSha: string
  releaseId: string
  subdirectory?: string
}

export type DeployPreviewSecretPlanEntry = {
  key: string
  composeServiceName: string
  source: string
  target: string
  relativePath: string
  forBuild: boolean
  forRuntime: boolean
}

export type DeployPreviewResponse = {
  ok: true
  /**
   * Compiled runtime snapshot (`role: 'runtime'` `compose.yaml`) for the
   * first participating server.
   */
  composeFiles: DeployPreviewComposeFile[]
  /** Per-host compiled compose when the scheduler splits services across hosts. Omitted for a single-server / whole-environment pin. */
  servers?: DeployPreviewServer[]
  /** Git-backed services this deploy would build. Omitted when there are none. */
  sources?: DeployPreviewSource[]
  projectName: string
  containers: {
    serviceId: string
    composeServiceName: string
    containerName: string
    ordinal: number
    role: ContainerRole
  }[]
  volumes: {
    storageId: string
    composeKey: string
    volumeName: string
  }[]
  warnings: DeployPreviewWarning[]
  /** Non-secret Compose project `.env` (real values; secrets are omitted). */
  envFile?: string
  /** Host/container secret file plan — no envelopes or plaintext. */
  secretPlan?: DeployPreviewSecretPlanEntry[]
}

/**
 * Compiled runtime compose deploy would write (same prepare path), with secret
 * values redacted. May allocate containers / register volumes idempotently.
 */
export async function fetchDeployPreview(environmentId: string): Promise<DeployPreviewResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/deploy-preview`)
}

export type StorageKind = 'volume' | 'directory' | 'file'
export type StorageAccessMode = 'single_writer' | 'multi_reader' | 'multi_writer'
export type StorageRetention = 'retain' | 'delete'
export type CopyProvider = 'docker' | 'path'
export type CopyRole = 'primary' | 'replica' | 'scratch' | 'archive'
export type CopyState =
  'pending' | 'materializing' | 'ready' | 'syncing' | 'stale' | 'failed' | 'retiring'

export type StorageCopyRecord = {
  id: string
  storageId: string
  serverId: string | null
  secretId: string | null
  provider: string
  role: string
  state: string
  path: string | null
  endpoint: string | null
  generation: number
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  resolvedSourcePath: string | null
}

export type StorageMountRecord = {
  id: string
  storageId: string
  serviceId: string
  destinationPath: string
  subpath: string | null
  readOnly: boolean
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type StorageRecord = {
  id: string
  organizationId: string
  workspaceId: string | null
  projectId: string | null
  environmentId: string | null
  serviceId: string | null
  kind: StorageKind
  name: string
  accessMode: StorageAccessMode
  retention: StorageRetention
  generation: number
  principalId: string | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  copies: StorageCopyRecord[]
  mounts: StorageMountRecord[]
}

export type CreateStorageBody = {
  environmentId?: string
  projectId?: string
  workspaceId?: string
  serviceId?: string
  kind: StorageKind
  name: string
  accessMode?: StorageAccessMode
  retention?: StorageRetention
  principalId?: string | null
  metadata?: Record<string, unknown>
  options?: Record<string, unknown>
  copy?: {
    provider: CopyProvider
    serverId: string
    path?: string
    role?: CopyRole
    state?: CopyState
  }
  mount?: {
    serviceId: string
    destinationPath: string
    subpath?: string
    readOnly?: boolean
  }
}

export async function fetchStorage(
  parentFilter: { environmentId: string } | { projectId: string } | { serviceId: string }
): Promise<{ storage: StorageRecord[] }> {
  const params = new URLSearchParams(
    Object.entries(parentFilter).map(([key, value]) => [key, value])
  )
  return await apiFetch(`${CLIENT_API}/storage?${params.toString()}`)
}

export async function createStorage(body: CreateStorageBody): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/storage`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateStorage(
  id: string,
  body: {
    name?: string
    accessMode?: StorageAccessMode
    retention?: StorageRetention
    principalId?: string | null
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/storage/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function updateStorageMount(
  storageId: string,
  mountId: string,
  body: {
    destinationPath?: string
    subpath?: string | null
    readOnly?: boolean
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/storage/${storageId}/mounts/${mountId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteStorage(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/storage/${id}`, {
    method: 'DELETE',
  })
}

export type TagRecord = {
  id: string
  organizationId: string
  name: string
  description: string | null
  color: string | null
  createdAt: string
  updatedAt: string
}

export const TAGGABLE_PARENT_KEYS = [
  'serverId',
  'workspaceId',
  'projectId',
  'environmentId',
  'serviceId',
  'datacenterId',
  'storageId',
] as const

export type TaggableParentKey = (typeof TAGGABLE_PARENT_KEYS)[number]

export const TASK_LIST_KEYS = ['serviceId', 'environmentId'] as const

export type TaskListKey = (typeof TASK_LIST_KEYS)[number]

/**
 * Object with exactly one selected key; every other allowed key is `never` so
 * a value held in a variable cannot satisfy two parents at once.
 */
type ExclusiveStringKeys<Keys extends string> = {
  [K in Keys]: { readonly [P in K]: string } & {
    readonly [P in Exclude<Keys, K>]?: never
  }
}[Keys]

/**
 * Exactly one parent. Structurally exclusive so a caller cannot send two.
 */
export type TaggableParentFilter = ExclusiveStringKeys<TaggableParentKey>

export type MarkerRecord = {
  id: string
  tagId: string
  createdAt: string
  serverId?: string
  workspaceId?: string
  projectId?: string
  environmentId?: string
  serviceId?: string
  datacenterId?: string
  storageId?: string
}

/**
 * Require exactly one populated key from `allowedKeys`. Extra keys (e.g.
 * `tagIds`) are ignored. Throws rather than silently picking the first match.
 */
export function requireExclusiveQueryEntry<K extends string>(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: readonly K[],
): readonly [K, string] {
  const populated: K[] = []
  for (const key of allowedKeys) {
    const value = record[key]
    if (typeof value !== 'string' || value.length === 0) continue
    populated.push(key)
  }
  if (populated.length !== 1) {
    throw new TypeError(
      `Expected exactly one of ${allowedKeys.join(', ')}; received ${String(populated.length)}`,
    )
  }
  const key = populated[0]
  if (!key) {
    throw new TypeError(
      `Expected exactly one of ${allowedKeys.join(', ')}; received 0`,
    )
  }
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Expected ${key} to be a non-empty string`)
  }
  return [key, value]
}

export async function fetchTags(
  scope?: TaggableParentFilter,
): Promise<{ tags: TagRecord[] }> {
  if (!scope) return await apiFetch(`${CLIENT_API}/tags`)
  const [key, value] = requireExclusiveQueryEntry(
    { ...scope },
    TAGGABLE_PARENT_KEYS,
  )
  const params = new URLSearchParams({ [key]: value })
  return await apiFetch(`${CLIENT_API}/tags?${params.toString()}`)
}

export async function fetchTag(id: string): Promise<{ tag: TagRecord }> {
  return await apiFetch(`${CLIENT_API}/tags/${id}`)
}

export async function createTag(
  body: Readonly<{
    name: string
    description?: string | null
    color?: string | null
  }>,
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/tags`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateTag(
  id: string,
  body: Readonly<{
    name?: string
    description?: string | null
    color?: string | null
  }>,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/tags/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteTag(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/tags/${id}`, {
    method: 'DELETE',
  })
}

export async function fetchMarkers(
  tagId: string,
): Promise<{ markers: MarkerRecord[] }> {
  const params = new URLSearchParams({ tagId })
  return await apiFetch(`${CLIENT_API}/markers?${params.toString()}`)
}

export async function setEntityTags(
  body: TaggableParentFilter & { tagIds: string[] },
): Promise<{ ok: true; tags: TagRecord[] }> {
  requireExclusiveQueryEntry({ ...body }, TAGGABLE_PARENT_KEYS)
  return await apiFetch(`${CLIENT_API}/markers`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/**
 * Scheduled-task configuration for a compose service.
 *
 * Configuration only — nothing runs yet. Unrelated to the compose-level
 * `x-turbopanel.cron` block (`src/lib/compose/cron.ts`).
 */
export type TaskRecord = {
  id: string
  serviceId: string
  name: string
  schedule: string
  command: string
  timezone: string | null
  isEnabled: boolean
  concurrencyPolicy: string
  timeoutSeconds: number | null
  metadata: Record<string, unknown> | null
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type TaskListFilter = ExclusiveStringKeys<TaskListKey>

export async function fetchTasks(
  filter: TaskListFilter,
): Promise<{ tasks: TaskRecord[] }> {
  const [key, value] = requireExclusiveQueryEntry({ ...filter }, TASK_LIST_KEYS)
  const params = new URLSearchParams({ [key]: value })
  return await apiFetch(`${CLIENT_API}/tasks?${params.toString()}`)
}

export async function fetchTask(id: string): Promise<{ task: TaskRecord }> {
  return await apiFetch(`${CLIENT_API}/tasks/${id}`)
}

export async function createTask(
  body: Readonly<{
    serviceId: string
    name: string
    schedule: string
    command: string
    timezone?: string | null
    isEnabled?: boolean
    concurrencyPolicy?: string
    timeoutSeconds?: number | null
    metadata?: Record<string, unknown> | null
    options?: Record<string, unknown> | null
  }>,
): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/tasks`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateTask(
  id: string,
  body: Readonly<{
    name?: string
    schedule?: string
    command?: string
    timezone?: string | null
    isEnabled?: boolean
    concurrencyPolicy?: string
    timeoutSeconds?: number | null
    metadata?: Record<string, unknown> | null
    options?: Record<string, unknown> | null
  }>,
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteTask(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/tasks/${id}`, {
    method: 'DELETE',
  })
}

export type ProjectPrincipalRecord = {
  id: string
  kind: string
  provider: string
  username: string
  projectId: string | null
  metadata: { uid?: number; gid?: number; home?: string } | null
  options: Record<string, unknown> | null
  serviceIds: string[]
  /**
   * Runtime series this principal may execute on the host, each becoming a
   * unix group membership. `grantedBy` says whether an operator granted it or
   * a deploy inserted it because a service declared the runtime — both are
   * real, revocable grants; the distinction exists so the UI can say why.
   */
  entitlements: PrincipalEntitlement[]
  /**
   * How this account may log in, as the operator set it.
   *
   * Derived server-side from `options.shell` rather than stored separately —
   * the shell *is* the access level, and two independent fields could disagree
   * in a way nobody would notice until someone could not log in.
   *
   * What actually happens also depends on {@link sshKeyCount}: with no keys
   * there is nothing to authenticate with, because password authentication is
   * off for these accounts. Render both.
   */
  access: PrincipalAccessLevel
  /** Keys on file. Zero means no login is possible at any access level. */
  sshKeyCount: number
  createdAt: string
  updatedAt: string
}

export type PrincipalEntitlement = {
  runtime: string
  series: string
  grantedBy: 'operator' | 'deploy'
}

export type PrincipalAccessLevel = 'none' | 'sftp' | 'shell'

export type PrincipalSshKey = {
  id: string
  name: string
  keyType: string
  /** Canonical `<type> <base64>`; never what the operator pasted. */
  publicKey: string
  /** `SHA256:…`, comparable against `ssh-keygen -lf`. */
  fingerprint: string
  comment: string | null
  bits: number | null
  createdAt: string
}

/**
 * Servers a key change was pushed to.
 *
 * Reported rather than swallowed because adding or removing a key only takes
 * effect once the server it reaches has reconciled. A `failedServerIds` entry
 * means the row changed here but the host has not caught up — which for a
 * removal is the difference between "revoked" and "still works".
 */
export type PrincipalsReconcileOutcome = {
  queuedServerIds: string[]
  failedServerIds: string[]
}

export async function fetchPrincipalSshKeys(
  projectId: string,
  principalId: string
): Promise<{ keys: PrincipalSshKey[] }> {
  return await apiFetch(
    `${CLIENT_API}/projects/${projectId}/principals/${principalId}/ssh-keys`
  )
}

export async function addPrincipalSshKey(
  projectId: string,
  principalId: string,
  body: { name: string; publicKey: string }
): Promise<{ key: PrincipalSshKey; reconciled: PrincipalsReconcileOutcome }> {
  return await apiFetch(
    `${CLIENT_API}/projects/${projectId}/principals/${principalId}/ssh-keys`,
    { method: 'POST', body: JSON.stringify(body) }
  )
}

export async function deletePrincipalSshKey(
  projectId: string,
  principalId: string,
  keyId: string
): Promise<{ ok: true; reconciled: PrincipalsReconcileOutcome }> {
  return await apiFetch(
    `${CLIENT_API}/projects/${projectId}/principals/${principalId}/ssh-keys/${keyId}`,
    { method: 'DELETE' }
  )
}

export async function fetchProjectPrincipals(
  projectId: string
): Promise<{ principals: ProjectPrincipalRecord[] }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals`)
}

export async function createProjectPrincipal(
  projectId: string,
  body: {
    username: string
    serviceIds?: string[]
    entitlements?: { runtime: string; series: string }[]
    access?: PrincipalAccessLevel
    options?: Record<string, unknown>
  }
): Promise<{ ok: true; id: string; uid: number; gid: number; serviceIds?: string[] }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Patch a principal's tenancies, runtime entitlements, and/or SSH access.
 *
 * Each field is **omitted when undefined** and sent when present, because the
 * API distinguishes the two: absent means "leave them alone", `[]` means
 * "revoke everything". Collapsing them would make a tenancy-only edit silently
 * strip every entitlement.
 *
 * `reconciled` reports which servers the change was pushed to. Entitlements and
 * access are enforced on the host as unix group membership, so a change that
 * only landed in the database has not actually happened yet.
 */
export async function updateProjectPrincipal(
  projectId: string,
  principalId: string,
  patch: {
    serviceIds?: string[]
    entitlements?: { runtime: string; series: string }[]
    access?: PrincipalAccessLevel
  }
): Promise<{
  ok: true
  serviceIds?: string[]
  reconciled?: PrincipalsReconcileOutcome
}> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals/${principalId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function deleteProjectPrincipal(projectId: string, id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/projects/${projectId}/principals/${id}`, {
    method: 'DELETE',
  })
}

export type ResourceLimits = {
  maxCpus?: number
  maxMemoryBytes?: number
  maxServicesPerEnvironment?: number
}

export async function fetchOrgResourceLimits(
  organizationId: string
): Promise<{ resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/organizations/${organizationId}/resource-limits`)
}

export async function saveOrgResourceLimits(
  organizationId: string,
  resourceLimits: ResourceLimits
): Promise<{ ok: true; resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/organizations/${organizationId}/resource-limits`, {
    method: 'PUT',
    body: JSON.stringify({ resourceLimits }),
  })
}

export async function fetchServerResourceLimits(
  serverId: string
): Promise<{ resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/resource-limits`)
}

export async function saveServerResourceLimits(
  serverId: string,
  resourceLimits: ResourceLimits
): Promise<{ ok: true; resourceLimits: ResourceLimits }> {
  return await apiFetch(`${CLIENT_API}/servers/${serverId}/resource-limits`, {
    method: 'PUT',
    body: JSON.stringify({ resourceLimits }),
  })
}

export async function stopEnvironment(environmentId: string): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/stop`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** Ordered metric keys — mirrors instance `HOST_METRIC_KEYS`. */
export const HOST_METRIC_KEYS = [
  'cpuUsagePercent',
  'cpuUserPercent',
  'cpuSystemPercent',
  'cpuIowaitPercent',
  'load1',
  'load5',
  'load15',
  'memoryUsedPercent',
  'memoryUsedBytes',
  'memoryAvailableBytes',
  'swapUsedPercent',
  'diskUsedPercent',
  'diskReadBytesPerSecond',
  'diskWriteBytesPerSecond',
  'diskReadOpsPerSecond',
  'diskWriteOpsPerSecond',
  'networkReceiveBytesPerSecond',
  'networkTransmitBytesPerSecond',
  'processCount',
  'uptimeSeconds',
] as const

export type HostMetricKey = (typeof HOST_METRIC_KEYS)[number]

export type MetricsBackendKind = 'disabled' | 'analytics-engine' | 'clickhouse'

export type MetricsSeriesPoint = {
  at: string
  values: Partial<Record<HostMetricKey, number | null>>
  minimums?: Partial<Record<HostMetricKey, number | null>>
  maximums?: Partial<Record<HostMetricKey, number | null>>
  sampleCount: number
  expectedSampleCount?: number
}

export type MetricsSeriesResponse = {
  ok: true
  serverId: string
  from: string
  to: string
  resolutionSeconds: number | null
  backend: MetricsBackendKind
  available: boolean
  metrics: HostMetricKey[]
  sampleCount: number
  gapCount: number
  points: MetricsSeriesPoint[]
}

export type MetricsSummaryResponse = {
  ok: true
  serverId: string
  from: string
  to: string
  backend: MetricsBackendKind
  available: boolean
  sampleCount: number
  latestAt: string | null
}

export type FleetServerUsageRecord = {
  serverId: string
  latestAt: string | null
  sampleCount: number
  values: Partial<Record<HostMetricKey, number | null>>
}

export type FleetMetricsLatestResponse = {
  ok: true
  from: string
  to: string
  backend: MetricsBackendKind
  available: boolean
  metrics: HostMetricKey[]
  servers: FleetServerUsageRecord[]
}

export class MetricsBackendUnavailableError extends Error {
  readonly code = 'metrics_backend_unavailable'
  readonly backend: MetricsBackendKind

  constructor(backend: MetricsBackendKind, message?: string) {
    super(message ?? `Metrics backend unavailable (${backend})`)
    this.name = 'MetricsBackendUnavailableError'
    this.backend = backend
  }
}

export type FetchServerMetricsSeriesOptions = {
  fromIso: string
  toIso: string
  metrics?: HostMetricKey[]
  resolution?: number
  maxPoints?: number
}

async function fetchServerMetricsJson<T>(
  serverId: string,
  pathSuffix: string,
  query: URLSearchParams,
  organizationId?: string | null
): Promise<T> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const path = `${CLIENT_API}/servers/${serverId}/metrics/${pathSuffix}?${query.toString()}`
  const response = await fetch(controlPlaneUrl(path), {
    credentials: 'include',
    headers,
  })

  if (response.status === 503) {
    let body: { error?: string; backend?: MetricsBackendKind } = {}
    try {
      body = (await response.json()) as typeof body
    } catch {
      // Non-JSON error body.
    }
    if (body.error === 'metrics_backend_unavailable') {
      throw new MetricsBackendUnavailableError(
        body.backend ?? 'disabled',
        `${path} failed: metrics_backend_unavailable`
      )
    }
  }

  if (!response.ok) {
    let bodyError: string | undefined
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) bodyError = body.error
    } catch {
      // Non-JSON error body.
    }
    const detail = formatFetchFailureDetail(response.status, bodyError)
    throw new Error(`${path} failed: ${detail}`)
  }

  return (await response.json()) as T
}

export async function fetchServerMetricsSeries(
  serverId: string,
  options: FetchServerMetricsSeriesOptions,
  organizationId?: string | null
): Promise<MetricsSeriesResponse> {
  const query = new URLSearchParams({
    from: options.fromIso,
    to: options.toIso,
  })
  if (options.metrics && options.metrics.length > 0) {
    query.set('metrics', options.metrics.join(','))
  }
  if (options.resolution !== undefined) {
    query.set('resolution', String(options.resolution))
  }
  if (options.maxPoints !== undefined) {
    query.set('maxPoints', String(options.maxPoints))
  }

  return await fetchServerMetricsJson<MetricsSeriesResponse>(
    serverId,
    'series',
    query,
    organizationId
  )
}

export async function fetchServerMetricsSummary(
  serverId: string,
  options: { fromIso: string; toIso: string },
  organizationId?: string | null
): Promise<MetricsSummaryResponse> {
  const query = new URLSearchParams({
    from: options.fromIso,
    to: options.toIso,
  })

  return await fetchServerMetricsJson<MetricsSummaryResponse>(
    serverId,
    'summary',
    query,
    organizationId
  )
}

/**
 * One fleet usage snapshot for the servers overview (CPU stack / load / memory / swap).
 * Authz is server-side via listVisible — never pass client serverIds.
 */
export async function fetchFleetMetricsLatest(
  organizationId?: string | null
): Promise<FleetMetricsLatestResponse> {
  const resolvedOrgId = organizationId ?? getActiveOrganizationId()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }

  const path = `${CLIENT_API}/servers/metrics/latest`
  const response = await fetch(controlPlaneUrl(path), {
    credentials: 'include',
    headers,
  })

  if (response.status === 503) {
    let body: { error?: string; backend?: MetricsBackendKind } = {}
    try {
      body = (await response.json()) as typeof body
    } catch {
      // Non-JSON error body.
    }
    if (body.error === 'metrics_backend_unavailable') {
      throw new MetricsBackendUnavailableError(
        body.backend ?? 'disabled',
        `${path} failed: metrics_backend_unavailable`
      )
    }
  }

  if (!response.ok) {
    let bodyError: string | undefined
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) bodyError = body.error
    } catch {
      // Non-JSON error body.
    }
    const detail = formatFetchFailureDetail(response.status, bodyError)
    throw new Error(`${path} failed: ${detail}`)
  }

  return (await response.json()) as FleetMetricsLatestResponse
}

export async function fetchEnvironmentManaged(
  environmentId: string
): Promise<ManagedDetailResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed`)
}

/**
 * Create (or return already-provisioned) managed service for an environment.
 * When present, `rootPassword` is **show-once** — never persist it beyond the
 * reveal UI.
 */
export async function createEnvironmentManaged(
  environmentId: string,
  body?: {
    name?: string
    /**
     * Engine version series from the release catalog (`18`, `9.7`, `12.3`).
     * Omitted = engine default. Rejected with `managed_version_unsupported`
     * when it is not in the catalog.
     */
    engineSeries?: string
    /** Base-OS variant of `engineSeries` (`alpine` / `debian` / `oraclelinux9` / `ubi`). */
    imageVariant?: string
    exposure?: {
      enabled: boolean
      scope?: ManagedSqlAccessScope
    }
  }
): Promise<{
  ok: true
  managed: ManagedEnvironmentRecord
  commandId?: string
  serverId?: string
  rootPassword?: string
  alreadyProvisioned?: boolean
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

export async function updateEnvironmentManaged(
  environmentId: string,
  body: { settings: ManagedSettings }
): Promise<{
  ok: true
  managed: ManagedEnvironmentRecord
  settings: ManagedSettings
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function applyEnvironmentManaged(
  environmentId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/apply`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function runManagedLifecycle(
  environmentId: string,
  action: 'start' | 'stop' | 'restart'
): Promise<ManagedCommandResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/lifecycle`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export async function runEnvironmentLifecycle(
  environmentId: string,
  action: EnvironmentLifecycleAction
): Promise<CommandEnqueueResponse> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/lifecycle`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export async function deleteEnvironmentManaged(environmentId: string): Promise<{
  ok: true
  deleted: boolean
  commandId?: string
  serverId?: string
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed`, { method: 'DELETE' })
}

/**
 * Rotate the managed root password. The returned `rootPassword` is
 * **show-once** — never persist it beyond the reveal UI. When the root
 * principal owns bindings, `redeployRequired` lists consumers that need a
 * redeploy to pick up the new password (API never restarts silently).
 */
export async function rotateManagedRootPassword(environmentId: string): Promise<{
  ok: true
  rootPassword: string
  commandId: string
  serverId: string
  redeployRequired?: BindingRedeployRequired
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/root-password`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/**
 * Rotate a managed user password. The returned `password` is **show-once**.
 * `redeployRequired` lists services whose bindings rematerialise with the new
 * credential — the UI must offer redeploy, never restart automatically.
 */
export async function rotateManagedUserPassword(
  environmentId: string,
  principalId: string
): Promise<{
  ok: true
  password: string
  commandId: string
  serverId: string
  redeployRequired?: BindingRedeployRequired
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/users/${encodeURIComponent(principalId)}/password`,
    { method: 'POST', body: JSON.stringify({}) }
  )
}

export async function fetchManagedUsers(
  environmentId: string
): Promise<{ users: ManagedUserRecord[] }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/users`)
}

/**
 * Create a managed DB user. The returned `password` is **show-once** — never
 * persist it beyond the reveal UI.
 */
export async function createManagedUser(
  environmentId: string,
  body: {
    username: string
    databases: string[]
    privileges?: string[]
    /** Omit for `read-write`; `read-only` requires a read-eligible replica (422 `managed_no_read_targets`). */
    connectionRole?: ManagedConnectionRole
  }
): Promise<{
  ok: true
  user: ManagedUserRecord
  password: string
  commandId: string
  serverId: string
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/users`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteManagedUser(
  environmentId: string,
  principalId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/users/${encodeURIComponent(principalId)}`,
    { method: 'DELETE' }
  )
}

export async function fetchManagedDatabases(
  environmentId: string
): Promise<{ databases: string[] }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/databases`)
}

export async function createManagedDatabase(
  environmentId: string,
  body: { name: string }
): Promise<{
  ok: true
  databases: string[]
  commandId: string
  serverId: string
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/databases`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteManagedDatabase(
  environmentId: string,
  name: string
): Promise<{
  ok: true
  databases: string[]
  commandId: string
  serverId: string
}> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/databases/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  )
}

export async function fetchManagedStatus(environmentId: string): Promise<{
  status: ManagedEnvironmentRecord['status']
  host: string | null
  port: number | null
  error: string | null
  containers: ContainerRecord[]
  members: ManagedMemberRecord[]
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/status`)
}

export async function fetchManagedLogs(
  environmentId: string,
  tail?: number
): Promise<{ logs: string }> {
  const query = typeof tail === 'number' ? `?tail=${encodeURIComponent(String(tail))}` : ''
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/logs${query}`)
}

/**
 * Org-wide managed service list (Postgres-backed). Single O(1) call for the
 * Managed overview table — never fan out per-row status or Durable Object reads.
 */
export async function fetchOrganizationManaged(
  orgId: string
): Promise<{ managed: ManagedListRecord[] }> {
  return await apiFetch(`${CLIENT_API}/organizations/${orgId}/managed`)
}

/**
 * Backup metadata only — the daemon streams dumps to its own state dir; there
 * is no download endpoint and no dump bytes ever cross this API.
 */
export async function fetchManagedBackups(
  environmentId: string
): Promise<{ backups: ManagedBackupRecord[] }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/backups`)
}

export async function createManagedBackup(
  environmentId: string,
  body?: { database?: string }
): Promise<{
  ok: true
  backupId: string
  commandId: string
  serverId: string
}> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/backups`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

export async function deleteManagedBackup(
  environmentId: string,
  backupId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/backups/${encodeURIComponent(backupId)}`,
    { method: 'DELETE' }
  )
}

export async function restoreManagedBackup(
  environmentId: string,
  backupId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/backups/${encodeURIComponent(backupId)}/restore`,
    { method: 'POST', body: JSON.stringify({}) }
  )
}

export async function fetchManagedMembers(
  environmentId: string
): Promise<{ members: ManagedMemberRecord[] }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/members`)
}

export async function addManagedReplica(
  environmentId: string,
  body: {
    serverId: string
    replicaClass?: 'failover' | 'read'
    readEligible?: boolean
  }
): Promise<ManagedCommandResponse & { member?: ManagedMemberRecord }> {
  return await apiFetch(`${CLIENT_API}/environments/${environmentId}/managed/members`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateManagedMember(
  environmentId: string,
  memberId: string,
  body: {
    readEligible?: boolean
    replicaClass?: 'failover' | 'read'
  }
): Promise<ManagedCommandResponse & { member?: ManagedMemberRecord }> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/members/${encodeURIComponent(memberId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  )
}

export async function removeManagedMember(
  environmentId: string,
  memberId: string
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/members/${encodeURIComponent(memberId)}`,
    { method: 'DELETE' }
  )
}

export async function promoteManagedMember(
  environmentId: string,
  memberId: string,
  body?: { force?: boolean }
): Promise<ManagedCommandResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/members/${encodeURIComponent(memberId)}/promote`,
    {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }
  )
}

export type ManagedDisasterRecoveryResponse = ManagedCommandResponse & {
  fencePending: boolean
  kind: 'disaster-recovery'
  lagBytes: number | null
  source: {
    memberId: string
    serverId: string
    datacenterId: string | null
  }
  target: {
    memberId: string
    serverId: string
    datacenterId: string | null
  }
}

export async function promoteManagedDisasterRecovery(
  environmentId: string,
  body: { memberId: string; confirm: true }
): Promise<ManagedDisasterRecoveryResponse> {
  return await apiFetch(
    `${CLIENT_API}/environments/${environmentId}/managed/disaster-recovery/promote`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
}

export type BindingListFilter =
  { serviceId: string } | { environmentId: string } | { managedEnvironmentId: string }

function bindingListQueryParams(filter: BindingListFilter): URLSearchParams {
  if ('serviceId' in filter) {
    return new URLSearchParams({ serviceId: filter.serviceId })
  }
  if ('managedEnvironmentId' in filter) {
    return new URLSearchParams({
      managedEnvironmentId: filter.managedEnvironmentId,
    })
  }
  return new URLSearchParams({ environmentId: filter.environmentId })
}

export async function fetchBindings(
  filter: BindingListFilter
): Promise<{ bindings: BindingRecord[] }> {
  const params = bindingListQueryParams(filter)
  return await apiFetch(`${CLIENT_API}/bindings?${params.toString()}`)
}

export async function createBinding(body: {
  principalId: string
  serviceId: string
  databaseName: string
  keyPrefix?: string
  emitEngineDefaults?: boolean
}): Promise<{ ok: true; id: string }> {
  return await apiFetch(`${CLIENT_API}/bindings`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateBinding(
  id: string,
  body: {
    keyPrefix?: string
    emitEngineDefaults?: boolean
    databaseName?: string
  }
): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/bindings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteBinding(id: string): Promise<{ ok: true }> {
  return await apiFetch(`${CLIENT_API}/bindings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** Ensure-or-create organization CA (public certificate only — never a private key). */
export async function fetchOrganizationCa(): Promise<{
  tls: OrganizationCaRecord
  trustBundlePem: string
  leafHealth: OrganizationCaLeafHealth
}> {
  return await apiFetch(`${CLIENT_API}/tls/ca`)
}

/** Active Organization CA rotation journal; `null` when no rotation exists yet. */
export async function fetchOrganizationCaRotation(): Promise<CaRotationStatus | null> {
  try {
    return await apiFetch(`${CLIENT_API}/tls/ca/rotation`)
  } catch (err) {
    if (isHttpStatusError(err, 404)) return null
    throw err
  }
}

export async function rotateOrganizationCa(): Promise<{
  ok: true
  id: string
  rotationId: string
  generation: number
  results: CaRotationResult[]
  needsRedeploy: { serverId: string; environmentId: string }[]
}> {
  return await apiFetch(`${CLIENT_API}/tls/ca/rotate`, { method: 'POST' })
}

export async function retireOrganizationCa(): Promise<{
  ok: true
  rotationId: string
}> {
  return await apiFetch(`${CLIENT_API}/tls/ca/retire`, { method: 'POST' })
}

/**
 * Download the organization CA PEM (`application/x-pem-file`). Private key is
 * never included. Returns PEM text for browser save / clipboard copy.
 */
export async function downloadOrganizationCaPem(): Promise<string> {
  const resolvedOrgId = getActiveOrganizationId()
  const headers: Record<string, string> = {}
  if (resolvedOrgId) {
    headers[ORG_ID_HEADER] = resolvedOrgId
  }
  const response = await fetch(controlPlaneUrl(`${CLIENT_API}/tls/ca/download`), {
    credentials: 'include',
    headers,
  })
  if (!response.ok) {
    let detail = formatFetchFailureDetail(response.status)
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) {
        detail = formatFetchFailureDetail(response.status, body.error)
      }
    } catch {
      // Non-JSON error body — keep the status-only message.
    }
    throw new Error(`${CLIENT_API}/tls/ca/download failed: ${detail}`)
  }
  return await response.text()
}
