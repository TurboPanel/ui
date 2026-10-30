import { describe, expect, it } from 'vitest'
import {
  fabricMemberLabel,
  fabricRoleChoice,
  fabricRoleOptions,
  fabricRolePatch,
  fabricServerOffConfirm,
  fabricServerRoleLabel,
  fabricState,
  fabricStateLabel,
} from '@/lib/fabric-servers'

describe('fabric-servers', () => {
  it('reads on, paused and off', () => {
    expect(fabricState({ enabled: true, paused: false })).toBe('on')
    expect(fabricState({ enabled: false, paused: true })).toBe('paused')
    expect(fabricState({ enabled: false, paused: false })).toBe('off')
    expect(fabricState(undefined)).toBe('off')
    expect(fabricStateLabel('on')).toBe('On')
    expect(fabricStateLabel('paused')).toBe('Paused')
    expect(fabricStateLabel('off')).toBe('Off')
  })

  it('maps roles to the picker and back', () => {
    expect(fabricServerRoleLabel('gateway')).toBe('Gateway')
    expect(fabricServerRoleLabel('client')).toBe('Client')
    expect(fabricRoleChoice({ role: 'gateway', roleSource: 'automatic' })).toBe('automatic')
    expect(fabricRoleChoice({ role: 'client', roleSource: 'operator' })).toBe('client')
    expect(fabricRolePatch('automatic')).toBeNull()
    expect(fabricRolePatch('gateway')).toBe('gateway')
    expect(fabricRoleOptions('client').map((option) => option.label)).toEqual([
      'Automatic (Client)',
      'Gateway',
      'Client',
    ])
  })

  it('words membership and the switch-off confirm', () => {
    expect(fabricMemberLabel(true)).toBe('Has a TurboFabric address')
    expect(fabricMemberLabel(false)).toBe('No TurboFabric address yet')
    expect(fabricServerOffConfirm('alpha').body).toContain("alpha's tunnel goes down")
  })
})
