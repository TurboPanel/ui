/**
 * TurboPanel compose interpolation: `{$KEY}`, `{$scope.KEY}` or the database
 * form `{$db.<binding>.<field>}`.
 *
 * Parsed before Docker Compose `${VAR}` interpolation. Compiled YAML never
 * contains `{$…}`.
 */

export const VARIABLE_REF_SCOPES = [
  'organization',
  'workspace',
  'project',
  'environment',
  'service',
  'hosting',
  'server',
] as const

export type VariableRefScope = (typeof VARIABLE_REF_SCOPES)[number]

const SCOPE_ALIASES: Record<string, VariableRefScope> = {
  org: 'organization',
  env: 'environment',
}

/** Fields of a database binding that `{$db.<binding>.<field>}` can name. */
export const DB_REF_FIELDS = [
  'host',
  'port',
  'name',
  'user',
  'password',
  'url',
  'ca_file',
  'ca_text',
  'ssl_mode',
  'driver',
  'read_split',
] as const

export type DbRefField = (typeof DB_REF_FIELDS)[number]

const DB_REF_SCOPE = 'db'

const KEY_RE = /^[A-Za-z_]\w*$/
const EXACT_REF_RE = /^\{\$(?:([A-Za-z_]\w*)\.)?(?:([A-Za-z_]\w*)\.)?([A-Za-z_]\w*)\}$/

export type StoredVariableRef = {
  raw: string
  scope: VariableRefScope | null
  key: string
}

export type DbVariableRef = {
  raw: string
  scope: typeof DB_REF_SCOPE
  binding: string
  field: DbRefField
  key: DbRefField
}

export type ParsedVariableRef = StoredVariableRef | DbVariableRef

export type ParseVariableRefResult =
  | { ok: true; ref: ParsedVariableRef }
  | { ok: false; error: 'not_a_ref' }
  | { ok: false; error: 'invalid'; message: string }

export function isVariableRefScope(value: string): value is VariableRefScope {
  return (VARIABLE_REF_SCOPES as readonly string[]).includes(value)
}

export function resolveVariableRefScope(token: string): VariableRefScope | null {
  if (isVariableRefScope(token)) return token
  return SCOPE_ALIASES[token] ?? null
}

export function isDbRefField(value: string): value is DbRefField {
  return (DB_REF_FIELDS as readonly string[]).includes(value)
}

/** True for the `{$db.<binding>.<field>}` form. */
export function isDbRef(ref: ParsedVariableRef): ref is DbVariableRef {
  return ref.scope === DB_REF_SCOPE
}

/** Human label for a parsed ref, for messages. */
export function formatVariableRef(ref: ParsedVariableRef): string {
  if (isDbRef(ref)) return `{$db.${ref.binding}.${ref.field}}`
  return ref.scope ? `{$${ref.scope}.${ref.key}}` : `{$${ref.key}}`
}

/** True when the string contains a TurboPanel `{$` opener. */
export function containsVariableRefOpener(value: string): boolean {
  return value.includes('{$')
}

/**
 * Parse a compose env/build value that must be exactly one `{$…}` ref.
 * Embedded refs (`prefix-{$KEY}`) are invalid.
 */
export function parseExactVariableRef(value: string): ParseVariableRefResult {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{$')) {
    if (containsVariableRefOpener(trimmed)) {
      return {
        ok: false,
        error: 'invalid',
        message:
          'TurboPanel variable refs must be the entire value (e.g. {$KEY} or {$project.KEY})',
      }
    }
    return { ok: false, error: 'not_a_ref' }
  }

  const match = EXACT_REF_RE.exec(trimmed)
  if (!match) {
    return {
      ok: false,
      error: 'invalid',
      message:
        'Invalid TurboPanel variable ref; use {$KEY}, {$scope.KEY} or {$db.<binding>.<field>} with a Compose-safe key',
    }
  }

  const first = match[1]
  const second = match[2]
  const key = match[3] ?? ''
  if (!KEY_RE.test(key)) {
    return {
      ok: false,
      error: 'invalid',
      message: `Invalid variable key "${key}"`,
    }
  }

  if (first && second) return parseDbRef(trimmed, first, second, key)

  const scopeToken = first ?? second
  if (!scopeToken) {
    return { ok: true, ref: { raw: trimmed, scope: null, key } }
  }

  const scope = resolveVariableRefScope(scopeToken)
  if (!scope) {
    return {
      ok: false,
      error: 'invalid',
      message: `Unknown variable scope "${scopeToken}"`,
    }
  }

  return { ok: true, ref: { raw: trimmed, scope, key } }
}

function parseDbRef(
  raw: string,
  scopeToken: string,
  binding: string,
  field: string
): ParseVariableRefResult {
  if (scopeToken !== DB_REF_SCOPE) {
    return {
      ok: false,
      error: 'invalid',
      message: `Unknown variable scope "${scopeToken}"`,
    }
  }
  if (!isDbRefField(field)) {
    return {
      ok: false,
      error: 'invalid',
      message: `Unknown database field "${field}"; use one of ${DB_REF_FIELDS.join(', ')}`,
    }
  }
  return {
    ok: true,
    ref: { raw, scope: DB_REF_SCOPE, binding, field, key: field },
  }
}

/** Compose-native `${KEY}` / `$KEY` capture for secret-interpolation guards. */
const COMPOSE_INTERPOLATION_RE = /\$\{([A-Za-z_]\w*)\}|\$([A-Za-z_]\w*)/g

export function collectComposeInterpolationKeys(value: string): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const match of value.matchAll(COMPOSE_INTERPOLATION_RE)) {
    const key = match[1] ?? match[2]
    if (!key || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}
