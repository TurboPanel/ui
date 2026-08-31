/**
 * Read and write the top-level `networks:` block on a compose document.
 *
 * The editor needs the same three things it needs for principals: the declared
 * keys *in document order* (a map's key order is the YAML's, which is the
 * operator's), a way to add, rename, or remove one without disturbing the rest
 * of the entry, and a fresh name for a network the operator has just asked for.
 *
 * The one attribute this module has an opinion about is `driver`, because its
 * *value* is the authored spanning signal: `driver: overlay` is what makes a
 * network TurboFabric-eligible ({@link SPANNING_NETWORK_DRIVER}). Everything
 * else under the entry is carried through untouched — the YAML lens is where a
 * network's `ipam` or `labels` get authored, and a visual editor that silently
 * dropped them on every driver change would be worse than no editor.
 *
 * Pure on purpose — the section owns the state, this owns the shape.
 */

import { SPANNING_NETWORK_DRIVER } from './field-policy'
import type { ComposeDocument } from './types'

/** One `networks.<key>` entry. Compose allows an empty (`null`/`{}`) entry. */
export type ComposeNetworkEntry = Record<string, unknown>

/**
 * What Compose accepts as a top-level `networks:` key.
 *
 * Deliberately the permissive Docker resource-name shape rather than the
 * stricter principal-alias rule: a network key is a plain Compose identifier
 * and refusing e.g. `front.end` here would reject documents that deploy.
 */
const NETWORK_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/

export function isComposeNetworkName(value: string): boolean {
  return NETWORK_NAME_RE.test(value)
}

function isPlainMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Declared networks with their entries, in document order.
 *
 * A `null` or non-mapping entry (`frontend:` with nothing under it, which
 * Compose accepts) reads as `{}` so the editor has something to render and to
 * write a driver onto.
 */
export function readComposeNetworks(
  document: ComposeDocument | null | undefined,
): Record<string, ComposeNetworkEntry> {
  const data = document?.data
  if (!isPlainMapping(data)) return {}
  const networks = data.networks
  if (!isPlainMapping(networks)) return {}
  const out: Record<string, ComposeNetworkEntry> = {}
  for (const [key, entry] of Object.entries(networks)) {
    out[key] = isPlainMapping(entry) ? entry : {}
  }
  return out
}

/**
 * Replace the whole `networks:` block.
 *
 * An empty map removes the key rather than writing `networks: {}` — a bare
 * empty mapping is noise the YAML lens would then show and the linter would
 * have to explain.
 */
export function writeComposeNetworks(
  document: ComposeDocument,
  networks: Readonly<Record<string, ComposeNetworkEntry>>,
): ComposeDocument {
  const data = { ...document.data } as Record<string, unknown>
  if (Object.keys(networks).length === 0) {
    delete data.networks
  } else {
    data.networks = { ...networks }
  }
  return { ...document, data: data as ComposeDocument['data'] }
}

/** The `driver:` an entry declares, or `null` when it declares none. */
export function composeNetworkDriver(entry: ComposeNetworkEntry): string | null {
  const driver = entry.driver
  if (typeof driver !== 'string') return null
  const trimmed = driver.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** True for the one driver value TurboPanel acts on. */
export function isSpanningComposeNetwork(entry: ComposeNetworkEntry): boolean {
  return composeNetworkDriver(entry) === SPANNING_NETWORK_DRIVER
}

/**
 * Set or clear one entry's `driver`, leaving every other attribute alone.
 *
 * `null` deletes the key rather than writing `driver: bridge`: an undeclared
 * driver already *is* bridge to Docker, and spelling out a default the operator
 * did not type is an edit to their document they did not ask for.
 */
export function setComposeNetworkDriver(
  entry: ComposeNetworkEntry,
  driver: string | null,
): ComposeNetworkEntry {
  const next = { ...entry }
  if (driver === null) delete next.driver
  else next.driver = driver
  return next
}

/** A network key seeded from `seed` that does not collide with an existing one. */
export function nextComposeNetworkName(
  existing: Iterable<string>,
  seed: string,
): string {
  const taken = new Set(existing)
  const folded = seed.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
  const base = isComposeNetworkName(folded) ? folded : 'network'
  if (!taken.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

/**
 * Rename one entry, keeping its position in the block.
 *
 * Order is the operator's, so the renamed entry stays where it was rather than
 * jumping to the end the way `{ ...rest, [next]: entry }` would move it.
 */
export function renameComposeNetwork(
  networks: Readonly<Record<string, ComposeNetworkEntry>>,
  from: string,
  to: string,
): Record<string, ComposeNetworkEntry> {
  const out: Record<string, ComposeNetworkEntry> = {}
  for (const [key, entry] of Object.entries(networks)) {
    if (key === from) out[to] = entry
    else out[key] = entry
  }
  return out
}
