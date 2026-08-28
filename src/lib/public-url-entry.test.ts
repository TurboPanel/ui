import { describe, expect, it } from 'vitest'
import {
  addPublicUrlEntry,
  buildPublicUrlEntry,
  formatPublicUrlEntry,
  parsePublicUrlEntry,
  PUBLIC_URL_DEFAULT_PORT,
  PUBLIC_URL_ENTRY_HINT,
  PUBLIC_URL_SCHEMES,
  samePublicUrlSet,
} from '@/lib/public-url-entry'

describe('buildPublicUrlEntry', () => {
  it('composes scheme, host, and port', () => {
    expect(buildPublicUrlEntry({ scheme: 'https', host: 'studio.lan', port: '8443' })).toEqual({
      ok: true,
      value: 'https://studio.lan:8443',
      parts: { scheme: 'https', host: 'studio.lan', port: '8443' },
    })
  })

  it('drops the port when it is the scheme default', () => {
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'turbopanel.dev', port: '443' }),
    ).toMatchObject({ ok: true, value: 'https://turbopanel.dev' })
    expect(
      buildPublicUrlEntry({ scheme: 'http', host: 'turbopanel.dev', port: '80' }),
    ).toMatchObject({ ok: true, value: 'http://turbopanel.dev' })
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'turbopanel.dev', port: '80' }),
    ).toMatchObject({ ok: true, value: 'https://turbopanel.dev:80' })
  })

  it('keeps a port that is only the *other* scheme default', () => {
    expect(
      buildPublicUrlEntry({ scheme: 'http', host: 'panel.lan', port: '443' }),
    ).toMatchObject({ ok: true, value: 'http://panel.lan:443' })
    expect(
      buildPublicUrlEntry({ scheme: 'http', host: 'panel.lan:443', port: '' }),
    ).toMatchObject({ ok: true, value: 'http://panel.lan:443' })
    expect(
      buildPublicUrlEntry({ scheme: 'http', host: 'panel.lan:80', port: '' }),
    ).toMatchObject({ ok: true, value: 'http://panel.lan' })
  })

  it('absorbs a pasted address, dropping everything after the port', () => {
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'https://turbopanel.dev/blah/foo/bar', port: '' }),
    ).toMatchObject({ ok: true, value: 'https://turbopanel.dev' })
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'https://studio.lan:8443/something/foo', port: '' }),
    ).toMatchObject({ ok: true, value: 'https://studio.lan:8443' })
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'https://panel.example.com/?a=1#b', port: '' }),
    ).toMatchObject({ ok: true, value: 'https://panel.example.com' })
  })

  it('lets a pasted scheme and port win over the other two controls', () => {
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'http://panel.lan:8080/x', port: '9999' }),
    ).toMatchObject({ ok: true, value: 'http://panel.lan:8080' })
  })

  it('takes a host:port typed into the hostname box', () => {
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'panel.lan:8443', port: '' }),
    ).toMatchObject({ ok: true, value: 'https://panel.lan:8443' })
  })

  it('brackets a bare IPv6 literal', () => {
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: '2001:db8::1', port: '8443' }),
    ).toEqual({
      ok: true,
      value: 'https://[2001:db8::1]:8443',
      parts: { scheme: 'https', host: '2001:db8::1', port: '8443' },
    })
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: '[2001:db8::1]:8443', port: '' }),
    ).toMatchObject({ ok: true, value: 'https://[2001:db8::1]:8443' })
  })

  it('lowercases the host', () => {
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'Panel.Example.COM', port: '' }),
    ).toMatchObject({ ok: true, value: 'https://panel.example.com' })
  })

  it('rejects an empty or unusable host', () => {
    expect(buildPublicUrlEntry({ scheme: 'https', host: '   ', port: '' })).toMatchObject({
      ok: false,
    })
    expect(buildPublicUrlEntry({ scheme: 'https', host: 'localhost', port: '' })).toMatchObject({
      ok: false,
    })
    expect(buildPublicUrlEntry({ scheme: 'https', host: 'panel example', port: '' })).toMatchObject({
      ok: false,
    })
    expect(buildPublicUrlEntry({ scheme: 'https', host: '://', port: '' })).toMatchObject({
      ok: false,
    })
  })

  it('rejects a non-http scheme and embedded credentials', () => {
    const scheme = buildPublicUrlEntry({ scheme: 'https', host: 'ftp://panel.lan', port: '' })
    expect(scheme).toMatchObject({ ok: false })
    expect(scheme.ok ? '' : scheme.error).toContain('http')

    const creds = buildPublicUrlEntry({
      scheme: 'https',
      host: 'https://user:pw@panel.lan',
      port: '',
    })
    expect(creds).toMatchObject({ ok: false })
    expect(creds.ok ? '' : creds.error).toContain('password')
  })

  it('rejects an unusable port', () => {
    for (const port of ['0', '65536', 'abc', '-1', '123456']) {
      expect(buildPublicUrlEntry({ scheme: 'https', host: 'panel.lan', port })).toMatchObject({
        ok: false,
      })
    }
  })
})

describe('parsePublicUrlEntry', () => {
  it('splits a stored entry into parts', () => {
    expect(parsePublicUrlEntry('https://studio.lan:8443')).toEqual({
      scheme: 'https',
      host: 'studio.lan',
      port: '8443',
    })
    expect(parsePublicUrlEntry('http://panel.lan')).toEqual({
      scheme: 'http',
      host: 'panel.lan',
      port: null,
    })
  })

  it('reads a scheme-less stored entry as https', () => {
    expect(parsePublicUrlEntry('panel.lan')).toEqual({
      scheme: 'https',
      host: 'panel.lan',
      port: null,
    })
    expect(parsePublicUrlEntry('panel.lan:8443')).toEqual({
      scheme: 'https',
      host: 'panel.lan',
      port: '8443',
    })
  })

  it('drops a redundant default port', () => {
    expect(parsePublicUrlEntry('https://panel.lan:443')?.port).toBeNull()
    expect(parsePublicUrlEntry('http://panel.lan:80')?.port).toBeNull()
  })

  it('returns null for something it cannot read', () => {
    expect(parsePublicUrlEntry('')).toBeNull()
    expect(parsePublicUrlEntry('   ')).toBeNull()
    expect(parsePublicUrlEntry('two words')).toBeNull()
    expect(parsePublicUrlEntry('ftp://panel.lan')).toBeNull()
    expect(parsePublicUrlEntry('localhost')).toBeNull()
  })
})

describe('formatPublicUrlEntry', () => {
  it('round-trips parsed parts', () => {
    for (const entry of ['https://panel.lan', 'http://panel.lan:8080', 'https://[2001:db8::1]:8443']) {
      const parts = parsePublicUrlEntry(entry)
      expect(parts).not.toBeNull()
      expect(formatPublicUrlEntry(parts!)).toBe(entry)
    }
  })
})

describe('addPublicUrlEntry', () => {
  it('appends the composed entry', () => {
    expect(
      addPublicUrlEntry(['https://a.example'], { scheme: 'https', host: 'b.example', port: '' }),
    ).toEqual({
      ok: true,
      urls: ['https://a.example', 'https://b.example'],
      value: 'https://b.example',
    })
  })

  it('refuses a duplicate, however it was written', () => {
    const result = addPublicUrlEntry(['https://panel.lan:8443'], {
      scheme: 'https',
      host: 'https://panel.lan:8443/admin/networking',
      port: '',
    })
    expect(result).toMatchObject({ ok: false })
    expect(result.ok ? '' : result.error).toContain('already listed')
  })

  it('treats a scheme-less stored entry as the https address it expands to', () => {
    expect(
      addPublicUrlEntry(['panel.lan'], { scheme: 'https', host: 'panel.lan', port: '' }),
    ).toMatchObject({ ok: false })
  })

  it('passes the composition error straight through', () => {
    expect(addPublicUrlEntry([], { scheme: 'https', host: '', port: '' })).toMatchObject({
      ok: false,
    })
  })
})

describe('samePublicUrlSet', () => {
  it('ignores order and formatting', () => {
    expect(
      samePublicUrlSet(['https://a.example', 'panel.lan'], ['panel.lan', 'https://a.example/']),
    ).toBe(true)
  })

  it('sees a different membership', () => {
    expect(samePublicUrlSet(['https://a.example'], [])).toBe(false)
    expect(samePublicUrlSet(['https://a.example'], ['https://b.example'])).toBe(false)
    expect(
      samePublicUrlSet(['https://a.example'], ['https://a.example', 'https://b.example']),
    ).toBe(false)
  })

  it('compares unreadable entries verbatim', () => {
    expect(samePublicUrlSet(['not a url'], ['not a url'])).toBe(true)
    expect(samePublicUrlSet(['not a url'], ['other junk'])).toBe(false)
  })
})

describe('module constants', () => {
  it('offers both schemes with their default ports', () => {
    expect(PUBLIC_URL_SCHEMES).toEqual(['https', 'http'])
    expect(PUBLIC_URL_DEFAULT_PORT).toEqual({ https: '443', http: '80' })
    expect(PUBLIC_URL_ENTRY_HINT).toContain('port')
  })
})
