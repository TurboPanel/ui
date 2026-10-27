import { describe, expect, it } from 'vitest'
import type { InstanceUpdates } from '@/lib/instance-api'
import {
  fleetUpdateSignals,
  instanceAdminUpdatePending,
  updateIndicator,
  versionClick,
  versionEntryAccessibilityLabel,
} from '@/lib/update-entry'

function updates(overrides: Partial<InstanceUpdates> = {}): InstanceUpdates {
  const target = {
    commit: 'abc1234def',
    buildId: '20261027-153053-abc1234',
    builtAt: '',
    channel: 'canary',
    manifestUrl: 'https://example.test/manifest.json',
    version: '0.1.21-canary.3',
  }
  return {
    ok: true,
    channel: 'canary',
    runtime: 'deno',
    units: {
      instance: {
        installed: { version: '0.1.21', commit: 'abc1234def' },
        target,
        uiTarget: null,
        updateAvailable: false,
      },
      daemon: {
        installed: { version: '0.1.21', commit: 'abc1234def' },
        target,
        serverId: 'server-1',
        connected: true,
        updateAvailable: false,
      },
    },
    ...overrides,
  }
}

describe('fleetUpdateSignals', () => {
  it('reads the reserved daemons-behind and paused fields, false when absent', () => {
    expect(fleetUpdateSignals(updates())).toEqual({ daemonsBehind: false, paused: false })
    expect(fleetUpdateSignals(updates({ daemonsBehind: true, updatesPaused: true }))).toEqual({
      daemonsBehind: true,
      paused: true,
    })
    expect(fleetUpdateSignals(undefined)).toEqual({ daemonsBehind: false, paused: false })
  })
})

describe('instanceAdminUpdatePending', () => {
  const none = { activeRun: false, consoleBuild: null }

  it('self-hosted: the control plane, the co-located daemon or any connected daemon behind', () => {
    expect(instanceAdminUpdatePending({ updates: updates(), ...none })).toBe(false)
    const controlPlane = updates()
    controlPlane.units.instance.updateAvailable = true
    expect(instanceAdminUpdatePending({ updates: controlPlane, ...none })).toBe(true)
    const colocated = updates()
    colocated.units.daemon.updateAvailable = true
    expect(instanceAdminUpdatePending({ updates: colocated, ...none })).toBe(true)
    expect(instanceAdminUpdatePending({ updates: updates({ daemonsBehind: true }), ...none })).toBe(
      true
    )
  })

  it('self-hosted: an older web interface than the channel serves', () => {
    const ui = updates()
    ui.units.instance.uiTarget = { ...ui.units.instance.target!, commit: 'ui-new' }
    expect(
      instanceAdminUpdatePending({
        updates: ui,
        activeRun: false,
        consoleBuild: { version: '0.1.17', commit: 'ui-old' },
      })
    ).toBe(true)
  })

  it('hosted: only daemons count, the platform updates the control plane', () => {
    const hosted = updates({ runtime: 'workers', updatesManaged: true })
    hosted.units.instance.updateAvailable = true
    expect(instanceAdminUpdatePending({ updates: hosted, ...none })).toBe(false)
    expect(
      instanceAdminUpdatePending({ updates: { ...hosted, daemonsBehind: true }, ...none })
    ).toBe(true)
  })

  it('paused updates always show, even with nothing waiting or a run open', () => {
    expect(instanceAdminUpdatePending({ updates: updates({ updatesPaused: true }), ...none })).toBe(
      true
    )
    expect(
      instanceAdminUpdatePending({
        updates: updates({ runtime: 'workers', updatesPaused: true }),
        activeRun: true,
        consoleBuild: null,
      })
    ).toBe(true)
  })

  it('nothing while a run is going or before the status arrives', () => {
    expect(
      instanceAdminUpdatePending({
        updates: updates({ daemonsBehind: true }),
        activeRun: true,
        consoleBuild: null,
      })
    ).toBe(false)
    expect(instanceAdminUpdatePending({ updates: undefined, ...none })).toBe(false)
  })
})

describe('updateIndicator', () => {
  it('icon and "Update" on a live build, the icon alone elsewhere, nothing without an update', () => {
    const known = { versionKnown: true }
    expect(updateIndicator({ pending: true, live: true, ...known })).toEqual({
      icon: true,
      word: 'Update',
    })
    expect(updateIndicator({ pending: true, live: false, ...known })).toEqual({
      icon: true,
      word: null,
    })
    expect(updateIndicator({ pending: false, live: true, ...known })).toEqual({
      icon: false,
      word: null,
    })
    expect(updateIndicator({ pending: false, live: false, ...known })).toEqual({
      icon: false,
      word: null,
    })
  })

  it('nothing until the version is known, so no icon sits on an entry that cannot be pressed', () => {
    expect(updateIndicator({ pending: true, live: true, versionKnown: false })).toEqual({
      icon: false,
      word: null,
    })
  })
})

describe('versionClick', () => {
  it('sends an instance admin with something pending to Admin > Updates', () => {
    expect(versionClick({ isInstanceAdmin: true, pending: true })).toEqual({
      kind: 'navigate',
      href: '/admin/updates',
    })
  })

  it('opens the versions popup otherwise, for admins, managers and members alike', () => {
    expect(versionClick({ isInstanceAdmin: true, pending: false })).toEqual({ kind: 'versions' })
    expect(versionClick({ isInstanceAdmin: false, pending: false })).toEqual({ kind: 'versions' })
    expect(versionClick({ isInstanceAdmin: false, pending: true })).toEqual({ kind: 'versions' })
  })
})

describe('versionEntryAccessibilityLabel', () => {
  it('says what the version is and what a press does', () => {
    expect(
      versionEntryAccessibilityLabel({
        version: 'v0.1.20',
        environment: null,
        pending: false,
        click: { kind: 'versions' },
      })
    ).toBe('Control plane v0.1.20, show versions')
    expect(
      versionEntryAccessibilityLabel({
        version: 'v0.1.21',
        environment: 'Staging',
        pending: true,
        click: { kind: 'navigate', href: '/admin/updates' },
      })
    ).toBe('Control plane v0.1.21, Staging build, update notice, open Updates')
    expect(
      versionEntryAccessibilityLabel({
        version: null,
        environment: null,
        pending: false,
        click: { kind: 'versions' },
      })
    ).toBe('Control plane version, show versions')
  })
})
