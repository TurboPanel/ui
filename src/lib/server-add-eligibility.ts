export type ServerAddEligibility = {
  canAdd: boolean
  reason: string | null
}

/**
 * Whether the org may start the add-server flow.
 *
 * Future: require a free server slot from the subscription quota before
 * provisioning a registration key. Until billing exists, org owners may add
 * servers (key minted during the flow; never shown as a license list).
 */
export function resolveServerAddEligibility(): ServerAddEligibility {
  // Future: compare subscription.availableServerSlots against enrolled servers.
  return { canAdd: true, reason: null }
}
