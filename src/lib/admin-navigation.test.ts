import { describe, expect, it } from 'vitest'
import {
  ADMIN_AREAS,
  adminAreaFromPathname,
  adminAreaHref,
} from '@/lib/admin-navigation'

describe('ADMIN_AREAS', () => {
  it('lists the five admin areas with stable path segments', () => {
    expect(ADMIN_AREAS.map((a) => a.id)).toEqual([
      'networking',
      'email',
      'git',
      'signup',
      'secrets',
    ])
    expect(ADMIN_AREAS.every((a) => a.subRoutes.length === 0)).toBe(true)
  })
})

describe('adminAreaHref', () => {
  it('prefixes /admin for each area segment', () => {
    expect(adminAreaHref('networking')).toBe('/admin/networking')
    expect(adminAreaHref('email')).toBe('/admin/email')
    expect(adminAreaHref('git')).toBe('/admin/git')
    expect(adminAreaHref('signup')).toBe('/admin/signup')
    expect(adminAreaHref('secrets')).toBe('/admin/secrets')
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
    }
  })

  it('ignores trailing path depth beyond the area segment', () => {
    const resolved = adminAreaFromPathname('/admin/email/extra')
    expect(resolved?.area.id).toBe('email')
  })
})
