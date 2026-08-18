import { describe, expect, it } from 'vitest'
import { toRelayRecord, type FabricRelayWireRow } from './instance-api'

function wireRow(
  patch: Partial<FabricRelayWireRow> = {},
): FabricRelayWireRow {
  return {
    serverId: 'srv-1',
    address: '10.250.0.1',
    role: 'gateway',
    keepalive: null,
    endpointAddress: null,
    publicKey: null,
    prefix: '10.192.0.0/16',
    ...patch,
  }
}

describe('toRelayRecord', () => {
  it('preserves resolvedAdvertisedCidrs from the API response', () => {
    const record = toRelayRecord(
      wireRow({
        advertisedCidrs: [],
        resolvedAdvertisedCidrs: ['198.51.100.0/24', '203.0.113.0/24'],
      }),
    )
    expect(record.advertisedCidrs).toEqual([])
    expect(record.resolvedAdvertisedCidrs).toEqual([
      '198.51.100.0/24',
      '203.0.113.0/24',
    ])
  })

  it('defaults omitted resolvedAdvertisedCidrs to an empty list', () => {
    const record = toRelayRecord(wireRow())
    expect(record.resolvedAdvertisedCidrs).toEqual([])
  })

  it('defaults omitted paths and relay policy fields', () => {
    const record = toRelayRecord(wireRow())
    expect(record.paths).toEqual([])
    expect(record.allowRelay).toBeNull()
    expect(record.effectiveAllowRelay).toBe(false)
    expect(record.preferredGatewayIds).toEqual([])
    expect(record.gatewayEligible).toBe(false)
  })

  it('preserves stamped paths and policy fields', () => {
    const record = toRelayRecord(
      wireRow({
        paths: [
          {
            peerServerId: 'srv-2',
            selected: 'gateway',
            viaServerId: 'srv-gw',
            latencyMs: 44,
            degraded: false,
          },
        ],
        allowRelay: false,
        effectiveAllowRelay: false,
        preferredGatewayIds: ['srv-gw'],
        gatewayEligible: true,
      }),
    )
    expect(record.paths).toEqual([
      {
        peerServerId: 'srv-2',
        selected: 'gateway',
        viaServerId: 'srv-gw',
        latencyMs: 44,
        degraded: false,
      },
    ])
    expect(record.allowRelay).toBe(false)
    expect(record.preferredGatewayIds).toEqual(['srv-gw'])
    expect(record.gatewayEligible).toBe(true)
  })
})
