import { describe, expect, it } from 'vitest'
import type { CappedPreviewList, ServerDeletePreview } from '@/lib/instance-api'
import {
  blockedDatabaseMessages,
  environmentForgetCopy,
  forgottenResourceGroups,
  hasBlockedDatabases,
  isServerDeletePreview,
  membersForgetCopy,
  moreLabel,
  SERVER_DELETE_ENVIRONMENTS_LEAD,
  SERVER_DELETE_FORGET_COPY,
  SERVER_DELETE_MEMBERS_LEAD,
  serverDeleteBlockerMessages,
  shouldShowServerForgetPath,
} from '@/lib/server-delete-preview'

const emptyList: CappedPreviewList<never> = { items: [], more: 0 }

function capped<T>(items: T[], more = 0): CappedPreviewList<T> {
  return { items, more }
}

/** Shape from GET /servers/:id/delete-preview (CappedPreviewList per kind). */
function preview(patch: Partial<ServerDeletePreview> = {}): ServerDeletePreview {
  return {
    online: false,
    canForget: true,
    colocated: false,
    blockers: [],
    containers: emptyList,
    networks: emptyList,
    ips: emptyList,
    environments: emptyList,
    members: emptyList,
    blockedDatabases: emptyList,
    ...patch,
  }
}

/** OpenAPI / delete-guards example: leftovers listed, overflow in `more`. */
const offlineLeftoversPreview: ServerDeletePreview = {
  online: false,
  canForget: true,
  colocated: false,
  blockers: [
    { kind: 'network', count: 1 },
    { kind: 'container', count: 1 },
    { kind: 'ip', count: 1 },
  ],
  containers: capped(
    [{ id: 'ctr-1', name: 'web-1', status: 'exited', serviceName: 'web' }],
    3
  ),
  networks: capped([{ id: 'net-1', name: 'leftover-net' }], 1),
  ips: capped([{ id: 'ip-1', address: '203.0.113.10' }], 2),
  environments: emptyList,
  members: emptyList,
  blockedDatabases: emptyList,
}

const onlineEmptyPreview: ServerDeletePreview = {
  online: true,
  canForget: false,
  colocated: false,
  blockers: [],
  containers: emptyList,
  networks: emptyList,
  ips: emptyList,
  environments: emptyList,
  members: emptyList,
  blockedDatabases: emptyList,
}

const malformedArrayPreview = {
  online: false,
  canForget: true,
  colocated: false,
  blockers: [{ kind: 'container', count: 1 }],
  containers: [{ id: 'c1', name: 'web', status: 'running' }],
  networks: [{ id: 'n1', name: 'net' }],
  ips: [{ id: 'i1', address: '10.0.0.5' }],
  more: { containers: 1, networks: 0, ips: 0 },
}

describe('server delete forget preview', () => {
  it('explains that forgetting only removes records', () => {
    expect(SERVER_DELETE_FORGET_COPY).toContain('does not touch the machine')
  })

  it('lists names from each capped list and reports more', () => {
    const groups = forgottenResourceGroups(offlineLeftoversPreview)
    expect(groups).toEqual([
      {
        heading: 'Containers',
        names: ['web-1 (exited) · web'],
        more: 3,
      },
      { heading: 'Networks', names: ['leftover-net'], more: 1 },
      { heading: 'Addresses', names: ['203.0.113.10'], more: 2 },
    ])
    expect(moreLabel(3)).toBe('and 3 more')
  })

  it('omits empty groups on an online host with no leftovers', () => {
    expect(forgottenResourceGroups(onlineEmptyPreview)).toEqual([])
    expect(serverDeleteBlockerMessages(onlineEmptyPreview)).toEqual([])
    expect(shouldShowServerForgetPath(onlineEmptyPreview, { serverConnected: true })).toBe(false)
  })

  it('does not throw on the old array-plus-top-level-more payload', () => {
    expect(forgottenResourceGroups(malformedArrayPreview)).toEqual([])
    expect(serverDeleteBlockerMessages(malformedArrayPreview)).toEqual([])
    expect(shouldShowServerForgetPath(malformedArrayPreview, { serverConnected: false })).toBe(
      false
    )
    expect(forgottenResourceGroups(undefined)).toEqual([])
    expect(forgottenResourceGroups(null)).toEqual([])
    expect(forgottenResourceGroups({ online: false })).toEqual([])
  })

  it('shows generic copy for unknown blocker kinds when forget is refused', () => {
    const blocked = preview({
      canForget: false,
      blockers: [
        { kind: 'database_member', count: 1 },
        { kind: 'app_environment', count: 2 },
        { kind: 'deployment', count: 3 },
      ],
    })
    expect(serverDeleteBlockerMessages(blocked)).toEqual([
      '1 other item still placed on this server — remove them first',
      '2 other items still placed on this server — remove them first',
      '3 other items still placed on this server — remove them first',
    ])
    expect(shouldShowServerForgetPath(blocked, { serverConnected: false })).toBe(false)
  })

  it('names placed environments in blocker copy when items are present', () => {
    const blocked = preview({
      canForget: false,
      blockers: [
        {
          kind: 'environment',
          count: 2,
          items: [
            {
              id: 'env-1',
              name: 'staging',
              projectId: 'proj-1',
              projectName: 'Shop',
              hasDatabase: false,
            },
            {
              id: 'env-2',
              name: 'prod',
              projectId: 'proj-1',
              projectName: 'Shop',
              hasDatabase: true,
            },
          ],
          more: 0,
        },
      ],
    })
    expect(serverDeleteBlockerMessages(blocked)).toEqual([
      'App environments "Shop / staging" and "Shop / prod" are still placed on this server.',
    ])
  })

  it('hides blocker sentences on the forget path', () => {
    expect(serverDeleteBlockerMessages(offlineLeftoversPreview)).toEqual([])
  })

  it('shows the forget path only when the host is offline and canForget', () => {
    expect(
      shouldShowServerForgetPath(offlineLeftoversPreview, { serverConnected: false })
    ).toBe(true)
    expect(shouldShowServerForgetPath(preview({ online: true }), { serverConnected: false })).toBe(
      false
    )
    expect(shouldShowServerForgetPath(preview(), { serverConnected: true })).toBe(false)
    expect(
      shouldShowServerForgetPath(preview({ canForget: false }), { serverConnected: false })
    ).toBe(false)
    expect(shouldShowServerForgetPath(undefined, { serverConnected: false })).toBe(false)
  })

  it('lists apps by name in project, extra copies, and blocked databases', () => {
    const listed = preview({
      environments: capped(
        [
          { id: 'env-1', name: 'staging', projectName: 'Shop' },
          { id: 'env-2', name: 'prod', projectName: 'Blog' },
        ],
        2
      ),
      members: capped([{ id: 'rep-1', databaseName: 'catalog' }], 1),
    })
    expect(environmentForgetCopy(listed)).toBe(
      `${SERVER_DELETE_ENVIRONMENTS_LEAD} staging in Shop, prod in Blog, and 2 more`
    )
    expect(membersForgetCopy(listed)).toBe(
      `${SERVER_DELETE_MEMBERS_LEAD} catalog, and 1 more`
    )
    expect(hasBlockedDatabases(listed)).toBe(false)

    const blocked = preview({
      canForget: false,
      blockedDatabases: capped(
        [
          { id: 'db-1', name: 'orders', reason: 'only_member' },
          { id: 'db-2', name: 'analytics', reason: 'primary_here' },
        ],
        1
      ),
    })
    expect(blockedDatabaseMessages(blocked)).toEqual([
      'Database "orders" has its only copy on this server. Delete the database first.',
      'Database "analytics" has its primary copy on this server. Promote another member or delete the database first.',
      'and 1 more',
    ])
    expect(hasBlockedDatabases(blocked)).toBe(true)
    expect(shouldShowServerForgetPath(blocked, { serverConnected: false })).toBe(false)
  })

  it('skips incomplete names and treats a bad extra list as malformed', () => {
    expect(environmentForgetCopy(undefined)).toBeNull()
    expect(membersForgetCopy(null)).toBeNull()
    expect(blockedDatabaseMessages(undefined)).toEqual([])
    expect(hasBlockedDatabases(undefined)).toBe(false)
    expect(
      environmentForgetCopy(
        preview({
          environments: capped([
            { id: 'env-1', name: '   ', projectName: 'Shop' },
            { id: 'env-2', name: 'staging', projectName: '  ' },
            { id: 'env-3', name: 'only', projectName: '' },
          ]),
        })
      )
    ).toBe(`${SERVER_DELETE_ENVIRONMENTS_LEAD} staging, only`)
    expect(
      membersForgetCopy(
        preview({
          members: capped([{ id: 'rep-1', databaseName: '  catalog  ' }]),
        })
      )
    ).toBe(`${SERVER_DELETE_MEMBERS_LEAD} catalog`)
    expect(
      blockedDatabaseMessages(
        preview({
          canForget: false,
          blockedDatabases: {
            items: [
              { id: 'x' },
              { id: 'db-1', name: '   ', reason: 'only_member' },
              { id: 'db-2', name: 'orders', reason: 'only_member' },
            ],
            more: 0,
          } as ServerDeletePreview['blockedDatabases'],
        })
      )
    ).toEqual(['Database "orders" has its only copy on this server. Delete the database first.'])
    expect(
      hasBlockedDatabases(preview({ blockedDatabases: capped([], 3) }))
    ).toBe(true)
    expect(
      isServerDeletePreview(
        preview({
          environments: { items: 'nope', more: 0 } as unknown as CappedPreviewList<never>,
        })
      )
    ).toBe(false)
  })
})
