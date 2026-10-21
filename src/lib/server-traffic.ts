import type {
  DatacenterRecord,
  ServerTrafficLink,
  ServerTrafficMapNetwork,
  ServerTrafficNetworkState,
} from '@/lib/instance-api'

/** Plain-words state of one shared network, as the traffic map reports it. */
const STATE_LABELS: Record<ServerTrafficNetworkState, string> = {
  chosen: 'Carrying traffic',
  standby: 'Ready as a backup',
  no_common_address: 'No shared address type',
  link_down: 'Down, last resort only',
  untrusted: 'Not used',
}

export function trafficStateLabel(state: ServerTrafficNetworkState): string {
  return STATE_LABELS[state]
}

export type TrafficTone = 'ok' | 'muted' | 'danger' | 'pending' | 'info'

export function trafficStateTone(state: ServerTrafficNetworkState): TrafficTone {
  if (state === 'chosen') return 'ok'
  if (state === 'standby') return 'info'
  if (state === 'link_down') return 'danger'
  if (state === 'no_common_address') return 'pending'
  return 'muted'
}

export function linkLabel(link: ServerTrafficLink): string {
  if (link === 'up') return 'Up'
  if (link === 'down') return 'Down'
  return 'Not reported'
}

/** The networks traffic may use (trusted), lowest priority number first, then name. */
export function orderedNetworks(datacenters: readonly DatacenterRecord[]): {
  used: DatacenterRecord[]
  unused: DatacenterRecord[]
} {
  const byOrder = (a: DatacenterRecord, b: DatacenterRecord) =>
    a.priority - b.priority ||
    (a.name ?? '').localeCompare(b.name ?? '') ||
    a.id.localeCompare(b.id)
  return {
    used: datacenters.filter((dc) => dc.trusted).sort(byOrder),
    unused: datacenters.filter((dc) => !dc.trusted).sort(byOrder),
  }
}

/** Ids of trusted networks that share their priority number with another trusted network. */
export function tiedNetworkIds(used: readonly DatacenterRecord[]): Set<string> {
  const counts = new Map<number, number>()
  for (const dc of used) counts.set(dc.priority, (counts.get(dc.priority) ?? 0) + 1)
  return new Set(used.filter((dc) => (counts.get(dc.priority) ?? 0) > 1).map((dc) => dc.id))
}

/** One line for a peer: which network carries traffic to it right now. */
export function peerSummary(
  chosenId: string | null,
  networks: readonly ServerTrafficMapNetwork[]
): string {
  if (chosenId === null) return 'No shared network is up'
  const chosen = networks.find((net) => net.datacenterId === chosenId)
  return `Using ${chosen?.name ?? 'an unnamed network'}`
}

/** Why a network is not carrying traffic, or null when nothing needs saying. */
export function networkDownNote(net: ServerTrafficMapNetwork): string | null {
  if (net.localLink === 'down' && net.peerLink === 'down')
    return 'The network card is down on both servers.'
  if (net.localLink === 'down') return 'The network card is down on this server.'
  if (net.peerLink === 'down') return 'The network card is down on the other server.'
  return null
}

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth']

/** "Second", "Third", ... for a 1-based place in the order. */
export function placeLabel(position: number): string {
  return ORDINALS[position - 1] ?? `Number ${position}`
}

/** The one badge a network row shows beside its name; null when it is unused. */
export function networkBadge(
  position: number | null,
  tied: boolean
): { label: string; tone: TrafficTone } | null {
  if (position === null) return { label: 'Not used', tone: 'muted' }
  if (tied) {
    return {
      label: position === 1 ? 'Tied for first' : 'Same priority as another',
      tone: 'pending',
    }
  }
  if (position === 1) return { label: 'Used first', tone: 'ok' }
  return { label: placeLabel(position), tone: 'muted' }
}

/** What "Use this one first" changed, in plain words (one line per renumbered network). */
export function renumberedLines(
  changes: readonly { datacenterId: string; before: number; after: number }[],
  names: ReadonlyMap<string, string>
): string[] {
  return changes.map(
    (change) =>
      `${names.get(change.datacenterId) ?? 'A network'}: priority ${change.before} is now ${change.after}`
  )
}
