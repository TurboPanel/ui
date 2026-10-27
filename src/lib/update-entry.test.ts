import { describe, expect, it } from 'vitest'
import type { InstanceUpdates, ServerUpdateStatus } from '@/lib/instance-api'
import {
  canUpdateOrgServers,
  instanceAdminUpdatePending,
  isServerUpdatable,
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

const host = { id: 'server-1', connected: true }

describe('isServerUpdatable (the Servers page and the sidebar icon share it)', () => {
  it('a connected server with a known, newer target and nothing running', () => {
    expect(isServerUpdatable(host, serverStatus())).toBe(true)
  })

  it('refuses what the Servers page offers no button for', () => {
    expect(isServerUpdatable({ ...host, connected: false }, serverStatus())).toBe(false)
    expect(isServerUpdatable(host, serverStatus({ targetStatus: 'unknown' }))).toBe(false)
    expect(isServerUpdatable(host, serverStatus({ updateAvailable: false }))).toBe(false)
    expect(isServerUpdatable(host, serverStatus({ status: 'updating' }))).toBe(false)
    expect(isServerUpdatable(host, serverStatus(), true)).toBe(false)
    expect(isServerUpdatable({ ...host, colocatedWithInstance: true }, serverStatus())).toBe(false)
    expect(isServerUpdatable(host, serverStatus({ colocatedWithInstance: true }))).toBe(false)
    expect(
      isServerUpdatable(
        host,
        serverStatus({ updateBlocked: true, updateBlockedCode: 'updates_managed' })
      )
    ).toBe(false)
    expect(isServerUpdatable(host, undefined)).toBe(false)
  })
})

describe('orgServersUpdatePending', () => {
  it('a server of the organization can be updated now', () => {
    expect(orgServersUpdatePending([host], [serverStatus()])).toBe(true)
    expect(orgServersUpdatePending([host], [serverStatus({ updateAvailable: false })])).toBe(false)
    expect(orgServersUpdatePending([], [serverStatus()])).toBe(false)
    expect(orgServersUpdatePending(undefined, undefined)).toBe(false)
  })

  it('a disconnected server that is behind shows no icon', () => {
    expect(orgServersUpdatePending([{ ...host, connected: false }], [serverStatus()])).toBe(false)
  })

  it('a server with no update row shows no icon', () => {
    expect(orgServersUpdatePending([host], [serverStatus({ serverId: 'other' })])).toBe(false)
  })
})

describe('viewerUpdatePending', () => {
  const servers = [host]
  const updates = [serverStatus()]
  it('reads what the role may read', () => {
    expect(
      viewerUpdatePending({
        viewer: 'instance-admin',
        adminPending: true,
        servers: [],
        updates: [],
      })
    ).toBe(true)
    expect(
      viewerUpdatePending({ viewer: 'instance-admin', adminPending: false, servers, updates })
    ).toBe(false)
    expect(
      viewerUpdatePending({ viewer: 'org-manager', adminPending: false, servers, updates })
    ).toBe(true)
    expect(viewerUpdatePending({ viewer: 'other', adminPending: true, servers, updates })).toBe(
      false
    )
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
