/**
 * Managed database UI types — rows live in the `managed` table keyed by
 * `environment_id` for engine projects created from the catalog.
 */

import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'

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

export type ManagedBindScope = 'public' | 'datacenter' | 'local'

/** Cluster member role (mirrors instance `ManagedMemberRole`). */
export type ManagedMemberRole = 'primary' | 'replica'

/** Private path used for replication (mirrors `PrivateEndpointTransport`). */
export type ManagedMemberTransport = 'local' | 'datacenter' | 'fabric'

/** Max replica members per cluster — mirrors instance `MANAGED_MAX_REPLICAS`. */
export const MANAGED_MAX_REPLICAS = 2

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
  serverDisplayName: string | null
  role: ManagedMemberRole
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
   * (`settings.image`), in display order — mirrors the instance allowlists
   * (`POSTGRES_ALLOWED_IMAGES` / `MYSQL_ALLOWED_IMAGES` /
   * `MARIADB_ALLOWED_IMAGES` in `turbopanel/src/lib/managed/settings.ts`) and
   * the daemon command-payload mirror
   * (`turbopaneld/src/instance/commands/contracts.ts`). Engines without a curated
   * allowlist yet (`redis` / `clickhouse`) list only their default.
   */
  allowedImages: readonly string[]
  /** Default root username shown in create/credential UX. */
  rootUsername: string
  /** `true` when the backend engine spec declares a `backup` descriptor (see instance `getManagedBackupDescriptor`). */
  supportsBackup: boolean
}

/**
 * Display metadata for managed engine catalog cards (mirrors instance
 * catalog options). `allowedImages` must stay in sync with the instance
 * allowlists — see the field doc on {@link ManagedServiceCatalogEntry}.
 *
 * Neither MySQL nor MariaDB publish an official Alpine-based image, so both
 * default to the Docker Official Image's Debian-based tag, with the
 * vendor-published Oracle Linux (MySQL) / UBI (MariaDB) variant offered as
 * the documented alternative. PostgreSQL's official Alpine variant stays the
 * default for its smaller footprint.
 */
export const MANAGED_SERVICE_CATALOG: readonly ManagedServiceCatalogEntry[] = [
  {
    engine: 'postgres',
    label: 'PostgreSQL',
    description: 'Relational database with backups and connection pooling.',
    status: 'available',
    defaultPort: 5432,
    defaultImage: 'docker.io/library/postgres:18-alpine',
    allowedImages: [
      'docker.io/library/postgres:18-alpine',
      'docker.io/library/postgres:18',
    ],
    rootUsername: 'postgres',
    supportsBackup: true,
  },
  {
    engine: 'mysql',
    label: 'MySQL',
    description: 'Popular SQL database for web apps.',
    status: 'available',
    defaultPort: 3306,
    defaultImage: 'docker.io/library/mysql:9.7',
    allowedImages: [
      'docker.io/library/mysql:9.7',
      'docker.io/library/mysql:9.7-oraclelinux9',
    ],
    rootUsername: 'root',
    supportsBackup: true,
  },
  {
    engine: 'mariadb',
    label: 'MariaDB',
    description: 'MySQL-compatible engine with open-source tooling.',
    status: 'available',
    defaultPort: 3306,
    defaultImage: 'docker.io/library/mariadb:12.3',
    allowedImages: [
      'docker.io/library/mariadb:12.3',
      'docker.io/library/mariadb:12.3-ubi',
    ],
    rootUsername: 'root',
    supportsBackup: true,
  },
  {
    engine: 'redis',
    label: 'Redis',
    description: 'In-memory cache, queues, and pub/sub.',
    status: 'coming-soon',
    defaultPort: 6379,
    defaultImage: 'docker.io/library/redis:7-alpine',
    allowedImages: ['docker.io/library/redis:7-alpine'],
    rootUsername: 'default',
    supportsBackup: false,
  },
  {
    engine: 'clickhouse',
    label: 'ClickHouse',
    description: 'Columnar analytics for metrics and logs.',
    status: 'coming-soon',
    defaultPort: 8123,
    defaultImage: 'docker.io/clickhouse/clickhouse-server:24',
    allowedImages: ['docker.io/clickhouse/clickhouse-server:24'],
    rootUsername: 'default',
    supportsBackup: false,
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
  displayName: string | null
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
  ssl: { enabled: boolean }
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
    bind?: ManagedBindScope
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

export type ManagedUserRecord = {
  id: string
  username: string
  databases: string[]
  privileges: string[]
  createdAt: string
}

export type ManagedServerSummary = {
  id: string
  displayName: string | null
  hostname: string | null
}

export type ManagedListRecord = ManagedEnvironmentRecord & {
  engineDisplayName: string | null
  environmentDisplayName: string | null
  projectId: string
  projectDisplayName: string | null
  workspaceId: string
  workspaceDisplayName: string | null
  serverDisplayName: string | null
  members: ManagedMemberRecord[]
}

export type ManagedDetailResponse = {
  managed: ManagedEnvironmentRecord | null
  connection: ManagedConnectionInfo | null
  settings: ManagedSettings | null
  server: ManagedServerSummary | null
  rootUsername: string | null
  members: ManagedMemberRecord[]
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
  managed_replica_limit: 'This cluster already has the maximum of 2 replicas.',
  managed_member_exists: 'That server already hosts a member of this cluster.',
  managed_member_is_primary:
    'Promote another member first — the primary cannot be removed.',
  datacenter_required: 'That server is not assigned to a site.',
  datacenter_cidr_required: 'That site has no private network yet.',
  datacenter_ip_required: 'That server has no private address on its site.',
  private_path_unavailable: 'No private path between that server and the primary.',
  peer_tunnel_address_required:
    `The ${TURBOFABRIC_PRODUCT_NAME} path between those sites has no overlay address yet.`,
  managed_private_port_exhausted: 'No free private listener port on that server.',
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

export function memberTransportLabel(
  transport: ManagedMemberTransport | null | undefined,
): string {
  switch (transport) {
    case 'local':
      return 'Same server'
    case 'datacenter':
      return 'Same site'
    case 'fabric':
      return TURBOFABRIC_PRODUCT_NAME
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
