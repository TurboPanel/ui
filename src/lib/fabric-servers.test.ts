import { describe, expect, it } from 'vitest'
import {
  FABRIC_PAUSE_UNCONFIRMED_NOTICE,
  FABRIC_PAUSED_NOTICE,
  fabricMemberLabel,
  fabricPausedNotice,
  fabricReconcileLines,
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

  describe('paused notice', () => {
    const outcome = (
      state: 'pending' | 'done' | 'failed',
      action: 'apply' | 'pause' | 'remove' = 'pause',
      error?: string
    ) => ({
      commandId: 'c1',
      action,
      state,
      at: '2026-10-30T15:06:00.000Z',
      ...(error ? { error } : {}),
    })

    it('never claims tunnels are down when no server confirmed', () => {
      expect(fabricPausedNotice([{ name: 'a', reconcile: null }])).toEqual({
        kind: 'unconfirmed',
        text: FABRIC_PAUSE_UNCONFIRMED_NOTICE,
      })
      expect(fabricPausedNotice([]).kind).toBe('unconfirmed')
    })

    it('says down only when every server confirmed', () => {
      expect(
        fabricPausedNotice([
          { name: 'a', reconcile: outcome('done') },
          { name: 'x', reconcile: outcome('done', 'remove') },
        ]).kind
      ).toBe('down')
      expect(fabricPausedNotice([{ name: 'a', reconcile: outcome('done') }]).text).toBe(
        FABRIC_PAUSED_NOTICE
      )
      expect(
        fabricPausedNotice([
          { name: 'a', reconcile: outcome('done') },
          { name: 'w', reconcile: outcome('pending') },
          { name: 'y', reconcile: null },
        ])
      ).toEqual({
        kind: 'pending',
        text: 'Turning TurboFabric off: 1 of 3 servers have taken their tunnel down.',
      })
    })

    it('lists each server that failed with its own error', () => {
      expect(
        fabricPausedNotice([
          { name: 'a', reconcile: outcome('done') },
          { name: 'w', reconcile: outcome('failed', 'pause', 'delete tp0: busy') },
          { name: 'x', reconcile: outcome('failed', 'pause') },
        ])
      ).toMatchObject({
        kind: 'failed',
        failures: ['w: delete tp0: busy', 'x: The server did not say why.'],
      })
    })
  })

  it('turns a reconcile into an error or warnings', () => {
    expect(fabricReconcileLines(null)).toEqual({ error: null, warnings: [] })
    expect(
      fabricReconcileLines({
        commandId: 'c1',
        action: 'apply',
        state: 'failed',
        at: 't',
        error: 'TurboFabric preflight failed: wg is not installed',
      }).error
    ).toBe('TurboFabric preflight failed: wg is not installed')
    expect(
      fabricReconcileLines({
        commandId: 'c1',
        action: 'apply',
        state: 'done',
        at: 't',
        warnings: ['Container networks wait until Docker is installed.'],
      }).warnings
    ).toEqual(['Container networks wait until Docker is installed.'])
    expect(
      fabricReconcileLines({ commandId: 'c1', action: 'apply', state: 'pending', at: 't' })
    ).toEqual({ error: null, warnings: [] })
  })
})
