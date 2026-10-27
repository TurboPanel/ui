import { describe, expect, it } from 'vitest'
import type { InstanceUpdates } from '@/lib/instance-api'
import {
  consoleUpdateAvailable,
  platformUpdateAvailable,
  selfHostedUpdateAvailable,
  unitUpdateAvailable,
  updatePieceLabel,
  updatePieces,
} from '@/lib/instance-updates'

describe('unitUpdateAvailable', () => {
  const installed = { version: '0.1.1', commit: 'aaa' }

  it("renders the server's answer, whatever the identities look like", () => {
    expect(
      unitUpdateAvailable({ installed, target: { commit: 'bbb' }, updateAvailable: false })
    ).toBe(false)
    expect(
      unitUpdateAvailable({ installed, target: { commit: 'aaa' }, updateAvailable: true })
    ).toBe(true)
  })

  it('reads an older control plane by commit only, as the server does', () => {
    // The 2 s loop: the old check compared version:commit, so a target that
    // named the same commit under a different version label read as "behind".
    expect(unitUpdateAvailable({ installed, target: { commit: 'aaa' } })).toBe(false)
    expect(unitUpdateAvailable({ installed, target: { commit: 'bbb' } })).toBe(true)
    expect(unitUpdateAvailable({ installed, target: null })).toBe(false)
    expect(unitUpdateAvailable({ installed: null, target: { commit: 'bbb' } })).toBe(false)
  })

  it('is true for the platform when either unit has an update', () => {
    const none = { installed, target: null }
    expect(platformUpdateAvailable({ instance: none, daemon: none })).toBe(false)
    expect(
      platformUpdateAvailable({ instance: none, daemon: { ...none, updateAvailable: true } })
    ).toBe(true)
  })
})

describe('consoleUpdateAvailable', () => {
  it('compares commits by prefix and is unknown without both', () => {
    const consoleBuild = { version: '0.1.4', commit: 'abc1234' }
    expect(consoleUpdateAvailable(consoleBuild, { commit: 'abc1234def' })).toBe(false)
    expect(consoleUpdateAvailable(consoleBuild, { commit: 'fff9999' })).toBe(true)
    expect(consoleUpdateAvailable(consoleBuild, { commit: 'unknown' })).toBeNull()
    expect(consoleUpdateAvailable(consoleBuild, null)).toBeNull()
    expect(consoleUpdateAvailable(null, { commit: 'fff9999' })).toBeNull()
  })
})

describe('selfHostedUpdateAvailable', () => {
  const current = { installed: { version: '0.1.4', commit: 'same' }, target: { commit: 'same' } }
  const units = {
    instance: { ...current, updateAvailable: false, uiTarget: { commit: 'fff9999' } },
    daemon: { ...current, updateAvailable: false },
  } as unknown as InstanceUpdates['units']

  it('counts a UI-only change, because the UI ships inside the control-plane install', () => {
    expect(platformUpdateAvailable(units)).toBe(false)
    expect(selfHostedUpdateAvailable(units, { version: '0.1.4', commit: 'abc1234' })).toBe(true)
  })

  it('is off when the console already runs the UI target or its build is unknown', () => {
    expect(selfHostedUpdateAvailable(units, { version: '0.1.4', commit: 'fff99999' })).toBe(false)
    expect(selfHostedUpdateAvailable(units, null)).toBe(false)
  })

  it('still follows the control plane and daemon', () => {
    const behind = {
      ...units,
      instance: { ...units.instance, updateAvailable: true },
    } as unknown as InstanceUpdates['units']
    expect(selfHostedUpdateAvailable(behind, null)).toBe(true)
  })
})

describe('updatePieces', () => {
  function target(version: string, commit: string) {
    return { commit, buildId: 'b', builtAt: '', channel: 'canary', manifestUrl: '', version }
  }

  function units(): InstanceUpdates['units'] {
    return {
      instance: {
        installed: { version: '0.1.4', commit: 'old' },
        target: target('0.1.5-canary.1', 'cp1'),
        uiTarget: target('0.1.5-canary.2', 'ui2'),
        updateAvailable: true,
      },
      daemon: {
        installed: { version: '0.1.5', commit: 'old' },
        target: target('0.1.6-canary.3', 'dm3'),
        serverId: 'server-1',
        connected: true,
        updateAvailable: true,
      },
    }
  }

  const oldConsole = { version: '0.1.4', commit: 'ui0' }

  it('lists control plane, web interface and daemon in that order, each with its own version', () => {
    expect(updatePieces(units(), oldConsole).map(updatePieceLabel)).toEqual([
      'control plane v0.1.5-canary.1',
      'web interface v0.1.5-canary.2',
      'daemon v0.1.6-canary.3',
    ])
  })

  it('leaves out pieces that are current, unknown, disconnected or have nothing to name', () => {
    const data = units()
    data.instance.updateAvailable = false
    data.daemon.connected = false
    expect(updatePieces(data, null)).toEqual([])
    const noTarget = units()
    noTarget.instance.target = null
    noTarget.instance.uiTarget = null
    expect(updatePieces(noTarget, oldConsole).map((piece) => piece.name)).toEqual(['daemon'])
  })
})
