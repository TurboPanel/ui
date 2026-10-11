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
  wwwChoiceFromComposeEntry,
  wwwHostnames,
  wwwOptionForSave,
  wwwSiblingHostname,
  wwwUnavailableReason,
} from './hosting-www'

describe('hosting www names', () => {
  it('flips the www spelling and refuses unusable names', () => {
    expect(wwwSiblingHostname('turbopanel.io')).toBe('www.turbopanel.io')
    expect(wwwSiblingHostname('www.turbopanel.io')).toBe('turbopanel.io')
    expect(wwwSiblingHostname('www.com')).toBeNull()
    expect(wwwSiblingHostname('*.turbopanel.io')).toBeNull()
  })

  it('gives IPs and one-word names no www spelling', () => {
    expect(wwwSiblingHostname('203.0.113.5')).toBeNull()
    expect(wwwSiblingHostname('www.203.0.113.5')).toBeNull()
    expect(wwwSiblingHostname('com')).toBeNull()
    expect(wwwSiblingHostname('localhost')).toBeNull()
    expect(wwwSiblingHostname('www.localhost')).toBeNull()
    expect(wwwSiblingHostname('nas.lan')).toBe('www.nas.lan')
    expect(wwwSiblingHostname('app.2fa.io')).toBe('www.app.2fa.io')
  })

  it('reads the hostname field lowercased, each name once', () => {
    expect(wwwHostnames(' A.io, a.io ,B.io,, ')).toEqual(['a.io', 'b.io'])
    expect(wwwHostnames('')).toEqual([])
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
    expect(defaultWwwMode('203.0.113.5')).toBe('off')
  })

  it('does not guess www for private or reserved names', () => {
    for (const name of [
      'nas.lan',
      'www.nas.lan',
      'site.local',
      'app.test',
      'db.internal',
      'nas.home.arpa',
      'app.localhost',
      'x.invalid',
      'site.example',
    ]) {
      expect(defaultWwwMode(name)).toBe('off')
    }
  })

  it('follows the default only while nothing is saved or picked', () => {
    expect(effectiveWwwMode(null, ['turbopanel.io'])).toBe('www-to-root')
    expect(effectiveWwwMode(null, ['a.io', 'b.io'])).toBe('off')
    expect(effectiveWwwMode(null, [])).toBe('off')
    expect(effectiveWwwMode('both', ['turbopanel.io'])).toBe('both')
    expect(effectiveWwwMode('both', [])).toBe('off')
    expect(initialWwwChoice({ hostnames: ['turbopanel.io'] })).toBe('off')
    expect(initialWwwChoice({ hostnames: ['turbopanel.io'], www: 'both' })).toBe('both')
    expect(initialWwwChoice({ hostnames: [] })).toBeNull()
    expect(initialWwwChoice(null)).toBeNull()
  })

  it('falls back to off when the names leave no www choice', () => {
    expect(effectiveWwwMode('both', ['*.turbopanel.io'])).toBe('off')
    expect(effectiveWwwMode('www-to-root', ['a.io', '203.0.113.5'])).toBe('off')
    expect(effectiveWwwMode('both', ['turbopanel.io', 'www.turbopanel.io'])).toBe('off')
    expect(effectiveWwwMode(null, ['turbopanel.io', 'www.turbopanel.io'])).toBe('off')
    expect(effectiveWwwMode('root-to-www', ['a.io', 'b.io'])).toBe('root-to-www')
  })

  it('says why no www choice applies', () => {
    expect(wwwUnavailableReason(['turbopanel.io'])).toBeNull()
    expect(wwwUnavailableReason(['*.turbopanel.io'])).toBe(
      '*.turbopanel.io has no www spelling, so the www choice stays off.'
    )
    expect(wwwUnavailableReason(['turbopanel.io', 'www.turbopanel.io'])).toBe(
      'turbopanel.io and www.turbopanel.io are both listed already, so the www choice stays off.'
    )
    expect(wwwUnavailableReason(['bücher.de'])).toBe(
      'bücher.de isn’t a valid hostname yet, so the www choice stays off.'
    )
  })

  it('saves the choice that applies, or nothing for off', () => {
    // A new hosting saves the preselect it showed.
    expect(wwwOptionForSave(null, 'turbopanel.io')).toBe('www-to-root')
    expect(wwwOptionForSave(null, 'Turbopanel.IO')).toBe('www-to-root')
    expect(wwwOptionForSave(null, 'nas.lan')).toBeUndefined()
    expect(wwwOptionForSave('both', 'turbopanel.io')).toBe('both')
    expect(wwwOptionForSave('off', 'turbopanel.io')).toBeUndefined()
    // A choice the server would refuse is saved as off.
    expect(wwwOptionForSave('both', '*.turbopanel.io')).toBeUndefined()
    expect(wwwOptionForSave('both', 'turbopanel.io, www.turbopanel.io')).toBeUndefined()
    expect(wwwOptionForSave('both', '')).toBeUndefined()
  })

  it('seeds a compose route from what it says, never a guess', () => {
    expect(wwwChoiceFromComposeEntry({})).toBe('off')
    expect(wwwChoiceFromComposeEntry({ www: 'root-to-www' })).toBe('root-to-www')
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

  it('speaks the arrows as words', () => {
    expect(wwwChoiceOptions(['turbopanel.io']).map((o) => o.accessibilityLabel)).toEqual([
      'Only turbopanel.io',
      'Serve both names',
      'Send www.turbopanel.io to turbopanel.io',
      'Send turbopanel.io to www.turbopanel.io',
    ])
    expect(wwwChoiceOptions(['a.io', 'b.io']).map((o) => o.accessibilityLabel)).toEqual([
      'Only these names',
      'Serve both names',
      'Send each www name to the name without www',
      'Send each name to its www name',
    ])
  })

  it('uses the same labels for several hostnames and locks unusable names to Only', () => {
    expect(wwwChoiceOptions(['a.io', 'b.io']).map((o) => o.label)).toEqual([
      'Only these names',
      'Both names',
      'www.name → name',
      'name → www.name',
    ])
    const bothTyped = wwwChoiceOptions(['turbopanel.io', 'www.turbopanel.io'])
    expect(bothTyped.filter((o) => o.disabled).map((o) => o.value)).toEqual([
      'both',
      'www-to-root',
      'root-to-www',
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
    expect(wwwExtraNames(['*.turbopanel.io', 'b.io'], 'both')).toEqual(['www.b.io'])
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
