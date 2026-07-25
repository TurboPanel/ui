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

export type ManagedServiceStatus =
  | 'available'
  | 'coming-soon'
  | 'provisioning'
  | 'ready'
  | 'failed'

export type ManagedServiceCatalogEntry = {
  engine: ManagedServiceEngine
  label: string
  description: string
  status: ManagedServiceStatus
  defaultPort: number
}

/** Display metadata for managed engine catalog cards (mirrors instance catalog options). */
export const MANAGED_SERVICE_CATALOG: readonly ManagedServiceCatalogEntry[] = [
  {
    engine: 'postgres',
    label: 'PostgreSQL',
    description: 'Relational database with backups and connection pooling.',
    status: 'available',
    defaultPort: 5432,
  },
  {
    engine: 'mysql',
    label: 'MySQL',
    description: 'Popular SQL database for web apps.',
    status: 'coming-soon',
    defaultPort: 3306,
  },
  {
    engine: 'mariadb',
    label: 'MariaDB',
    description: 'MySQL-compatible engine with open-source tooling.',
    status: 'coming-soon',
    defaultPort: 3306,
  },
  {
    engine: 'redis',
    label: 'Redis',
    description: 'In-memory cache, queues, and pub/sub.',
    status: 'coming-soon',
    defaultPort: 6379,
  },
  {
    engine: 'clickhouse',
    label: 'ClickHouse',
    description: 'Columnar analytics for metrics and logs.',
    status: 'coming-soon',
    defaultPort: 8123,
  },
]

export type ManagedEnvironmentRecord = {
  id: string
  environmentId: string | null
  displayName: string | null
  engine: ManagedServiceEngine | null
  status: 'provisioning' | 'ready' | 'failed'
  host: string | null
  port: number | null
  serverId: string | null
  metadata: Record<string, unknown>
  options: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type ProvisionManagedBody = {
  displayName?: string
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
