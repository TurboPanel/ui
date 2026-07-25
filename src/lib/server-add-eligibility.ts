export type OrgServerCapacity = {
  maxServers: number | null
  serverCount: number
  reservedSeatCount: number
  usedSeats: number
  availableSeats: number | null
}

export type ServerAddEligibility = {
  canAdd: boolean
  reason: string | null
}

/**
 * Whether the org may start the add-server flow.
 *
 * Uses org server seat capacity (`maxServers`): enrolled servers and unconsumed
 * registration keys both consume a seat. Omitted/null maxServers = unlimited
 * (self-hosted default). Stripe billing will populate the cap on Workers later.
 */
export function resolveServerAddEligibility(
  capacity?: OrgServerCapacity | null,
): ServerAddEligibility {
  if (capacity?.maxServers == null) {
    return { canAdd: true, reason: null }
  }
  if (capacity.availableSeats !== null && capacity.availableSeats > 0) {
    return { canAdd: true, reason: null }
  }
  return {
    canAdd: false,
    reason: `Server limit reached (${capacity.usedSeats} of ${capacity.maxServers}).`,
  }
}
