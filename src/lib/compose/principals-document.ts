/**
 * Read and write the root `x-turbopanel.principals` map on a compose document.
 *
 * The editor needs three things the parser alone does not give it: the declared
 * aliases *in a stable order* (a map's key order is the YAML's, which is the
 * operator's), a way to add or remove one without touching the rest of the
 * document, and a fresh name for a service that has just been created and needs
 * an account to run as.
 *
 * Pure on purpose — the section owns the state, this owns the shape — and the
 * only place in the UI that writes the root block, so there is one answer to
 * "what does adding a principal do to the document".
 */

import {
  parseRootExtension,
  TURBOPANEL_ROOT_EXTENSION_KEY,
  type PrincipalSpec,
} from '@/lib/compose/root-extension'
import { isPrincipalAlias } from '@/lib/compose/service-kind'
import type { ComposeDocument } from '@/lib/compose/types'

function isPlainMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Declared aliases with their specs, in document order. */
export function readComposePrincipals(
  document: ComposeDocument | null | undefined
): Record<string, PrincipalSpec> {
  const data = document?.data
  if (!isPlainMapping(data)) return {}
  return parseRootExtension(data[TURBOPANEL_ROOT_EXTENSION_KEY])?.principals ?? {}
}

/** Declared aliases, in document order. */
export function composePrincipalAliases(
  document: ComposeDocument | null | undefined
): string[] {
  return Object.keys(readComposePrincipals(document))
}

/**
 * Replace the whole `principals` map.
 *
 * An empty map removes the key, and a root block left with nothing in it is
 * removed too: a bare `x-turbopanel: {}` is noise in the YAML, and the linter
 * would have to explain it.
 */
export function writeComposePrincipals(
  document: ComposeDocument,
  principals: Record<string, PrincipalSpec>
): ComposeDocument {
  const data = { ...document.data } as Record<string, unknown>
  const currentRoot = isPlainMapping(data[TURBOPANEL_ROOT_EXTENSION_KEY])
    ? { ...(data[TURBOPANEL_ROOT_EXTENSION_KEY] as Record<string, unknown>) }
    : {}

  if (Object.keys(principals).length === 0) {
    delete currentRoot.principals
  } else {
    currentRoot.principals = principals
  }

  if (Object.keys(currentRoot).length === 0) {
    delete data[TURBOPANEL_ROOT_EXTENSION_KEY]
  } else {
    data[TURBOPANEL_ROOT_EXTENSION_KEY] = currentRoot
  }

  return { ...document, data: data as ComposeDocument['data'] }
}

/**
 * A declared alias for `seed` that does not collide with an existing one.
 *
 * Seeded from the compose service name because that is the name the operator
 * already chose for the thing the account runs — `web` gets `web`, and a second
 * service that wants its own account gets `web-2` rather than a serial number
 * with no relationship to anything.
 */
export function nextPrincipalAlias(
  existing: Iterable<string>,
  seed: string
): string {
  const taken = new Set(existing)
  const folded = seed.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const base = isPrincipalAlias(folded) ? folded : 'app'
  if (!taken.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}
