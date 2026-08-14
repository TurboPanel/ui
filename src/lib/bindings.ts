/**
 * Pure binding key helpers — mirrors instance `bindingPrefixedKeys` /
 * `assertSafeBindingKeyPrefix` in `turbopanel/src/lib/naming.ts`.
 *
 * Create-form previews use {@link previewBindingKeys}. Once a binding exists,
 * the server-returned `keys[]` is authoritative and must be what the UI renders.
 */

import type { ManagedServiceEngine } from '@/lib/managed-services'

export const DEFAULT_BINDING_KEY_PREFIX = 'DATABASE'

export const BINDING_KEY_PREFIX_RE = /^[A-Za-z_]\w*$/

export const MAX_BINDING_KEY_PREFIX_LENGTH = 64

export type BindingPrefixedKeys = {
  url: string
  caCert: string
  readSplit: string
  host: string
  port: string
  database: string
  user: string
  password: string
}

/**
 * Prefixed env keys a binding materializes (order matches instance
 * `bindingPrefixedKeys` object-value order for create previews).
 */
export function bindingPrefixedKeys(prefix: string): BindingPrefixedKeys {
  return {
    url: `${prefix}_URL`,
    caCert: `${prefix}_CA_CERT`,
    readSplit: `${prefix}_READ_SPLIT`,
    host: `${prefix}_HOST`,
    port: `${prefix}_PORT`,
    database: `${prefix}_NAME`,
    user: `${prefix}_USER`,
    password: `${prefix}_PASSWORD`,
  }
}

/**
 * Engine default (unprefixed) keys — source of truth is
 * `spec.binding.unprefixed` in `turbopanel/src/lib/managed/postgres.ts`,
 * `mysql.ts`, and `mariadb.ts`.
 */
export const BINDING_ENGINE_DEFAULT_KEYS: Record<
  ManagedServiceEngine,
  string[]
> = {
  postgres: [
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'PGSSLMODE',
  ],
  mysql: [
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_DATABASE',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
  ],
  mariadb: [
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_DATABASE',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
  ],
  redis: [],
  clickhouse: [],
}

/** Suffixes / exact keys that materialize secrets (never reveal values). */
export const BINDING_SECRET_KEY_SUFFIXES = [
  '_URL',
  '_CA_CERT',
  '_PASSWORD',
  'PGPASSWORD',
  'MYSQL_PASSWORD',
] as const

export function isBindingSecretKey(key: string): boolean {
  if (key === 'PGPASSWORD' || key === 'MYSQL_PASSWORD') return true
  return (
    key.endsWith('_URL') ||
    key.endsWith('_CA_CERT') ||
    key.endsWith('_PASSWORD')
  )
}

export type BindingKeyPrefixValidation =
  | { ok: true; prefix: string }
  | { ok: false; error: string }

/**
 * Validate a binding key prefix for the create form. Rejects empty, oversize,
 * non-identifier, and reserved `TURBOPANEL` / `TURBOPANEL_*` prefixes.
 */
export function validateBindingKeyPrefix(
  prefix: string,
): BindingKeyPrefixValidation {
  const trimmed = prefix.trim()
  if (trimmed.length < 1) {
    return { ok: false, error: 'Key prefix is required.' }
  }
  if (trimmed.length > MAX_BINDING_KEY_PREFIX_LENGTH) {
    return {
      ok: false,
      error: `Key prefix must be at most ${MAX_BINDING_KEY_PREFIX_LENGTH} characters.`,
    }
  }
  if (!BINDING_KEY_PREFIX_RE.test(trimmed)) {
    return {
      ok: false,
      error:
        'Key prefix must start with a letter or underscore and contain only letters, digits, and underscores.',
    }
  }
  if (trimmed === 'TURBOPANEL' || trimmed.startsWith('TURBOPANEL_')) {
    return {
      ok: false,
      error: 'That prefix is reserved by TurboPanel.',
    }
  }
  return { ok: true, prefix: trimmed }
}

/**
 * Keys the service will receive if the create form is submitted as-is.
 * Do not use this for existing bindings — render server `keys[]` instead.
 */
export function previewBindingKeys(input: Readonly<{
  prefix: string
  engine: ManagedServiceEngine
  emitEngineDefaults: boolean
}>): string[] {
  const validation = validateBindingKeyPrefix(input.prefix)
  const prefix = validation.ok ? validation.prefix : input.prefix.trim() || DEFAULT_BINDING_KEY_PREFIX
  const prefixed = bindingPrefixedKeys(prefix)
  const keys = Object.values(prefixed)
  if (input.emitEngineDefaults) {
    keys.push(...BINDING_ENGINE_DEFAULT_KEYS[input.engine])
  }
  return keys
}
