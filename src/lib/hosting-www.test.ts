import { describe, expect, it } from 'vitest'
import {
  defaultWwwMode,
  effectiveWwwMode,
  hostingWwwNames,
  initialWwwChoice,
  isHostingWwwMode,
  readWwwMode,
  wwwCertificateNames,
  wwwChoiceOptions,
  wwwDnsHint,
  wwwExtraNames,
  wwwResultLines,
  wwwSiblingHostname,
} from './hosting-www'

describe('hosting www names', () => {
  it('flips the www spelling and refuses unusable names', () => {
    expect(wwwSiblingHostname('turbopanel.io')).toBe('www.turbopanel.io')
    expect(wwwSiblingHostname('www.turbopanel.io')).toBe('turbopanel.io')
    expect(wwwSiblingHostname('www.com')).toBeNull()
    expect(wwwSiblingHostname('*.turbopanel.io')).toBeNull()
  })

  it('expands each mode the same way whichever spelling was typed', () => {
    expect(hostingWwwNames('turbopanel.io', 'off')).toEqual({
      serve: ['turbopanel.io'],
      redirect: null,
    })
    expect(hostingWwwNames('turbopanel.io', 'both')?.serve).toEqual([
      'turbopanel.io',
      'www.turbopanel.io',
    ])
    for (const typed of ['turbopanel.io', 'www.turbopanel.io']) {
      expect(hostingWwwNames(typed, 'www-to-root')).toEqual({
        serve: ['turbopanel.io'],
        redirect: { from: 'www.turbopanel.io', to: 'turbopanel.io' },
      })
      expect(hostingWwwNames(typed, 'root-to-www')).toEqual({
        serve: ['www.turbopanel.io'],
        redirect: { from: 'turbopanel.io', to: 'www.turbopanel.io' },
      })
    }
    expect(hostingWwwNames('*.turbopanel.io', 'both')).toBeNull()
    expect(isHostingWwwMode('both')).toBe(true)
    expect(isHostingWwwMode('on')).toBe(false)
  })
})

describe('defaults', () => {
  it('sends www to a bare domain, keeps a typed www, leaves subdomains alone', () => {
    expect(defaultWwwMode('turbopanel.io')).toBe('www-to-root')
    expect(defaultWwwMode(' Turbopanel.IO ')).toBe('www-to-root')
    expect(defaultWwwMode('www.turbopanel.io')).toBe('root-to-www')
    expect(defaultWwwMode('app.turbopanel.io')).toBe('off')
    expect(defaultWwwMode('*.turbopanel.io')).toBe('off')
  })

  it('follows the default only while nothing is saved or picked', () => {
    expect(effectiveWwwMode(null, ['turbopanel.io'])).toBe('www-to-root')
    expect(effectiveWwwMode(null, ['a.io', 'b.io'])).toBe('off')
    expect(effectiveWwwMode(null, [])).toBe('off')
    expect(effectiveWwwMode('both', ['turbopanel.io'])).toBe('both')
    expect(initialWwwChoice({ hostnames: ['turbopanel.io'] })).toBe('off')
    expect(initialWwwChoice({ hostnames: ['turbopanel.io'], www: 'both' })).toBe('both')
    expect(initialWwwChoice({ hostnames: [] })).toBeNull()
    expect(initialWwwChoice(null)).toBeNull()
  })

  it('reads the saved mode, including an older on/off redirect', () => {
    expect(readWwwMode({ www: 'root-to-www' })).toBe('root-to-www')
    expect(readWwwMode({ wwwRedirect: true, hostnames: ['turbopanel.io'] })).toBe('www-to-root')
    expect(readWwwMode({ wwwRedirect: true, hostnames: ['www.turbopanel.io'] })).toBe('root-to-www')
    expect(readWwwMode({ wwwRedirect: true })).toBe('www-to-root')
    expect(readWwwMode({ www: 'nonsense' })).toBe('off')
    expect(readWwwMode([])).toBe('off')
  })
})

describe('choice labels and result lines', () => {
  it('names the real names for one hostname', () => {
    expect(wwwChoiceOptions(['turbopanel.io']).map((o) => o.label)).toEqual([
      'Only turbopanel.io',
      'Both names',
      'www.turbopanel.io → turbopanel.io',
      'turbopanel.io → www.turbopanel.io',
    ])
    expect(wwwChoiceOptions(['www.turbopanel.io']).map((o) => o.label)).toEqual([
      'Only www.turbopanel.io',
      'Both names',
      'www.turbopanel.io → turbopanel.io',
      'turbopanel.io → www.turbopanel.io',
    ])
  })

  it('uses words for several hostnames and locks a wildcard to Only', () => {
    expect(wwwChoiceOptions(['a.io', 'b.io']).map((o) => o.label)).toEqual([
      'Only these names',
      'Both, no redirect',
      'Send www → name',
      'Send name → www',
    ])
    const wildcard = wwwChoiceOptions(['*.turbopanel.io'])
    expect(wildcard.filter((o) => o.disabled).map((o) => o.value)).toEqual([
      'both',
      'www-to-root',
      'root-to-www',
    ])
  })

  it('says what visitors get', () => {
    expect(wwwResultLines(['turbopanel.io'], 'www-to-root')).toEqual([
      'www.turbopanel.io → turbopanel.io (permanent redirect, path kept)',
    ])
    expect(wwwResultLines(['turbopanel.io'], 'both')).toEqual([
      'turbopanel.io and www.turbopanel.io both show the site',
    ])
    expect(wwwResultLines(['turbopanel.io'], 'off')).toEqual(['Only turbopanel.io answers'])
    expect(wwwResultLines(['*.turbopanel.io'], 'both')).toEqual([
      '*.turbopanel.io has no www spelling, so only *.turbopanel.io answers.',
    ])
  })

  it('lists the added names for DNS and certificates', () => {
    expect(wwwExtraNames(['turbopanel.io'], 'off')).toEqual([])
    expect(wwwExtraNames(['turbopanel.io'], 'www-to-root')).toEqual(['www.turbopanel.io'])
    expect(wwwExtraNames(['www.turbopanel.io'], 'www-to-root')).toEqual(['turbopanel.io'])
    expect(wwwCertificateNames(['a.io', 'b.io'], 'both')).toEqual([
      'a.io',
      'b.io',
      'www.a.io',
      'www.b.io',
    ])
    expect(wwwDnsHint(['turbopanel.io'], 'off')).toBeNull()
    expect(wwwDnsHint(['turbopanel.io'], 'root-to-www')).toContain(
      'www.turbopanel.io needs a DNS record pointing at this server too.'
    )
    expect(wwwDnsHint(['a.io', 'b.io'], 'both')).toContain('www.a.io and www.b.io need')
  })
})
