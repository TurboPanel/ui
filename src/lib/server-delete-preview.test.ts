import { describe, expect, it } from 'vitest'
import type { CappedPreviewList, ServerDeletePreview } from '@/lib/instance-api'
import {
  forgottenResourceGroups,
  moreLabel,
  SERVER_DELETE_FORGET_COPY,
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
}

const onlineEmptyPreview: ServerDeletePreview = {
  online: true,
  canForget: false,
  colocated: false,
  blockers: [],
  containers: emptyList,
  networks: emptyList,
  ips: emptyList,
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
})
