import { describe, expect, it } from 'vitest'
import { PERMISSIONS_BY_SCOPE, grantPermissionLabel } from '@/lib/access-permissions'

describe('PERMISSIONS_BY_SCOPE', () => {
  it('offers the network share permission on the organization only', () => {
    expect(PERMISSIONS_BY_SCOPE.organization).toContain('environments.deploy_network_shares')
    expect(PERMISSIONS_BY_SCOPE.team).not.toContain('environments.deploy_network_shares')
  })
})

describe('grantPermissionLabel', () => {
  it('names the network share permission and leaves other keys as they are', () => {
    expect(grantPermissionLabel('environments.deploy_network_shares')).toBe('Deploy network shares')
    expect(grantPermissionLabel('organization:manage')).toBe('organization:manage')
  })
})
