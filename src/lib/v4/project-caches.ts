/**
 * Project caches: the words, the checks and the request bodies behind the
 * Caches card. The checks mirror the control plane's, which answers 400 with
 * its own sentence when they differ.
 */

import type {
  CacheAccess,
  CacheRecord,
  CacheStatus,
  CreateCacheBody,
  ProjectPrincipalRecord,
  UpdateCacheBody,
} from '@/lib/instance-api'
import { plural } from '@/lib/v4/text'

/** Shown read-only in the sheet: there is one engine and no preset. */
export const CACHE_ENGINE_LABEL = 'Valkey 8.1'

/** What every cache's variables are limited to. */
export const CACHE_VARIABLES_NOTE =
  'Only sites and apps of this Hosting Account get these variables.'

export const CACHE_MIN_MEMORY_MB = 16
export const CACHE_MAX_MEMORY_MB = 4096
export const CACHE_DEFAULT_MEMORY_MB = 64
export const CACHE_DEFAULT_PREFIX = 'REDIS'

const NAME_RE = /^[a-z][a-z0-9-]{0,62}$/
const PREFIX_RE = /^[A-Za-z_]\w{0,63}$/
const DIGITS_RE = /^\d+$/

/** The words of the two access choices. */
export const CACHE_ACCESS_CHOICES: readonly Readonly<{
  value: CacheAccess
  title: string
  body: string
}>[] = [
  {
    value: 'socket',
    title: 'Private Socket (Recommended)',
    body: 'A socket file only this Hosting Account can open.',
  },
  {
    value: 'port',
    title: 'Loopback Port',
    body: 'A port on this server that only this Hosting Account can reach.',
  },
]

/** The chip key for a cache's status; the words come from the status vocabulary. */
export function cacheStatusKey(status: CacheStatus): string {
  switch (status) {
    case 'pending':
      return 'cachewaiting'
    case 'applying':
      return 'busy'
    case 'ready':
      return 'ready'
    case 'failed':
      return 'dbfailed'
    case 'stopped':
      return 'stopped'
    default:
      return 'unknown'
  }
}

/** "Private Socket" or "Port 18234". */
export function cacheAccessLabel(cache: Pick<CacheRecord, 'access' | 'port'>): string {
  if (cache.access === 'socket') return 'Private Socket'
  return cache.port === null ? 'Loopback Port' : `Port ${cache.port}`
}

export function cacheMemoryLabel(maxMemoryMb: number): string {
  return `${maxMemoryMb} MiB`
}

/** The row's grey line: memory limit and the Hosting Account. */
export function cacheRowSub(cache: CacheRecord): string {
  return `${cacheMemoryLabel(cache.maxMemoryMb)} · ${cache.hostingAccount}`
}

export function cacheCountNote(count: number): string {
  return plural(count, 'cache')
}

/** The variable names a cache sets for one prefix and access (the control plane's list). */
export function cacheVariableNames(prefix: string, access: CacheAccess): string[] {
  const suffixes =
    access === 'socket'
      ? ['HOST', 'PORT', 'SOCKET', 'USERNAME', 'PASSWORD']
      : ['HOST', 'PORT', 'USERNAME', 'PASSWORD', 'URL']
  return suffixes.map((suffix) => `${prefix}_${suffix}`)
}

/** The names shown live while the prefix is typed; an invalid prefix shows none. */
export function cacheVariablePreview(prefix: string, access: CacheAccess): string[] {
  return validateCachePrefix(prefix) === null ? cacheVariableNames(prefix, access) : []
}

export function validateCacheName(name: string): string | null {
  return NAME_RE.test(name)
    ? null
    : 'Use lower case letters, digits and dashes, starting with a letter.'
}

export function validateCachePrefix(prefix: string): string | null {
  return PREFIX_RE.test(prefix)
    ? null
    : 'Start with a letter or underscore, then use letters, digits and underscores.'
}

/** The memory limit as typed; null when it is a whole number in range. */
export function validateCacheMemory(text: string): string | null {
  const trimmed = text.trim()
  const value = DIGITS_RE.test(trimmed) ? Number(trimmed) : Number.NaN
  if (Number.isInteger(value) && value >= CACHE_MIN_MEMORY_MB && value <= CACHE_MAX_MEMORY_MB) {
    return null
  }
  return `Enter a whole number of MiB from ${CACHE_MIN_MEMORY_MB} to ${CACHE_MAX_MEMORY_MB}.`
}

/** The hint under the memory field. */
export function cacheMemoryHint(): string {
  return `From ${CACHE_MIN_MEMORY_MB} to ${CACHE_MAX_MEMORY_MB} MiB. The Hosting Account's own limit may be lower.`
}

export type CacheForm = Readonly<{
  name: string
  principalId: string | null
  access: CacheAccess
  memory: string
  prefix: string
}>

export function emptyCacheForm(principalId: string | null = null): CacheForm {
  return {
    name: '',
    principalId,
    access: 'socket',
    memory: String(CACHE_DEFAULT_MEMORY_MB),
    prefix: CACHE_DEFAULT_PREFIX,
  }
}

export function cacheFormFor(cache: CacheRecord): CacheForm {
  return {
    name: cache.name,
    principalId: cache.principalId,
    access: cache.access,
    memory: String(cache.maxMemoryMb),
    prefix: cache.keyPrefix,
  }
}

/** The first problem with the form, or null. A name and account only matter when adding. */
export function cacheFormError(form: CacheForm, adding: boolean): string | null {
  if (adding) {
    const name = validateCacheName(form.name.trim())
    if (name !== null) return name
    if (form.principalId === null) return 'Choose a Hosting Account.'
  }
  return validateCacheMemory(form.memory) ?? validateCachePrefix(form.prefix.trim())
}

export function createCacheBody(form: CacheForm): CreateCacheBody | null {
  if (form.principalId === null || cacheFormError(form, true) !== null) return null
  return {
    name: form.name.trim(),
    principalId: form.principalId,
    access: form.access,
    maxMemoryMb: Number(form.memory.trim()),
    keyPrefix: form.prefix.trim(),
  }
}

/** True when a field differs from the record, whether or not the new values are valid. */
export function cacheFormDiffers(cache: CacheRecord, form: CacheForm): boolean {
  return (
    form.access !== cache.access ||
    form.memory.trim() !== String(cache.maxMemoryMb) ||
    form.prefix.trim() !== cache.keyPrefix
  )
}

/** Only what changed; null when nothing did (the control plane refuses an empty change). */
export function updateCacheBody(cache: CacheRecord, form: CacheForm): UpdateCacheBody | null {
  if (cacheFormError(form, false) !== null) return null
  const memory = Number(form.memory.trim())
  const prefix = form.prefix.trim()
  const body: { access?: CacheAccess; maxMemoryMb?: number; keyPrefix?: string } = {}
  if (form.access !== cache.access) body.access = form.access
  if (memory !== cache.maxMemoryMb) body.maxMemoryMb = memory
  if (prefix !== cache.keyPrefix) body.keyPrefix = prefix
  return Object.keys(body).length === 0 ? null : body
}

/**
 * The Hosting Accounts a cache can run as: those a site or app of this
 * environment runs as. The control plane answers 422 for any other.
 */
export function cacheAccountChoices(
  principals: readonly Pick<ProjectPrincipalRecord, 'id' | 'username' | 'serviceIds'>[],
  environmentServiceIds: readonly string[]
): { id: string; name: string }[] {
  const inEnvironment = new Set(environmentServiceIds)
  return principals
    .filter((principal) => principal.serviceIds.some((id) => inEnvironment.has(id)))
    .map((principal) => ({ id: principal.id, name: principal.username }))
}

/** The line a delete result shows when only the record went. */
export const CACHE_RECORD_ONLY_NOTE = 'The server is offline, so only the record was removed.'

export const CACHE_DELETE_DATA_LABEL = 'Also Delete the Cached Data'
