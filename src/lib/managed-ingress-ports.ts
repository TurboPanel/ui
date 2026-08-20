/**
 * Client mirror of the control-plane managed-SQL listener ports
 * (`turbopanel/src/lib/managed/ingress-ports.ts`).
 *
 * These are the ports apps and operators dial on the shared ProxySQL. They are
 * **organization-wide, per protocol family** — one ProxySQL fronts every managed
 * cluster on a server, so a per-service port would defeat the shared listener.
 * MariaDB deliberately rides the MySQL listener because ProxySQL handles both
 * through its MySQL protocol module; PostgreSQL needs its own.
 *
 * Engine-native backend ports (5432 / 3306) are untouched by this setting, so a
 * host already running its own database has no conflict with the defaults.
 *
 * Validation is mirrored so the form can explain a rejection inline; the control
 * plane re-validates, and the daemon additionally preflights the host for an
 * existing listener before it disturbs the running frontend.
 */

export type ManagedIngressPorts = {
  postgres: number
  mysqlFamily: number
}

/** Platform defaults when an organization configures nothing. */
export const MANAGED_INGRESS_PGSQL_PORT = 15432
export const MANAGED_INGRESS_MYSQL_PORT = 13306

export const DEFAULT_MANAGED_INGRESS_PORTS: ManagedIngressPorts = {
  postgres: MANAGED_INGRESS_PGSQL_PORT,
  mysqlFamily: MANAGED_INGRESS_MYSQL_PORT,
}

export const MANAGED_INGRESS_PORT_MIN = 1024
export const MANAGED_INGRESS_PORT_MAX = 65535

/** ProxySQL's own admin interfaces — never a client listener. */
const PROXYSQL_ADMIN_PORTS = new Set([6032, 6132])

/** Reserved for managed member private (replication / remote backend) listeners. */
const MANAGED_PRIVATE_PORT_MIN = 45000
const MANAGED_PRIVATE_PORT_MAX = 45999

export type ManagedIngressPortField = keyof ManagedIngressPorts

export type ManagedIngressPortRejection =
  | 'out_of_range'
  | 'reserved_admin'
  | 'reserved_private_range'
  | 'collision'

const REJECTION_MESSAGES: Record<ManagedIngressPortRejection, string> = {
  out_of_range:
    `Enter a port between ${MANAGED_INGRESS_PORT_MIN} and ${MANAGED_INGRESS_PORT_MAX}.`,
  reserved_admin: 'Reserved for the ProxySQL admin interface.',
  reserved_private_range:
    `Reserved for managed replication listeners (${MANAGED_PRIVATE_PORT_MIN}-${MANAGED_PRIVATE_PORT_MAX}).`,
  collision: 'PostgreSQL and MySQL must use different ports.',
}

export function managedIngressPortRejectionMessage(
  reason: ManagedIngressPortRejection,
): string {
  return REJECTION_MESSAGES[reason]
}

export const MANAGED_INGRESS_PORT_LABELS: Record<
  ManagedIngressPortField,
  string
> = {
  postgres: 'PostgreSQL',
  mysqlFamily: 'MySQL / MariaDB',
}

/** Validate one candidate port in isolation (range + platform-reserved numbers). */
export function rejectManagedIngressPort(
  value: unknown,
): ManagedIngressPortRejection | null {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MANAGED_INGRESS_PORT_MIN ||
    value > MANAGED_INGRESS_PORT_MAX
  ) {
    return 'out_of_range'
  }
  if (PROXYSQL_ADMIN_PORTS.has(value)) return 'reserved_admin'
  if (value >= MANAGED_PRIVATE_PORT_MIN && value <= MANAGED_PRIVATE_PORT_MAX) {
    return 'reserved_private_range'
  }
  return null
}

/**
 * Validate a fully-resolved pair, returning the first problem keyed by the field
 * it belongs to. Cross-family collision is only knowable here, and includes the
 * case where one override lands on the other family's inherited default.
 */
export function validateManagedIngressPorts(
  ports: ManagedIngressPorts,
):
  | { ok: true }
  | { ok: false; field: ManagedIngressPortField; reason: ManagedIngressPortRejection } {
  for (const field of ['postgres', 'mysqlFamily'] as const) {
    const reason = rejectManagedIngressPort(ports[field])
    if (reason) return { ok: false, field, reason }
  }
  if (ports.postgres === ports.mysqlFamily) {
    return { ok: false, field: 'mysqlFamily', reason: 'collision' }
  }
  return { ok: true }
}

/**
 * Parse a form field. Blank means "inherit the platform default", which is
 * distinct from an invalid entry — clearing a port is a legitimate action.
 */
export function parseManagedIngressPortInput(
  raw: string,
): { ok: true; value: number | null } | {
  ok: false
  reason: ManagedIngressPortRejection
} {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: true, value: null }
  if (!/^\d+$/.test(trimmed)) return { ok: false, reason: 'out_of_range' }
  const value = Number(trimmed)
  const reason = rejectManagedIngressPort(value)
  if (reason) return { ok: false, reason }
  return { ok: true, value }
}

/** Merge configured overrides over the platform defaults. */
export function resolveManagedIngressPorts(
  config:
    | { postgres?: number | null; mysqlFamily?: number | null }
    | null
    | undefined,
): ManagedIngressPorts {
  return {
    postgres: config?.postgres ?? DEFAULT_MANAGED_INGRESS_PORTS.postgres,
    mysqlFamily: config?.mysqlFamily ??
      DEFAULT_MANAGED_INGRESS_PORTS.mysqlFamily,
  }
}

/** Which listener an engine's clients dial. MariaDB shares the MySQL family. */
export function managedIngressPortForEngine(
  engineCode: string,
  ports: ManagedIngressPorts = DEFAULT_MANAGED_INGRESS_PORTS,
): number {
  return engineCode === 'mysql' || engineCode === 'mariadb'
    ? ports.mysqlFamily
    : ports.postgres
}
