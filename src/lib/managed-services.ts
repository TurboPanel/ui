/**
 * Managed database UI types — rows live in the `managed` table keyed by
 * `environment_id` for engine projects created from the catalog.
 */

import {
  defaultManagedImage,
  managedAllowedImagesForEngine,
} from '@/lib/managed-releases'
import type { ManagedSslMode } from '@/lib/managed-ssl'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'

import type { ManagedSqlAccessScope } from '@/lib/managed-access-scope'

export type ManagedServiceEngine =
  | 'postgres'
  | 'mysql'
  | 'mariadb'
  | 'redis'
  | 'clickhouse'

/** Catalog card availability (not runtime status). */
export type ManagedEngineAvailability = 'available' | 'coming-soon'

/** Runtime status for a managed row (mirrors instance `ManagedStatus`). */
export type ManagedStatus =
  | 'provisioning'
  | 'applying'
  | 'ready'
  | 'stopped'
  | 'failed'

export type { ManagedSqlAccessScope }

/**
 * Client listener ports on the shared ProxySQL frontend (not engine-native).
 *
 * Re-exported from `@/lib/managed-ingress-ports`, which is the single mirror of
 * the control-plane contract. These are only the **platform defaults**: an
 * organization can move either listener, so anything rendering a live endpoint
 * must prefer the port the API resolved rather than these constants.
 */
export {
  DEFAULT_MANAGED_INGRESS_PORTS,
  managedIngressPortForEngine,
  MANAGED_INGRESS_MYSQL_PORT,
  MANAGED_INGRESS_PGSQL_PORT,
} from '@/lib/managed-ingress-ports'
export type { ManagedIngressPorts } from '@/lib/managed-ingress-ports'

/** Cluster member role (mirrors instance `ManagedMemberRole`). */
export type ManagedMemberRole = 'primary' | 'replica'

/** Replica class (mirrors instance `ManagedReplicaClass`). Null on primary. */
export type ManagedReplicaClass = 'failover' | 'read'

/** Failover replica uses recorded switchover; read replica uses the DR route. */
export type ManagedReplicaPromoteAction = 'switchover' | 'disaster-recovery'

export type ManagedRecoveryKind =
  | 'automatic-failover'
  | 'switchover'
  | 'disaster-recovery'

export type ManagedRecoveryState =
  | 'detecting'
  | 'fencing'
  | 'promoting'
  | 'repointing'
  | 'reconciling-ingress'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'blocked'

export type ManagedRecoveryRecord = {
  id: string
  kind: ManagedRecoveryKind
  state: ManagedRecoveryState
  sourcePrimaryMemberId: string
  targetMemberId: string | null
  startedAt: string
  completedAt: string | null
  blockedReason: string | null
  lagBytes: number | null
  sourceDatacenterId: string | null
  targetDatacenterId: string | null
  sourceServerId: string | null
  targetServerId: string | null
}

export const AUTOMATIC_FAILOVER_BLOCKED_MESSAGE =
  'Automatic failover blocked: unable to verify previous primary is fenced'

/** Private path used for replication (mirrors `PrivateEndpointTransport`). */
export type ManagedMemberTransport =
  | 'local'
  | 'datacenter'
  | 'fabric'
  | 'public'

export type ManagedReplicationHealth = {
  state: string
  observedAt: string
  lagBytes?: number
  lagSeconds?: number
}

/**
 * Cluster member row — mirrors instance `SerializedManagedMember`.
 * Never carries credentials or private keys.
 */
export type ManagedMemberRecord = {
  id: string
  serverId: string
  serverName: string | null
  role: ManagedMemberRole
  replicaClass: ManagedReplicaClass | null
  readEligible: boolean
  ordinal: number
  status: string | null
  replicationTransport: ManagedMemberTransport | null
  privatePort: number | null
  replication?: ManagedReplicationHealth
}

export type ManagedServiceCatalogEntry = {
  engine: ManagedServiceEngine
  label: string
  description: string
  status: ManagedEngineAvailability
  defaultPort: number
  defaultImage: string
  /**
   * Every image reference this engine's settings parser will accept
   * (`settings.image`), in display order — derived from the release catalog
   * mirror in `./managed-releases.ts`.
   */
  allowedImages: readonly string[]
  /** `true` when the backend engine spec declares a `backup` descriptor (see instance `getManagedBackupDescriptor`). */
  supportsBackup: boolean
}

/** Catalog default image for an engine that must have a release entry. */
function releaseDefaultImage(engine: string): string {
  const image = defaultManagedImage(engine)
  if (image === undefined) {
    throw new Error(`no managed release catalog entry for engine: ${engine}`)
  }
  return image
}

/**
 * Display metadata for managed engine catalog cards (mirrors instance
 * catalog options). Image data comes from the release catalog mirror
 * (`./managed-releases.ts`) so version support lives in one place.
 */
export const MANAGED_SERVICE_CATALOG: readonly ManagedServiceCatalogEntry[] = [
  {
    engine: 'postgres',
    label: 'PostgreSQL',
    description: 'Relational database with backups and connection pooling.',
    status: 'available',
    defaultPort: 5432,
    defaultImage: releaseDefaultImage('postgres'),
    allowedImages: managedAllowedImagesForEngine('postgres'),
    supportsBackup: true,
  },
  {
    engine: 'mysql',
    label: 'MySQL',
    description: 'Popular SQL database for web apps.',
    status: 'available',
    defaultPort: 3306,
    defaultImage: releaseDefaultImage('mysql'),
    allowedImages: managedAllowedImagesForEngine('mysql'),
    supportsBackup: true,
  },
  {
    engine: 'mariadb',
    label: 'MariaDB',
    description: 'MySQL-compatible engine with open-source tooling.',
    status: 'available',
    defaultPort: 3306,
    defaultImage: releaseDefaultImage('mariadb'),
    allowedImages: managedAllowedImagesForEngine('mariadb'),
    supportsBackup: true,
  },
]

/** `true` when `code` names a catalog engine whose spec supports `managed.backup`. */
export function managedEngineSupportsBackup(code: string | null | undefined): boolean {
  if (!code) return false
  return managedCatalogEntryForCode(code)?.supportsBackup ?? false
}

export type ManagedEnvironmentRecord = {
  id: string
  environmentId: string | null
  name: string | null
  engine: ManagedServiceEngine | null
  status: ManagedStatus
  host: string | null
  port: number | null
  serverId: string | null
  metadata: Record<string, unknown>
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type ManagedSettings = {
  image?: string
  /**
   * Client TLS policy at the ProxySQL boundary. Omitted means "inherit" —
   * the organization default, then the platform `require` fallback.
   */
  ssl: { mode?: ManagedSslMode }
  resources?: {
    cpus?: number
    memoryBytes?: number
    memoryReservationBytes?: number
  }
  dockerOptions?: {
    restart?: string
    stopGracePeriodSeconds?: number
    shmSizeBytes?: number
    ulimits?: Record<string, unknown>
    labels?: Record<string, string>
    extraEnv?: Record<string, string>
  }
  engineConfig?: string
  exposure: {
    enabled: boolean
    scope?: ManagedSqlAccessScope
  }
  /** Retention (keep-N) for `managed.backup` — clamped to the engine's `maxRetentionKeep`. */
  backups?: {
    retentionKeep?: number
  }
}

export type ManagedConnectionInfo = {
  dsn: string
  host: string
  port: number
  database: string
  username: string
}

/**
 * Which ProxySQL hostgroup a managed login defaults to.
 *
 * `read-write` reaches the current primary; `read-only` reaches read-eligible
 * replicas. This is chosen per login at create time — it is not derived from a
 * member's read eligibility, and it never rewrites an application's queries.
 */
export type ManagedConnectionRole = 'read-write' | 'read-only'

export type ManagedUserRecord = {
  id: string
  username: string
  /**
   * Engine login actually created — the short `username` plus a random
   * `_<11 chars>` suffix when the org randomized-usernames default was on at
   * create. Connect with this name.
   */
  appliedUsername: string
  databases: string[]
  privileges: string[]
  connectionRole: ManagedConnectionRole
  createdAt: string
}

export type ManagedServerSummary = {
  id: string
  name: string | null
  hostname: string | null
}

export type ManagedListRecord = ManagedEnvironmentRecord & {
  engineDisplayName: string | null
  environmentName: string | null
  projectId: string
  projectName: string | null
  workspaceId: string
  workspaceName: string | null
  serverName: string | null
  members: ManagedMemberRecord[]
}

/**
 * Catalog identity of the running engine image, derived server-side from
 * `settings.image`. `null` when the cluster is not provisioned yet or its image
 * is outside the release catalog.
 */
export type ManagedReleaseView = {
  /** Version series (`18`, `9.7`, `12.3`). */
  series: string
  /** Base-OS variant id (`alpine` / `debian` / `oraclelinux9` / `ubi`). */
  variantId: string
  lifecycle: 'lts' | 'supported' | 'legacy'
  image: string
}

/**
 * Resolved client TLS policy for a managed service. `configured` is the
 * service-level override (`null` = inheriting), `effective` is what ProxySQL
 * enforces and the DSN renders, and `organizationDefault` lets the picker label
 * the inherit option with what it resolves to today.
 */
export type ManagedSslView = {
  configured: ManagedSslMode | null
  effective: ManagedSslMode
  organizationDefault: ManagedSslMode | null
}

export type ManagedAccessEndpoint = {
  scope: ManagedSqlAccessScope
  host: string
  port: number
}

/**
 * What the host's shared ProxySQL actually publishes for this cluster, next to
 * what the cluster's own settings asked for.
 *
 * The listener is shared by every managed database on the server, so a cluster
 * with `requested: false` can still be `published: true` — the control plane
 * reports that as `viaCoResidentCluster` instead of claiming it is unreachable.
 */
export type ManagedExposureView = {
  /** `settings.exposure.enabled` for this cluster. */
  requested: boolean
  /** A host listener publishes in front of this cluster. */
  published: boolean
  /** Scopes the published listener covers, widest first. */
  scopes: ManagedSqlAccessScope[]
  /** Published only because another cluster on the same host asked for it. */
  viaCoResidentCluster: boolean
}

export type ManagedDetailResponse = {
  managed: ManagedEnvironmentRecord | null
  connection: ManagedConnectionInfo | null
  endpoints?: ManagedAccessEndpoint[]
  exposure?: ManagedExposureView | null
  settings: ManagedSettings | null
  ssl: ManagedSslView | null
  release: ManagedReleaseView | null
  server: ManagedServerSummary | null
  rootUsername: string | null
  members: ManagedMemberRecord[]
  recovery?: ManagedRecoveryRecord | null
}

/** Metadata only — the daemon streams dumps to its own state dir; there is no download endpoint. */
export type ManagedBackupRecord = {
  id: string
  createdAt: string
  sizeBytes: number
  /** SHA-256 hex digest of the artifact. */
  checksum: string
  database?: string
  /** Daemon-local artifact path — never a downloadable URL. */
  path: string
}

/** Short display form of a SHA-256 hex digest for compact backup rows. */
export function shortBackupChecksum(checksum: string): string {
  return checksum.slice(0, 10)
}

const MANAGED_ERROR_COPY: Record<string, string> = {
  server_placement_required: 'Select a server before creating this managed service.',
  server_offline: 'The selected server is offline. Choose a connected server.',
  managed_busy: 'Another managed operation is still in progress. Wait and try again.',
  managed_settings_invalid: 'Managed settings are invalid. Check the form and try again.',
  managed_user_exists: 'A user with that name already exists.',
  database_exists: 'A database with that name already exists.',
  cannot_drop_root_user: 'The root user cannot be deleted.',
  cannot_drop_initial_database: 'The initial database cannot be deleted.',
  not_managed_environment: 'This environment is not a managed service.',
  managed_engine_unavailable: 'That managed engine is not available yet.',
  daemon_key_unavailable: 'Could not reach the daemon key for this server.',
  managed_credential_not_sealed: 'Managed credentials are not ready yet.',
  root_principal_missing: 'Root credentials are missing for this managed service.',
  managed_backup_unsupported: 'Backups are not supported on this managed engine yet.',
  backup_not_found: 'That backup no longer exists.',
  managed_restore_checksum_mismatch:
    'The stored backup failed integrity verification and cannot be restored.',
  username_in_use:
    "That username is already taken on this server's organization. Pick another name.",
  managed_member_exists: 'That server already hosts a member of this cluster.',
  managed_replica_not_promotable:
    'Only failover replicas can be promoted on this path. Convert this replica to failover for a recorded switchover, or use Promote for disaster recovery.',
  managed_automatic_failover_blocked:
    AUTOMATIC_FAILOVER_BLOCKED_MESSAGE,
  failover_replica_requires_datacenter_transport:
    'Failover replicas must share a datacenter LAN with the primary — TurboFabric and public paths are not allowed.',
  managed_member_is_primary:
    'Promote another member first — the primary cannot be removed.',
  managed_no_read_targets:
    'This cluster has no replica serving read traffic yet. Add a replica with reads enabled, then create the read-only login.',
  datacenter_required: 'That server is not assigned to a datacenter.',
  datacenter_cidr_required: 'That datacenter has no private network yet.',
  datacenter_ip_required: 'That server has no private address in its datacenter.',
  private_family_mismatch:
    'Those servers share a datacenter but not an address family (one is IPv4-only, the other IPv6-only).',
  private_path_unavailable: 'No private path between that server and the primary.',
  peer_tunnel_address_required:
    `The ${TURBOFABRIC_PRODUCT_NAME} path between those datacenters has no overlay address yet.`,
  managed_private_port_exhausted: 'No free private listener port on that server.',
  managed_listener_bind_conflict:
    'This cluster mixes members that need different network paths to the same host, so one private listener cannot serve them all. Put the failover replicas and read replicas on a single path (datacenter, ' +
    `${TURBOFABRIC_PRODUCT_NAME}, or public).`,
  managed_replica_not_streaming:
    'That replica is not streaming from the primary yet. Wait for it to catch up, or promote anyway if the primary is dead.',
  managed_replica_lagging:
    'That replica is still lagging behind the primary. Wait for lag to clear, or promote anyway and accept possible data loss.',
  managed_replica_health_stale:
    'Replica health has not been observed recently. Refresh status, or promote anyway if the primary is dead.',
  managed_primary_fence_failed:
    'Could not stop the current primary — promotion was aborted.',
  managed_user_has_bindings:
    'Still connected to one or more services. Remove those connections first.',
  managed_database_has_bindings:
    'Still connected to one or more services. Remove those connections first.',
  binding_key_prefix_in_use:
    'This service already has a connection using that prefix — pick another.',
  binding_engine_defaults_in_use:
    'Another connection on this service already owns the engine default keys — turn engine defaults off.',
  binding_key_conflict:
    'A variable key from this connection already exists on that service — rename or remove it first.',
  binding_endpoint_unavailable:
    "No network path from that service's server to this cluster.",
  binding_password_unavailable:
    'Could not decrypt the database password for this connection.',
  binding_engine_unsupported:
    'This managed engine does not support service connections yet.',
  binding_owned_variable:
    'That variable is provided by a connected database and cannot be edited here.',
  database_not_found: 'That database was not found on this cluster.',
}

/**
 * Map instance managed error codes (inside `HTTP <status>: <code>`) to
 * operator-readable copy; otherwise return the raw message.
 */
export function managedErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : fallback
  const match = /HTTP \d+:\s*([a-z0-9_]+)/i.exec(raw)
  const code = match?.[1]
  if (code && MANAGED_ERROR_COPY[code]) {
    return MANAGED_ERROR_COPY[code]
  }
  return raw || fallback
}

/** Status pill vocabulary shared with the servers fleet. */
export function managedStatusLabel(status: ManagedStatus): string {
  switch (status) {
    case 'ready':
      return 'Running'
    case 'stopped':
      return 'Stopped'
    case 'provisioning':
      return 'Provisioning'
    case 'applying':
      return 'Applying'
    case 'failed':
      return 'Failed'
  }
}

export function memberRoleLabel(role: ManagedMemberRole): string {
  return role === 'primary' ? 'Primary' : 'Replica'
}

export function memberReplicaClassLabel(
  replicaClass: ManagedReplicaClass | null | undefined,
): string | null {
  if (replicaClass === 'failover') return 'Failover'
  if (replicaClass === 'read') return 'Remote read replica'
  return null
}

/** Add-replica class picker — longer labels than the row badge. */
export function memberReplicaClassPickerLabel(
  replicaClass: ManagedReplicaClass,
): string {
  return replicaClass === 'failover' ? 'Failover replica' : 'Remote/read replica'
}

export function memberReadTrafficLabel(
  role: ManagedMemberRole,
  readEligible: boolean,
): string {
  if (role === 'primary') return 'Read/write'
  return readEligible ? 'Serves reads' : 'Standby only'
}

export const MEMBER_MANUAL_DR_CANDIDATE_LABEL = 'Manual DR candidate'

export function managedReplicaPromoteAction(
  replicaClass: ManagedReplicaClass | null | undefined,
): ManagedReplicaPromoteAction | null {
  if (replicaClass === 'failover') return 'switchover'
  if (replicaClass === 'read') return 'disaster-recovery'
  return null
}

export function managedRecoveryKindLabel(kind: ManagedRecoveryKind): string {
  switch (kind) {
    case 'automatic-failover':
      return 'Automatic failover'
    case 'switchover':
      return 'Switchover'
    case 'disaster-recovery':
      return 'Disaster recovery'
  }
}

export function managedRecoveryStateLabel(state: ManagedRecoveryState): string {
  switch (state) {
    case 'detecting':
      return 'Detecting'
    case 'fencing':
      return 'Fencing'
    case 'promoting':
      return 'Promoting'
    case 'repointing':
      return 'Repointing'
    case 'reconciling-ingress':
      return 'Reconciling ingress'
    case 'verifying':
      return 'Verifying'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'blocked':
      return 'Blocked'
  }
}

export function managedRecoveryBanner(
  recovery: ManagedRecoveryRecord | null | undefined,
): { kind: 'blocked' | 'failed' | 'in-flight'; text: string } | null {
  if (!recovery || recovery.state === 'completed') return null
  if (recovery.state === 'blocked') {
    return {
      kind: 'blocked',
      text: recovery.blockedReason?.trim() || AUTOMATIC_FAILOVER_BLOCKED_MESSAGE,
    }
  }
  if (recovery.state === 'failed') {
    return {
      kind: 'failed',
      text: `${managedRecoveryKindLabel(recovery.kind)} failed`,
    }
  }
  return {
    kind: 'in-flight',
    text: `${managedRecoveryKindLabel(recovery.kind)} · ${managedRecoveryStateLabel(recovery.state)}`,
  }
}

export function memberTransportLabel(
  transport: ManagedMemberTransport | null | undefined,
): string {
  switch (transport) {
    case 'local':
      return 'Local'
    case 'datacenter':
      return 'Datacenter LAN'
    case 'fabric':
      return `${TURBOFABRIC_PRODUCT_NAME} direct`
    case 'public':
      return 'Public Internet + TLS'
    default:
      return '—'
  }
}

/** Human labels for member runtime `status` (Postgres-backed). */
export function memberStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  switch (status) {
    case 'ready':
    case 'running':
      return 'Running'
    case 'stopped':
      return 'Stopped'
    case 'provisioning':
      return 'Provisioning'
    case 'applying':
      return 'Applying'
    case 'failed':
      return 'Failed'
    default:
      return status.replaceAll('_', ' ')
  }
}

export function replicationStateLabel(state: string | null | undefined): string {
  if (!state) return '—'
  switch (state) {
    case 'streaming':
      return 'Streaming'
    case 'catching_up':
    case 'catchup':
      return 'Catching up'
    case 'not_streaming':
      return 'Not streaming'
    case 'stopped':
      return 'Stopped'
    default:
      return state.replaceAll('_', ' ')
  }
}

function formatCompactBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${units[unitIndex]}`
}

/**
 * Compact lag line for topology rows — bytes and/or seconds.
 * Pair with {@link replicationStateLabel}; never convey lag by color alone.
 */
export function formatReplicationLag(
  health: ManagedReplicationHealth | null | undefined,
): string | null {
  if (!health) return null
  const parts: string[] = []
  if (typeof health.lagBytes === 'number' && Number.isFinite(health.lagBytes)) {
    parts.push(`${formatCompactBytes(health.lagBytes)} behind`)
  }
  if (
    typeof health.lagSeconds === 'number' &&
    Number.isFinite(health.lagSeconds)
  ) {
    const seconds =
      health.lagSeconds >= 10
        ? `${Math.round(health.lagSeconds)}s`
        : `${Math.round(health.lagSeconds * 10) / 10}s`
    if (parts.length === 0) {
      parts.push(`${seconds} behind`)
    } else {
      parts[0] = `${parts[0]} · ${seconds}`
    }
  }
  return parts.length > 0 ? parts.join('') : null
}

export function managedCatalogEntryForCode(
  code: string,
): ManagedServiceCatalogEntry | undefined {
  return MANAGED_SERVICE_CATALOG.find((entry) => entry.engine === code)
}

export function sortManagedCatalogEntries<T extends { code: string }>(
  entries: readonly T[],
): T[] {
  return [...entries].sort((a, b) => {
    const aEntry = managedCatalogEntryForCode(a.code)
    const bEntry = managedCatalogEntryForCode(b.code)
    const aAvailable = aEntry?.status === 'available'
    const bAvailable = bEntry?.status === 'available'
    if (aAvailable && !bAvailable) return -1
    if (bAvailable && !aAvailable) return 1
    const aLabel = aEntry?.label ?? a.code
    const bLabel = bEntry?.label ?? b.code
    return aLabel.localeCompare(bLabel)
  })
}

/** Topology column label for the org managed overview table. */
export function formatClusterTopologyLabel(
  members: readonly ManagedMemberRecord[] | null | undefined,
): string {
  const list = members ?? []
  const replicaCount = list.filter((m) => m.role === 'replica').length
  if (replicaCount <= 0) return 'Primary'
  if (replicaCount === 1) return 'Primary + 1 replica'
  return `Primary + ${replicaCount} replicas`
}

export function clusterHasUnhealthyMember(
  members: readonly ManagedMemberRecord[] | null | undefined,
): boolean {
  return (members ?? []).some((m) => {
    if (!m.status) return false
    return m.status !== 'ready' && m.status !== 'running'
  })
}
