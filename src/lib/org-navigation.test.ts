import { describe, expect, it } from 'vitest'
import { orgAreaFromPathname } from './org-navigation'

describe('orgAreaFromPathname', () => {
  it('resolves link detail deep links to Network with Links active', () => {
    const resolved = orgAreaFromPathname('/org/network/links/vpn-id')
    expect(resolved).not.toBeNull()
    expect(resolved?.area.id).toBe('network')
    expect(resolved?.subRoute?.id).toBe('links')
    expect(resolved?.subRoute?.pathSegment).toBe('links')
  })

  it('resolves site detail under Network without a Links sub-route', () => {
    const resolved = orgAreaFromPathname('/org/network/sites/site-1')
    expect(resolved?.area.id).toBe('network')
    expect(resolved?.subRoute?.id).toBe('site-detail')
  })
})
