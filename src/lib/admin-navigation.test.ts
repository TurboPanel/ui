import { describe, expect, it } from 'vitest'
import {
  ADMIN_AREAS,
  adminAreaFromPathname,
  adminAreaHref,
  adminRouteHref,
} from '@/lib/admin-navigation'

describe('ADMIN_AREAS', () => {
  it('lists the admin areas with stable path segments', () => {
    expect(ADMIN_AREAS.map((a) => a.id)).toEqual([
      'access',
      'updates',
      'email',
      'auth-providers',
      'git',
      'signup',
      'tiers',
      'secrets',
      'metrics',
    ])
    for (const area of ADMIN_AREAS) {
      if (area.id === 'access') {
        expect(area.subRoutes.map((sub) => sub.id)).toEqual([
          'certificates',
          'trusted-proxies',
          'tunnel',
          'platform-ca',
        ])
      } else {
        expect(area.subRoutes).toEqual([])
      }
    }
  })
})

describe('adminAreaHref', () => {
  it('prefixes /admin for each area segment', () => {
    expect(adminAreaHref('access')).toBe('/admin/access')
    expect(adminAreaHref('updates')).toBe('/admin/updates')
    expect(adminAreaHref('email')).toBe('/admin/email')
    expect(adminAreaHref('auth-providers')).toBe('/admin/auth-providers')
    expect(adminAreaHref('git')).toBe('/admin/git')
    expect(adminAreaHref('signup')).toBe('/admin/signup')
    expect(adminAreaHref('tiers')).toBe('/admin/tiers')
    expect(adminAreaHref('secrets')).toBe('/admin/secrets')
    expect(adminAreaHref('metrics')).toBe('/admin/metrics')
  })

  it('joins an area and a sub-route', () => {
    expect(adminRouteHref('access', 'certificates')).toBe(
      '/admin/access/certificates',
    )
    expect(adminRouteHref('access', 'platform-ca')).toBe(
      '/admin/access/platform-ca',
    )
  })
})

describe('adminAreaFromPathname', () => {
  it('returns null outside /admin', () => {
    expect(adminAreaFromPathname('/')).toBeNull()
    expect(adminAreaFromPathname('/organizations')).toBeNull()
    expect(adminAreaFromPathname('/admin')).toBeNull()
  })

  it('returns null for unknown admin segments', () => {
    expect(adminAreaFromPathname('/admin/unknown')).toBeNull()
    expect(adminAreaFromPathname('/admin/networking-extra')).toBeNull()
  })

  it('resolves each known admin area', () => {
    for (const area of ADMIN_AREAS) {
      const resolved = adminAreaFromPathname(`/admin/${area.pathSegment}`)
      expect(resolved).not.toBeNull()
      expect(resolved?.area.id).toBe(area.id)
      expect(resolved?.subRoute).toBeNull()
    }
  })

  it('resolves Access and its sub-routes', () => {
    expect(adminAreaFromPathname('/admin/access')?.subRoute).toBeNull()
    expect(adminAreaFromPathname('/admin/access/certificates')?.subRoute?.id).toBe(
      'certificates',
    )
    expect(adminAreaFromPathname('/admin/access/unknown')?.area.id).toBe('access')
    expect(adminAreaFromPathname('/admin/access/unknown')?.subRoute).toBeNull()
  })

  it('keeps a git app id on the git area with no sub-route', () => {
    const resolved = adminAreaFromPathname('/admin/git/app-1')
    expect(resolved?.area.id).toBe('git')
    expect(resolved?.subRoute).toBeNull()
  })

  it('ignores trailing path depth beyond the area segment', () => {
    const resolved = adminAreaFromPathname('/admin/email/extra')
    expect(resolved?.area.id).toBe('email')
    expect(resolved?.subRoute).toBeNull()
  })
})
