import { describe, expect, it } from 'vitest'
import { FABRIC_CELL_NONE, fabricServerCell, fabricServerCells } from '@/lib/fabric-server-cell'
import type { OrgFabricSettings, RelayRecord } from '@/lib/instance-api'

function relay(serverId: string, extra: Partial<RelayRecord> = {}): RelayRecord {
  return {
    serverId,
    address: `10.250.0.${serverId.length}`,
    reconcile: null,
    ...extra,
  } as RelayRecord
}

function settings(extra: Partial<OrgFabricSettings>): OrgFabricSettings {
  return {
    enabled: true,
    paused: false,
    fabric: {
      id: 'f1',
      cidr: '10.250.0.0/16',
      mtu: 1420,
      allowRelay: false,
      containerPool: '10.192.0.0/12',
    },
    relays: [],
    servers: [],
    ...extra,
  } as OrgFabricSettings
}

function member(serverId: string, enabled = true) {
  return {
    serverId,
    name: serverId,
    enabled,
    member: true,
    role: 'client' as const,
    roleSource: 'automatic' as const,
    automaticRole: 'client' as const,
  }
}

describe('fabricServerCells', () => {
  it('shows a dash for every server when TurboFabric is not set up', () => {
    const cells = fabricServerCells(settings({ enabled: false, fabric: undefined }))
    expect(fabricServerCell(cells, 's1')).toEqual(FABRIC_CELL_NONE)
    expect(fabricServerCell(fabricServerCells(undefined), 's1')).toEqual(FABRIC_CELL_NONE)
  })

  it('shows the address when on, Off when switched out and Not Joined without one', () => {
    const cells = fabricServerCells(
      settings({
        relays: [relay('a')],
        servers: [member('a'), member('b', false), { ...member('c'), member: false }],
      })
    )
    expect(fabricServerCell(cells, 'a')).toEqual({ label: '10.250.0.1', address: true })
    expect(fabricServerCell(cells, 'b').label).toBe('Off')
    expect(fabricServerCell(cells, 'c').label).toBe('Not Joined')
    expect(fabricServerCell(cells, 'unknown').label).toBe('Not Joined')
  })

  it('shows Paused while the organization has it turned off', () => {
    const cells = fabricServerCells(
      settings({ enabled: false, paused: true, relays: [relay('a')], servers: [member('a')] })
    )
    expect(fabricServerCell(cells, 'a').label).toBe('Paused')
  })

  it('shows Needs Attention with the error when the last change failed, even while paused', () => {
    const failed = relay('a', {
      reconcile: {
        commandId: 'c1',
        action: 'pause',
        state: 'failed',
        at: '2026-10-30T15:06:00Z',
        error: 'delete tp0: Operation not permitted',
      },
    })
    const cells = fabricServerCells(
      settings({ enabled: false, paused: true, relays: [failed], servers: [member('a')] })
    )
    expect(fabricServerCell(cells, 'a')).toEqual({
      label: 'Needs Attention',
      detail: 'delete tp0: Operation not permitted',
      attention: true,
    })
  })
})
