import { describe, expect, it } from 'vitest'
import type { InstanceUpdates, ServerUpdateStatus } from '@/lib/instance-api'
import {
  canUpdateOrgServers,
  instanceAdminUpdatePending,
  orgServersUpdatePending,
  updateIndicator,
  updateViewer,
  versionClick,
  versionEntryAccessibilityLabel,
  viewerUpdatePending,
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

function serverStatus(overrides: Partial<ServerUpdateStatus> = {}): ServerUpdateStatus {
  return {
    ok: true,
    serverId: 'server-1',
    channel: 'canary',
    current: { commit: 'old', buildId: 'b-old' },
    target: { commit: 'new', buildId: 'b-new' },
    updateAvailable: true,
    status: 'idle',
    targetStatus: 'ok',
    ...overrides,
  }
}

describe('canUpdateOrgServers and updateViewer', () => {
  it('follows organization manage today', () => {
    expect(canUpdateOrgServers({ canManageOrganization: true })).toBe(true)
    expect(canUpdateOrgServers({ canManageOrganization: false })).toBe(false)
  })

  it('an instance admin is always the admin, then the manager, then anyone else', () => {
    expect(updateViewer({ isInstanceAdmin: true, canUpdateOrgServers: true })).toBe(
      'instance-admin'
    )
    expect(updateViewer({ isInstanceAdmin: true, canUpdateOrgServers: false })).toBe(
      'instance-admin'
    )
    expect(updateViewer({ isInstanceAdmin: false, canUpdateOrgServers: true })).toBe('org-manager')
    expect(updateViewer({ isInstanceAdmin: false, canUpdateOrgServers: false })).toBe('other')
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

describe('orgServersUpdatePending', () => {
  it('a server of the organization has a daemon update it may take', () => {
    expect(orgServersUpdatePending([serverStatus()])).toBe(true)
    expect(orgServersUpdatePending([serverStatus({ updateAvailable: false })])).toBe(false)
    expect(orgServersUpdatePending([])).toBe(false)
    expect(orgServersUpdatePending(undefined)).toBe(false)
  })

  it('ignores servers it cannot or need not update', () => {
    expect(orgServersUpdatePending([serverStatus({ colocatedWithInstance: true })])).toBe(false)
    expect(orgServersUpdatePending([serverStatus({ status: 'updating' })])).toBe(false)
    expect(
      orgServersUpdatePending([
        serverStatus({ updateBlocked: true, updateBlockedCode: 'updates_managed' }),
      ])
    ).toBe(false)
  })
})

describe('viewerUpdatePending', () => {
  const servers = [serverStatus()]
  it('reads what the role may read', () => {
    expect(viewerUpdatePending({ viewer: 'instance-admin', adminPending: true, servers: [] })).toBe(
      true
    )
    expect(viewerUpdatePending({ viewer: 'instance-admin', adminPending: false, servers })).toBe(
      false
    )
    expect(viewerUpdatePending({ viewer: 'org-manager', adminPending: false, servers })).toBe(true)
    expect(viewerUpdatePending({ viewer: 'other', adminPending: true, servers })).toBe(false)
  })
})

describe('updateIndicator', () => {
  it('icon and "Update" on a live build, the icon alone elsewhere, nothing without an update', () => {
    expect(updateIndicator({ pending: true, live: true })).toEqual({ icon: true, word: 'Update' })
    expect(updateIndicator({ pending: true, live: false })).toEqual({ icon: true, word: null })
    expect(updateIndicator({ pending: false, live: true })).toEqual({ icon: false, word: null })
    expect(updateIndicator({ pending: false, live: false })).toEqual({ icon: false, word: null })
  })
})

describe('versionClick', () => {
  it('opens the versions popup when nothing is pending, for everyone', () => {
    for (const viewer of ['instance-admin', 'org-manager', 'other'] as const) {
      expect(versionClick({ viewer, pending: false, orgId: 'org-1' })).toEqual({ kind: 'versions' })
    }
  })

  it('goes to the update screen for the viewer when something is pending', () => {
    expect(versionClick({ viewer: 'instance-admin', pending: true, orgId: 'org-1' })).toEqual({
      kind: 'navigate',
      href: '/admin/updates',
    })
    expect(versionClick({ viewer: 'instance-admin', pending: true, orgId: null })).toEqual({
      kind: 'navigate',
      href: '/admin/updates',
    })
    expect(versionClick({ viewer: 'org-manager', pending: true, orgId: 'org-1' })).toEqual({
      kind: 'navigate',
      href: '/org-1/servers',
    })
  })

  it('falls back to the popup when there is nowhere to send the viewer', () => {
    expect(versionClick({ viewer: 'org-manager', pending: true, orgId: ' ' })).toEqual({
      kind: 'versions',
    })
    expect(versionClick({ viewer: 'other', pending: true, orgId: 'org-1' })).toEqual({
      kind: 'versions',
    })
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
    ).toBe('Control plane v0.1.21, Staging build, update available, open Updates')
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
