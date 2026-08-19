/**
 * Client mirror of the control-plane managed-SQL TLS policy
 * (`turbopanel/src/lib/managed/ssl.ts`).
 *
 * The mode is a **client-facing** policy at the ProxySQL boundary, never a
 * switch for engine TLS — the ProxySQL → engine leg is always encrypted. It
 * decides whether ProxySQL refuses a plaintext client session, and which
 * verification behavior the generated connection string asks a driver for.
 *
 * Keep the mode list and the platform fallback in step with that module; the
 * control plane rejects an unrecognized mode rather than downgrading it.
 */

/** Ordered weakest → strongest, matching the control-plane constant. */
export const MANAGED_SSL_MODES = [
  'disable',
  'allow',
  'prefer',
  'require',
  'verify-ca',
  'verify-full',
] as const

export type ManagedSslMode = (typeof MANAGED_SSL_MODES)[number]

/** Platform fallback when neither the service nor the org configures a mode. */
export const DEFAULT_MANAGED_SSL_MODE: ManagedSslMode = 'require'

const SSL_MODE_LABELS: Record<ManagedSslMode, string> = {
  'disable': 'Disable',
  'allow': 'Allow',
  'prefer': 'Prefer',
  'require': 'Require',
  'verify-ca': 'Verify CA',
  'verify-full': 'Verify Full',
}

const SSL_MODE_HINTS: Record<ManagedSslMode, string> = {
  'disable': 'Clients connect in plaintext. Only for a local, trusted path.',
  'allow': 'Plaintext preferred; TLS is used only if the client asks for it.',
  'prefer': 'TLS attempted first, plaintext accepted as a fallback.',
  'require': 'Plaintext sessions are refused. Certificate is not verified.',
  'verify-ca': 'Refuses plaintext and verifies the certificate against the org CA.',
  'verify-full': 'Verifies the org CA and that the hostname matches the certificate.',
}

export function isManagedSslMode(value: unknown): value is ManagedSslMode {
  return typeof value === 'string' &&
    (MANAGED_SSL_MODES as readonly string[]).includes(value)
}

export function managedSslModeLabel(mode: ManagedSslMode): string {
  return SSL_MODE_LABELS[mode]
}

export function managedSslModeHint(mode: ManagedSslMode): string {
  return SSL_MODE_HINTS[mode]
}

/** Effective mode for a cluster: service override → org default → platform. */
export function resolveManagedSslMode(
  configured: ManagedSslMode | null | undefined,
  organizationDefault?: ManagedSslMode | null | undefined,
): ManagedSslMode {
  return configured ?? organizationDefault ?? DEFAULT_MANAGED_SSL_MODE
}

/**
 * Label for an inheriting selection, e.g. `Organization default (Require)`, so
 * the picker can say what "inherit" resolves to today instead of leaving the
 * operator to guess.
 */
export function managedSslInheritLabel(
  inheritedFrom: ManagedSslMode | null | undefined,
  scope: 'organization' | 'platform' = 'organization',
): string {
  const effective = inheritedFrom ?? DEFAULT_MANAGED_SSL_MODE
  const prefix = scope === 'organization' ? 'Organization default' : 'Platform default'
  return `${prefix} (${managedSslModeLabel(effective)})`
}

/**
 * Operator-facing description of the resolved TLS policy for a cluster, for the
 * Connect surface: what the DSN says, whether plaintext is refused, and where
 * the mode came from so an unexpected value is traceable to the org default
 * rather than looking like a bug.
 */
export function describeManagedSslPolicy(
  engineCode: string | null | undefined,
  view: {
    configured: ManagedSslMode | null
    effective: ManagedSslMode
    organizationDefault: ManagedSslMode | null
  },
): { param: string; enforcement: string; source: string; verifies: boolean } {
  let source = 'platform default'
  if (view.configured) {
    source = 'service override'
  } else if (view.organizationDefault) {
    source = 'organization default'
  }
  return {
    param: managedSslDsnParam(engineCode, view.effective),
    enforcement: managedSslRequiresTls(view.effective)
      ? 'plaintext refused'
      : 'plaintext allowed',
    source,
    verifies: managedSslVerifiesServer(view.effective),
  }
}

/** True when ProxySQL refuses an unencrypted client session in this mode. */
export function managedSslRequiresTls(mode: ManagedSslMode): boolean {
  return mode === 'require' || mode === 'verify-ca' || mode === 'verify-full'
}

/** True when the client is told to validate the server certificate chain. */
export function managedSslVerifiesServer(mode: ManagedSslMode): boolean {
  return mode === 'verify-ca' || mode === 'verify-full'
}

/**
 * How the mode is spelled in a connection string for this engine family.
 * MySQL/MariaDB use `ssl-mode` with uppercase values and have no separate
 * "try plaintext first" value, so `allow` and `prefer` share `PREFERRED`.
 */
export function managedSslDsnParam(
  engineCode: string | null | undefined,
  mode: ManagedSslMode,
): string {
  if (engineCode === 'mysql' || engineCode === 'mariadb') {
    return `ssl-mode=${mysqlFamilySslMode(mode)}`
  }
  return `sslmode=${mode}`
}

function mysqlFamilySslMode(mode: ManagedSslMode): string {
  switch (mode) {
    case 'disable':
      return 'DISABLED'
    case 'allow':
    case 'prefer':
      return 'PREFERRED'
    case 'require':
      return 'REQUIRED'
    case 'verify-ca':
      return 'VERIFY_CA'
    case 'verify-full':
      return 'VERIFY_IDENTITY'
  }
}
