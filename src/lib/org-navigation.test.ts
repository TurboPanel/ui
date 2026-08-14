import { describe, expect, it } from 'vitest'
import { orgAreaFromPathname } from './org-navigation'

describe('orgAreaFromPathname', () => {
  it('does not treat retired Links paths as a Network sub-route', () => {
    const resolved = orgAreaFromPathname('/org/network/links/vpn-id')
    expect(resolved).not.toBeNull()
    expect(resolved?.area.id).toBe('network')
    expect(resolved?.subRoute).toBeNull()
  })

  it('resolves TurboFabric under Network', () => {
    const resolved = orgAreaFromPathname('/org/network/fabric')
    expect(resolved).not.toBeNull()
    expect(resolved?.area.id).toBe('network')
    expect(resolved?.subRoute?.id).toBe('fabric')
    expect(resolved?.subRoute?.pathSegment).toBe('fabric')
  })

  it('resolves site detail under Network without a Links sub-route', () => {
    const resolved = orgAreaFromPathname('/org/network/sites/site-1')
    expect(resolved?.area.id).toBe('network')
    expect(resolved?.subRoute?.id).toBe('site-detail')
  })
})
