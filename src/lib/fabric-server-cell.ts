import type { OrgFabricSettings } from '@/lib/instance-api'

/** What the Servers list shows for one server under TurboFabric. */
export type FabricServerCell = Readonly<{
  label: string
  /** A second line, e.g. the server's own error. */
  detail?: string
  /** Something went wrong on this server and someone should look. */
  attention?: boolean
  /** The label is a `tp0` address (shown in a monospace face). */
  address?: boolean
}>

/** TurboFabric is not set up for the organization (or could not be read). */
export const FABRIC_CELL_NONE: FabricServerCell = { label: '—' }

const OFF: FabricServerCell = { label: 'Off' }
const PAUSED: FabricServerCell = { label: 'Paused' }
const NOT_JOINED: FabricServerCell = { label: 'Not Joined' }

/**
 * Each server's TurboFabric state from GET fabric: its `tp0` address when on,
 * Paused while the organization has it turned off, Off when the server is
 * switched out, Not Joined without an address, and Needs Attention (with the
 * server's own error) when its last change failed. A failure wins over every
 * other state, because it is the one that needs someone.
 */
export function fabricServerCells(
  settings: OrgFabricSettings | undefined
): ReadonlyMap<string, FabricServerCell> {
  const cells = new Map<string, FabricServerCell>()
  if (!settings || (!settings.fabric && !settings.paused)) return cells
  const relayByServer = new Map(settings.relays.map((relay) => [relay.serverId, relay]))
  const serverIds = new Set([
    ...settings.servers.map((row) => row.serverId),
    ...relayByServer.keys(),
  ])
  const switchedOff = new Set(
    settings.servers.filter((row) => !row.enabled).map((row) => row.serverId)
  )
  for (const serverId of serverIds) {
    const relay = relayByServer.get(serverId)
    cells.set(
      serverId,
      cellFor({
        failure: relay?.reconcile?.state === 'failed' ? (relay.reconcile.error ?? '') : null,
        switchedOff: switchedOff.has(serverId),
        paused: settings.paused,
        address: relay?.address ?? null,
      })
    )
  }
  return cells
}

function cellFor(
  input: Readonly<{
    failure: string | null
    switchedOff: boolean
    paused: boolean
    address: string | null
  }>
): FabricServerCell {
  if (input.failure !== null) {
    return {
      label: 'Needs Attention',
      detail: input.failure || 'The server did not say why.',
      attention: true,
    }
  }
  if (input.switchedOff) return OFF
  if (input.paused) return PAUSED
  if (input.address) return { label: input.address, address: true }
  return NOT_JOINED
}

/** The cell for one server; `—` when TurboFabric is not set up. */
export function fabricServerCell(
  cells: ReadonlyMap<string, FabricServerCell>,
  serverId: string
): FabricServerCell {
  if (cells.size === 0) return FABRIC_CELL_NONE
  return cells.get(serverId) ?? NOT_JOINED
}
