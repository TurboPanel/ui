import { describe, expect, it } from 'vitest'
import { noTunnelHint, tunnelsForServer } from './hosting-tunnel-offer'

const tunnel = (name: string, status: string, carryingServerIds: string[]) => ({
  name,
  status,
  carryingServerIds,
  portals: [],
})

describe('tunnelsForServer', () => {
  const tunnels = [
    tunnel('edge', 'active', ['server-a', 'server-b']),
    tunnel('other', 'pending', ['server-b']),
    tunnel('going', 'removing', ['server-a']),
  ]

  it('keeps the tunnels that run on the server and are not being removed', () => {
    expect(tunnelsForServer(tunnels, 'server-a').map((t) => t.name)).toEqual(['edge'])
    expect(tunnelsForServer(tunnels, 'server-b').map((t) => t.name)).toEqual(['edge', 'other'])
  })

  it('offers nothing without a server', () => {
    expect(tunnelsForServer(tunnels, null)).toEqual([])
  })
})

describe('noTunnelHint', () => {
  it('says why no tunnel can carry the name', () => {
    expect(noTunnelHint({ serverKnown: false, tunnelCount: 2 })).toMatch(/Pick a server/)
    expect(noTunnelHint({ serverKnown: true, tunnelCount: 0 })).toMatch(/No tunnel exists yet/)
    expect(noTunnelHint({ serverKnown: true, tunnelCount: 2 })).toMatch(/server/)
  })
})
