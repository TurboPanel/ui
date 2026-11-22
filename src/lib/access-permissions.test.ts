import { describe, expect, it } from 'vitest'
import {
  PERMISSIONS_BY_SCOPE,
  grantPermissionLabel,
  permissionTitle,
} from '@/lib/access-permissions'

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

describe('container terminal permission', () => {
  it('is granted on the organization only and read as Open container terminal', () => {
    expect(PERMISSIONS_BY_SCOPE.organization).toContain('terminal:container')
    expect(PERMISSIONS_BY_SCOPE.team).not.toContain('terminal:container')
    expect(grantPermissionLabel('terminal:container')).toBe('Open container terminal')
    expect(permissionTitle('terminal:container', 'Open container terminals')).toBe(
      'Open container terminal'
    )
    expect(permissionTitle('organization:own', 'Own')).toBe('Own')
  })
})
