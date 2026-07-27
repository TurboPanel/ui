/**
 * Managed database UI types — rows live in the `managed` table keyed by
 * `environment_id` for engine projects created from the catalog.
 */

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

export type ManagedServiceCatalogEntry = {
  engine: ManagedServiceEngine
  label: string
  description: string
  status: ManagedEngineAvailability
  defaultPort: number
  defaultImage: string
  /** Default root username shown in create/credential UX. */
  rootUsername: string
}

/** Display metadata for managed engine catalog cards (mirrors instance catalog options). */
export const MANAGED_SERVICE_CATALOG: readonly ManagedServiceCatalogEntry[] = [
  {
    engine: 'postgres',
    label: 'PostgreSQL',
    description: 'Relational database with backups and connection pooling.',
    status: 'available',
    defaultPort: 5432,
    defaultImage: 'docker.io/library/postgres:18-alpine',
    rootUsername: 'postgres',
  },
  {
    engine: 'mysql',
    label: 'MySQL',
    description: 'Popular SQL database for web apps.',
    status: 'coming-soon',
    defaultPort: 3306,
    defaultImage: 'docker.io/library/mysql:8',
    rootUsername: 'root',
  },
  {
    engine: 'mariadb',
    label: 'MariaDB',
    description: 'MySQL-compatible engine with open-source tooling.',
    status: 'coming-soon',
    defaultPort: 3306,
    defaultImage: 'docker.io/library/mariadb:11',
    rootUsername: 'root',
  },
  {
    engine: 'redis',
    label: 'Redis',
    description: 'In-memory cache, queues, and pub/sub.',
    status: 'coming-soon',
    defaultPort: 6379,
    defaultImage: 'docker.io/library/redis:7-alpine',
    rootUsername: 'default',
  },
  {
    engine: 'clickhouse',
    label: 'ClickHouse',
    description: 'Columnar analytics for metrics and logs.',
    status: 'coming-soon',
    defaultPort: 8123,
    defaultImage: 'docker.io/clickhouse/clickhouse-server:24',
    rootUsername: 'default',
  },
]

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
    publishedPort?: number
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
}

export type ManagedDetailResponse = {
  managed: ManagedEnvironmentRecord | null
  connection: ManagedConnectionInfo | null
  settings: ManagedSettings | null
  server: ManagedServerSummary | null
  rootUsername: string | null
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

/** Ports reserved by the host / control plane — rejected for published exposure. */
export const RESERVED_MANAGED_PORTS = [22, 80, 443, 8443, 8880] as const

/** Short display form of a SHA-256 hex digest for compact backup rows. */
export function shortBackupChecksum(checksum: string): string {
  return checksum.slice(0, 10)
}

export function isValidPublishedPort(port: number): boolean {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return false
  }
  return !(RESERVED_MANAGED_PORTS as readonly number[]).includes(port)
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
  datacenter_ip_required: 'Datacenter bind requires a datacenter IP on the server.',
  daemon_key_unavailable: 'Could not reach the daemon key for this server.',
  managed_credential_not_sealed: 'Managed credentials are not ready yet.',
  root_principal_missing: 'Root credentials are missing for this managed service.',
  managed_backup_unsupported: 'Backups are not supported on this managed engine yet.',
  backup_not_found: 'That backup no longer exists.',
  managed_restore_checksum_mismatch:
    'The stored backup failed integrity verification and cannot be restored.',
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
