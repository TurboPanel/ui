import { describe, expect, it } from 'vitest'
import { osTextBadge } from '@/lib/os-badges'
import { resolveOsLogoKey } from '@/lib/server-os-display'

describe('osTextBadge', () => {
  it('gives Raspberry Pi OS a stacked RPi / OS badge with the full name as its label', () => {
    expect(osTextBadge('raspberry-pi-os')).toEqual({
      lines: ['RPi', 'OS'],
      label: 'Raspberry Pi OS',
    })
  })

  it('has no badge for an OS with shipped artwork or no key', () => {
    expect(osTextBadge('debian')).toBeNull()
    expect(osTextBadge(null)).toBeNull()
    expect(osTextBadge(undefined)).toBeNull()
  })

  it('reaches a Pi reported only by its os variant', () => {
    expect(osTextBadge(resolveOsLogoKey({ os: { variant: 'raspberry-pi-os' } }))).not.toBeNull()
  })
})
