import { describe, expect, it } from 'vitest'
import { formatServerOsProductName, resolveOsLogoKey } from '@/lib/server-os-display'
import type { ServerOsMetadata } from '@/lib/instance-api'

describe('formatServerOsProductName', () => {
  it('returns null when neither os nor display is usable', () => {
    expect(formatServerOsProductName(null)).toBeNull()
    expect(formatServerOsProductName(undefined)).toBeNull()
    expect(formatServerOsProductName(null, '  ')).toBeNull()
    expect(formatServerOsProductName({})).toBeNull()
  })

  it('detects Raspberry Pi OS via variant and known ids', () => {
    expect(
      formatServerOsProductName({ variant: 'raspberry-pi-os' }),
    ).toBe('Raspberry Pi OS')
    expect(formatServerOsProductName({ id: 'raspbian' })).toBe('Raspberry Pi OS')
    expect(formatServerOsProductName({ id: 'RaspberryPi' })).toBe(
      'Raspberry Pi OS',
    )
    expect(formatServerOsProductName({ id: 'raspios' })).toBe('Raspberry Pi OS')
  })

  it('maps known OS ids to product names', () => {
    expect(formatServerOsProductName({ id: 'debian' })).toBe('Debian')
    expect(formatServerOsProductName({ id: 'UBUNTU' })).toBe('Ubuntu')
    expect(formatServerOsProductName({ id: 'freebsd' })).toBe('FreeBSD')
    expect(formatServerOsProductName({ id: 'windows' })).toBe('Windows')
  })

  it('title-cases unknown ids', () => {
    expect(formatServerOsProductName({ id: 'arch_linux' })).toBe('Arch Linux')
    expect(formatServerOsProductName({ id: 'rocky-linux' })).toBe('Rocky Linux')
  })

  it('derives product from prettyName when id is absent', () => {
    expect(
      formatServerOsProductName({ prettyName: 'Debian GNU/Linux 13' }),
    ).toBe('Debian')
    expect(formatServerOsProductName({ prettyName: '  Ubuntu 24.04  ' })).toBe(
      'Ubuntu',
    )
  })

  it('skips a leading GNU token in prettyName', () => {
    const os: ServerOsMetadata = { prettyName: 'GNU Linux' }
    // First token is gnu → skipped; falls through to family when present.
    expect(formatServerOsProductName({ ...os, family: 'linux' })).toBe('Linux')
    expect(formatServerOsProductName(os)).toBeNull()
  })

  it('uses family product names as a last resort', () => {
    expect(formatServerOsProductName({ family: 'linux' })).toBe('Linux')
    expect(formatServerOsProductName({ family: 'darwin' })).toBe('macOS')
    expect(formatServerOsProductName({ family: 'windows' })).toBe('Windows')
    expect(formatServerOsProductName({ family: 'freebsd' })).toBe('FreeBSD')
  })

  it('falls back to osDisplay product parsing', () => {
    expect(formatServerOsProductName(null, 'Debian 13 (trixie)')).toBe('Debian')
    expect(formatServerOsProductName(undefined, 'FreeBSD 14.1')).toBe('FreeBSD')
    expect(formatServerOsProductName({}, 'Windows')).toBe('Windows')
  })

  it('prefers os metadata over osDisplay', () => {
    expect(
      formatServerOsProductName({ id: 'ubuntu' }, 'Debian 12'),
    ).toBe('Ubuntu')
  })
})

describe('resolveOsLogoKey', () => {
  it('prefers the wire osLogo field', () => {
    expect(
      resolveOsLogoKey({
        osLogo: 'debian',
        os: { variant: 'raspberry-pi-os' },
      }),
    ).toBe('debian')
    expect(
      resolveOsLogoKey({ osLogo: 'raspberry-pi-os', os: { id: 'debian' } }),
    ).toBe('raspberry-pi-os')
  })

  it('falls back from os metadata when osLogo is absent', () => {
    expect(resolveOsLogoKey({ os: { variant: 'raspberry-pi-os' } })).toBe(
      'raspberry-pi-os',
    )
    expect(resolveOsLogoKey({ os: { id: 'debian' } })).toBe('debian')
    expect(resolveOsLogoKey({ os: { id: 'Debian' } })).toBe('debian')
  })

  it('returns null when no logo key can be derived', () => {
    expect(resolveOsLogoKey({})).toBeNull()
    expect(resolveOsLogoKey({ osLogo: null, os: null })).toBeNull()
    expect(resolveOsLogoKey({ os: { id: 'ubuntu' } })).toBeNull()
  })
})
