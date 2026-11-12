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
  sslMode: string
  caCert: string
  /** Sites run on the server itself only: path of the CA file kept for the site. */
  caFile: string
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
    sslMode: `${prefix}_SSL_MODE`,
    caCert: `${prefix}_CA_CERT`,
    caFile: `${prefix}_CA_FILE`,
    readSplit: `${prefix}_READ_SPLIT`,
    host: `${prefix}_HOST`,
    port: `${prefix}_PORT`,
    database: `${prefix}_NAME`,
    user: `${prefix}_USER`,
    password: `${prefix}_PASSWORD`,
  }
}

export const BINDING_PRESETS = [
  'postgres',
  'mysql',
  'laravel',
  'wordpress',
  'metabase',
  'uptime-kuma',
] as const

export type BindingPreset = (typeof BINDING_PRESETS)[number]

export const BINDING_PRESET_LABELS: Record<BindingPreset, string> = {
  postgres: 'Plain PostgreSQL',
  mysql: 'Plain MySQL',
  laravel: 'Laravel',
  wordpress: 'WordPress',
  metabase: 'Metabase',
  'uptime-kuma': 'Uptime Kuma',
}

/** Presets offered per engine, plain one first. Mirrors `presets.ts` on the control plane. */
const ENGINE_PRESETS: Record<ManagedServiceEngine, readonly BindingPreset[]> = {
  postgres: ['postgres', 'laravel', 'metabase'],
  mysql: ['mysql', 'laravel', 'wordpress', 'metabase', 'uptime-kuma'],
  mariadb: ['mysql', 'laravel', 'wordpress', 'metabase', 'uptime-kuma'],
  redis: [],
  clickhouse: [],
}

/** Presets that fit an engine (empty for engines without bindings). */
export function presetsForEngine(engine: ManagedServiceEngine): readonly BindingPreset[] {
  return ENGINE_PRESETS[engine]
}

/** The plain preset of an engine, or null when the engine has none. */
export function plainPresetForEngine(engine: ManagedServiceEngine): BindingPreset | null {
  return ENGINE_PRESETS[engine][0] ?? null
}

/**
 * Names each preset adds, per engine. Mirrors `PRESET_DEFINITIONS` in
 * `turbopanel/src/features/bindings/presets.ts`. Names that exist only in some
 * TLS modes (`PGSSLROOTCERT`) are listed because the preview cannot know the mode.
 */
const PRESET_NAMES: Record<BindingPreset, (engine: ManagedServiceEngine) => string[]> = {
  postgres: () => [
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'PGSSLMODE',
    'PGSSLROOTCERT',
  ],
  mysql: () => ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'],
  laravel: (engine) => [
    'DB_CONNECTION',
    'DB_HOST',
    'DB_PORT',
    'DB_DATABASE',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_URL',
    engine === 'postgres' ? 'DB_SSLMODE' : 'MYSQL_ATTR_SSL_CA',
  ],
  wordpress: () => ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'],
  metabase: () => [
    'MB_DB_TYPE',
    'MB_DB_HOST',
    'MB_DB_PORT',
    'MB_DB_DBNAME',
    'MB_DB_USER',
    'MB_DB_PASS',
  ],
  'uptime-kuma': () => [
    'UPTIME_KUMA_DB_TYPE',
    'UPTIME_KUMA_DB_HOSTNAME',
    'UPTIME_KUMA_DB_PORT',
    'UPTIME_KUMA_DB_NAME',
    'UPTIME_KUMA_DB_USERNAME',
    'UPTIME_KUMA_DB_PASSWORD',
    'UPTIME_KUMA_DB_SSL',
    'UPTIME_KUMA_DB_CA',
  ],
}

/** Names a preset adds beside the prefixed set (no values). */
export function presetKeyNames(preset: BindingPreset, engine: ManagedServiceEngine): string[] {
  return PRESET_NAMES[preset](engine)
}

const PRESET_SECRET_NAMES: ReadonlySet<string> = new Set([
  'PGPASSWORD',
  'MYSQL_PASSWORD',
  'DB_PASSWORD',
  'DB_URL',
  'MB_DB_PASS',
  'UPTIME_KUMA_DB_PASSWORD',
  'UPTIME_KUMA_DB_CA',
])

/** Suffixes / exact keys that materialize secrets (never reveal values). */
export const BINDING_SECRET_KEY_SUFFIXES = [
  '_URL',
  '_CA_CERT',
  '_PASSWORD',
  'PGPASSWORD',
  'MYSQL_PASSWORD',
] as const

export function isBindingSecretKey(key: string): boolean {
  if (PRESET_SECRET_NAMES.has(key)) return true
  return key.endsWith('_URL') || key.endsWith('_CA_CERT') || key.endsWith('_PASSWORD')
}

export type BindingKeyPrefixValidation = { ok: true; prefix: string } | { ok: false; error: string }

/**
 * Validate a binding key prefix for the create form. Rejects empty, oversize,
 * non-identifier, and reserved `TURBOPANEL` / `TURBOPANEL_*` prefixes.
 */
export function validateBindingKeyPrefix(prefix: string): BindingKeyPrefixValidation {
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
 * Keys the service will receive if the create form is submitted as-is, split
 * into the prefixed set and the names the chosen preset adds.
 * Do not use this for existing bindings — render server `keys[]` instead.
 */
export function previewBindingKeys(
  input: Readonly<{
    prefix: string
    engine: ManagedServiceEngine
    preset: BindingPreset | null
  }>
): { prefixed: string[]; preset: string[] } {
  const validation = validateBindingKeyPrefix(input.prefix)
  const prefix = validation.ok
    ? validation.prefix
    : input.prefix.trim() || DEFAULT_BINDING_KEY_PREFIX
  return {
    prefixed: Object.values(bindingPrefixedKeys(prefix)),
    preset: input.preset ? presetKeyNames(input.preset, input.engine) : [],
  }
}
