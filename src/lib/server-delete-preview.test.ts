import { describe, expect, it } from 'vitest'
import type { ServerDeletePreview } from '@/lib/instance-api'
import {
  forgottenResourceGroups,
  moreLabel,
  SERVER_DELETE_FORGET_COPY,
  shouldShowServerForgetPath,
} from '@/lib/server-delete-preview'

function preview(patch: Partial<ServerDeletePreview> = {}): ServerDeletePreview {
  return {
    online: false,
    canForget: true,
    colocated: false,
    blockers: [{ kind: 'container', count: 1 }],
    containers: [],
    networks: [],
    ips: [],
    ...patch,
  }
}

describe('server delete forget preview', () => {
  it('explains that forgetting only removes records', () => {
    expect(SERVER_DELETE_FORGET_COPY).toContain('does not touch the machine')
  })

  it('lists names and caps overflow with and N more', () => {
    const groups = forgottenResourceGroups(
      preview({
        containers: [
          { id: 'c1', name: 'web', status: 'running', serviceName: 'shop' },
          { id: 'c2', name: 'api', status: 'exited' },
        ],
        networks: [{ id: 'n1', name: 'project_default' }],
        ips: [{ id: 'i1', address: '10.0.0.5' }],
        more: { containers: 3, networks: 1, ips: 2 },
      })
    )
    expect(groups).toEqual([
      {
        heading: 'Containers',
        names: ['web (running) · shop', 'api (exited)'],
        more: 3,
      },
      { heading: 'Networks', names: ['project_default'], more: 1 },
      { heading: 'Addresses', names: ['10.0.0.5'], more: 2 },
    ])
    expect(moreLabel(3)).toBe('and 3 more')
  })

  it('omits empty groups', () => {
    expect(forgottenResourceGroups(preview())).toEqual([])
  })

  it('shows the forget path only when the host is offline and canForget', () => {
    expect(shouldShowServerForgetPath(preview(), { serverConnected: false })).toBe(true)
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
