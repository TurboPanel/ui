/**
 * Which org servers a tenant environment may be placed on.
 *
 * The co-located control-plane host (`this server`) never runs tenant
 * deploys: the API refuses it as a pin and the scheduler keeps it out of the
 * unpinned pool. The picker mirrors that instead of offering a choice the
 * instance answers with a 403 — and says why when nothing is left, which is
 * every single-host self-hosted install until a second server is enrolled.
 */
export type PlacementCandidate = {
  id: string
  connected: boolean
  colocatedWithInstance?: boolean
}

export const COLOCATED_ONLY_PLACEMENT_HINT =
  'The only connected server is the co-located control-plane host, which does not run tenant deploys. Enrol another server first.'

export function placementDropdownOptions<T extends PlacementCandidate>(
  sortedServers: T[],
  placementServerId: string | null,
): T[] {
  const eligible = sortedServers.filter(
    (server) => server.connected && !server.colocatedWithInstance,
  )
  if (!placementServerId) {
    return eligible
  }
  // The current pin stays visible even when it is offline (or, for the
  // platform's own environment, the co-located host) so the dropdown never
  // shows a value it does not list.
  const selected = sortedServers.find((server) => server.id === placementServerId)
  if (!selected || eligible.some((server) => server.id === selected.id)) {
    return eligible
  }
  return [selected, ...eligible]
}

/** What to say under an empty picker. */
export function emptyPlacementHint(sortedServers: readonly PlacementCandidate[]): string {
  const onlyColocated = sortedServers.some(
    (server) => server.connected && server.colocatedWithInstance,
  )
  return onlyColocated ? COLOCATED_ONLY_PLACEMENT_HINT : 'No connected servers available.'
}
