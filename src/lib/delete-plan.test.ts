import { describe, expect, it } from 'vitest'
import type { DeletePlan } from '@/lib/instance-api'
import {
  deleteFailureMessage,
  deletePlanBlockerLines,
  deletePlanSummary,
  folderLabel,
  groupFoldersByServer,
  hostingAccountKeepReason,
} from '@/lib/delete-plan'
import { CONTROL_PLANE_UNREACHABLE_COPY } from '@/lib/user-error'

const EMPTY: DeletePlan = {
  environments: [],
  services: [],
  servers: [],
  folders: [],
  hostingAccounts: [],
  blockers: [],
}

const PLAN: DeletePlan = {
  environments: [{ id: 'e1', name: 'production' }],
  services: [
    { id: 's1', name: 'web', environmentId: 'e1' },
    { id: 's2', name: 'worker', environmentId: 'e1' },
  ],
  servers: [
    { id: 'srv-a', name: 'Alpha', connected: true },
    { id: 'srv-b', name: null, connected: false },
  ],
  folders: [
    {
      id: 'f1',
      serverId: 'srv-a',
      kind: 'service',
      path: '/srv/users/shop/production/services/web',
      assetName: 'web',
      action: 'remove',
    },
    {
      id: 'f2',
      serverId: 'srv-b',
      kind: 'volume',
      path: null,
      assetName: 'data',
      action: 'keep',
    },
    {
      id: 'f3',
      serverId: 'srv-gone',
      kind: 'service',
      path: null,
      assetName: null,
      action: 'remove',
    },
  ],
  hostingAccounts: [
    { id: 'p1', username: 'shop', action: 'remove' },
    { id: 'p2', username: 'shared', action: 'keep', usedBy: { tenancies: 1 } },
  ],
  blockers: [],
}

describe('groupFoldersByServer', () => {
  it('groups folders per server in the plan order, unknown servers last', () => {
    const groups = groupFoldersByServer(PLAN)
    expect(groups.map((group) => [group.serverName, group.connected])).toEqual([
      ['Alpha', true],
      ['Unnamed server', false],
      ['Unnamed server', false],
    ])
    expect(groups[0]?.remove.map((row) => row.id)).toEqual(['f1'])
    expect(groups[1]?.keep.map((row) => row.id)).toEqual(['f2'])
    expect(groups[2]?.serverId).toBe('srv-gone')
  })

  it('is empty for a plan without folders', () => {
    expect(groupFoldersByServer(EMPTY)).toEqual([])
  })
})

describe('folderLabel', () => {
  it('prefers the path, then the asset name, then the kind', () => {
    expect(folderLabel(PLAN.folders[0]!)).toBe('/srv/users/shop/production/services/web')
    expect(folderLabel(PLAN.folders[1]!)).toBe('Volume data')
    expect(folderLabel(PLAN.folders[2]!)).toBe('Service folder')
  })
})

describe('hostingAccountKeepReason', () => {
  it('names what still uses the account', () => {
    expect(hostingAccountKeepReason({ tenancies: 1 })).toBe(
      'Kept: still used outside this project (1 service runs as it).'
    )
    expect(hostingAccountKeepReason(undefined)).toBe('Kept: still used outside this project.')
  })
})

describe('deletePlanSummary', () => {
  it('counts what goes, names the servers and the kept volumes', () => {
    expect(deletePlanSummary(PLAN, 'production')).toBe(
      'Delete production? This removes 2 services, 2 folders, 1 Hosting Account on Alpha, Unnamed server. 1 volume is set to keep its data and stays.'
    )
  })

  it('reads well for an empty plan and for several kept volumes', () => {
    expect(deletePlanSummary(EMPTY, 'staging')).toBe(
      'Delete staging? This removes 0 services, 0 folders.'
    )
    const kept = {
      ...EMPTY,
      services: [{ id: 's1', name: 'web', environmentId: 'e1' }],
      folders: [PLAN.folders[1]!, { ...PLAN.folders[1]!, id: 'f9' }],
      hostingAccounts: [
        { id: 'a', username: 'a', action: 'remove' as const },
        { id: 'b', username: 'b', action: 'remove' as const },
      ],
    }
    expect(deletePlanSummary(kept, 'staging')).toBe(
      'Delete staging? This removes 1 service, 0 folders, 2 Hosting Accounts. 2 volumes are set to keep their data and stay.'
    )
  })
})

describe('deletePlanBlockerLines', () => {
  it('uses the panel message, else the fixed copy, else the code', () => {
    expect(deletePlanBlockerLines(undefined)).toEqual([])
    expect(
      deletePlanBlockerLines({
        ...EMPTY,
        blockers: [
          { error: 'server_offline', message: 'Server Alpha is offline.' },
          { error: 'managed_runtime_present', message: ' ' },
          { error: 'something_new', message: '' },
        ],
      })
    ).toEqual([
      'Server Alpha is offline.',
      'This includes a managed database. Delete the database first (it asks for its own confirmation), then try again.',
      'something_new',
    ])
  })
})

describe('deleteFailureMessage', () => {
  it('shows the panel explanation instead of the status line', () => {
    const err = new Error(
      '/api/client/v1/projects/p1 failed: HTTP 409: server_offline — Server Alpha is offline, so nothing was deleted.'
    )
    expect(deleteFailureMessage(err, 'fallback')).toBe(
      'Server Alpha is offline, so nothing was deleted.'
    )
  })

  it('ignores a dash that does not follow a code, or that has nothing after it', () => {
    expect(deleteFailureMessage(new Error('HTTP 409: Not a code — words'), 'Try again.')).toBe(
      'Try again.'
    )
    expect(deleteFailureMessage(new Error('HTTP 409: some_code — '), 'Try again.')).toBe(
      'Try again.'
    )
    expect(deleteFailureMessage(new Error('HTTP 409 — words'), 'Try again.')).toBe('Try again.')
  })

  it('maps a bare code to its fixed copy', () => {
    expect(
      deleteFailureMessage('/api/x failed: HTTP 409: project_stop_failed', 'fallback')
    ).toBe(
      'The servers did not accept the stop in time, so nothing was deleted. Check that they are online and try again.'
    )
  })

  it('never shows a raw status line and keeps other messages', () => {
    expect(deleteFailureMessage(new Error('/api/x failed: HTTP 500'), 'Try again.')).toBe(
      'Try again.'
    )
    expect(deleteFailureMessage(new Error('HTTP 409: brand_new_code'), 'Try again.')).toBe(
      'Try again.'
    )
    expect(deleteFailureMessage(null, 'Try again.')).toBe('Try again.')
    expect(deleteFailureMessage('Something plain happened', 'Try again.')).toBe(
      'Something plain happened'
    )
  })

  it('says the control plane is unreachable for a network failure', () => {
    expect(deleteFailureMessage(new TypeError('Failed to fetch'), 'x')).toBe(
      CONTROL_PLANE_UNREACHABLE_COPY
    )
  })
})
