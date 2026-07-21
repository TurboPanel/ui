/**
 * Managed database UI types — rows live in the `managed` table
 * (`server_id` for standalone services; `project_id` for catalog apps).
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

export type ManagedServiceRecord = {
  id: string
  engine: ManagedServiceEngine | null
  displayName: string | null
  serverId: string | null
  serverDisplayName: string | null
  status: ManagedServiceStatus
  host: string | null
  port: number | null
  createdAt: string
  updatedAt: string
}

export type CreateManagedServiceBody = {
  engine: ManagedServiceEngine
  serverId: string
  displayName?: string
}
