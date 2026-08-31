/**
 * Who authored a `hosting` row — the panel, or a compose document.
 *
 * Mirrors the read half of the instance's `src/lib/hosting-compose-owner.ts`.
 * Only the read half: the panel never stamps these keys, because a row this
 * marker applies to is one the *instance* materialized from
 * `services.<name>.x-turbopanel.hosting` at deploy-prepare, and one it will
 * re-assert on every deploy. The panel's job is to recognize such a row and
 * route the edit to the compose document instead of to
 * `PATCH /hostings/{id}`, which answers `409 hosting_owned_by_compose`.
 */

/** Marker key. Truthy means the row is materialized from compose. */
export const HOSTING_COMPOSE_OWNED_METADATA_KEY = 'composeOwned'

/** Compose service the route was declared on. */
export const HOSTING_COMPOSE_SERVICE_METADATA_KEY = 'composeServiceName'

/** The `"<hostname> <pathPrefix>"` identity the row was upserted on. */
export const HOSTING_COMPOSE_ROUTE_METADATA_KEY = 'composeRoute'

function isPlainMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** True when this row is materialized from a compose document. */
export function isComposeOwnedHosting(metadata: unknown): boolean {
  if (!isPlainMapping(metadata)) return false
  return metadata[HOSTING_COMPOSE_OWNED_METADATA_KEY] === true
}

/**
 * The route identity a compose-owned row carries, or null.
 *
 * This is what joins a persisted row to the entry that declared it —
 * `hostingEntryKey(entry)` on the compose side — so the panel can show a row's
 * stored panel-only fields next to the declaration an operator is editing.
 */
export function readHostingComposeRoute(metadata: unknown): string | null {
  if (!isComposeOwnedHosting(metadata) || !isPlainMapping(metadata)) return null
  const route = metadata[HOSTING_COMPOSE_ROUTE_METADATA_KEY]
  return typeof route === 'string' ? route : null
}

/** Compose service that declared this row, or null. */
export function readHostingComposeServiceName(metadata: unknown): string | null {
  if (!isComposeOwnedHosting(metadata) || !isPlainMapping(metadata)) return null
  const name = metadata[HOSTING_COMPOSE_SERVICE_METADATA_KEY]
  return typeof name === 'string' ? name : null
}
