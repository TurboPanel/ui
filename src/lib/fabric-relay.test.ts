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
})
