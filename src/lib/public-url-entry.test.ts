import { describe, expect, it } from 'vitest'
import {
  addPublicUrlEntry,
  buildPublicUrlEntry,
  formatPublicUrlEntry,
  parsePublicPort,
  parsePublicUrlEntry,
  publicOriginForRecord,
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
      buildPublicUrlEntry({ scheme: 'https', host: 'turbopanel.dev', port: '443' })
    ).toMatchObject({ ok: true, value: 'https://turbopanel.dev' })
    expect(
      buildPublicUrlEntry({ scheme: 'http', host: 'turbopanel.dev', port: '80' })
    ).toMatchObject({ ok: true, value: 'http://turbopanel.dev' })
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'turbopanel.dev', port: '80' })
    ).toMatchObject({ ok: true, value: 'https://turbopanel.dev:80' })
  })

  it('keeps a port that is only the *other* scheme default', () => {
    expect(buildPublicUrlEntry({ scheme: 'http', host: 'panel.lan', port: '443' })).toMatchObject({
      ok: true,
      value: 'http://panel.lan:443',
    })
    expect(buildPublicUrlEntry({ scheme: 'http', host: 'panel.lan:443', port: '' })).toMatchObject({
      ok: true,
      value: 'http://panel.lan:443',
    })
    expect(buildPublicUrlEntry({ scheme: 'http', host: 'panel.lan:80', port: '' })).toMatchObject({
      ok: true,
      value: 'http://panel.lan',
    })
  })

  it('absorbs a pasted address, dropping everything after the port', () => {
    expect(
      buildPublicUrlEntry({
        scheme: 'https',
        host: 'https://turbopanel.dev/blah/foo/bar',
        port: '',
      })
    ).toMatchObject({ ok: true, value: 'https://turbopanel.dev' })
    expect(
      buildPublicUrlEntry({
        scheme: 'https',
        host: 'https://studio.lan:8443/something/foo',
        port: '',
      })
    ).toMatchObject({ ok: true, value: 'https://studio.lan:8443' })
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'https://panel.example.com/?a=1#b', port: '' })
    ).toMatchObject({ ok: true, value: 'https://panel.example.com' })
  })

  it('lets a pasted scheme and port win over the other two controls', () => {
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'http://panel.lan:8080/x', port: '9999' })
    ).toMatchObject({ ok: true, value: 'http://panel.lan:8080' })
  })

  it('takes a host:port typed into the hostname box', () => {
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'panel.lan:8443', port: '' })
    ).toMatchObject({ ok: true, value: 'https://panel.lan:8443' })
  })

  it('brackets a bare IPv6 literal', () => {
    expect(buildPublicUrlEntry({ scheme: 'https', host: '2001:db8::1', port: '8443' })).toEqual({
      ok: true,
      value: 'https://[2001:db8::1]:8443',
      parts: { scheme: 'https', host: '2001:db8::1', port: '8443' },
    })
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: '[2001:db8::1]:8443', port: '' })
    ).toMatchObject({ ok: true, value: 'https://[2001:db8::1]:8443' })
  })

  it('lowercases the host', () => {
    expect(
      buildPublicUrlEntry({ scheme: 'https', host: 'Panel.Example.COM', port: '' })
    ).toMatchObject({ ok: true, value: 'https://panel.example.com' })
  })

  it('rejects an empty or unusable host', () => {
    expect(buildPublicUrlEntry({ scheme: 'https', host: '   ', port: '' })).toMatchObject({
      ok: false,
    })
    expect(buildPublicUrlEntry({ scheme: 'https', host: 'localhost', port: '' })).toMatchObject({
      ok: false,
    })
    expect(buildPublicUrlEntry({ scheme: 'https', host: 'panel example', port: '' })).toMatchObject(
      {
        ok: false,
      }
    )
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
    for (const entry of [
      'https://panel.lan',
      'http://panel.lan:8080',
      'https://[2001:db8::1]:8443',
    ]) {
      const parts = parsePublicUrlEntry(entry)
      expect(parts).not.toBeNull()
      expect(formatPublicUrlEntry(parts!)).toBe(entry)
    }
  })
})

describe('addPublicUrlEntry', () => {
  it('appends the composed entry', () => {
    expect(
      addPublicUrlEntry(['https://a.example'], { scheme: 'https', host: 'b.example', port: '' })
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

  it('treats a portless https draft as the saved :8443 address', () => {
    const result = addPublicUrlEntry(['https://panel.example.com:8443'], {
      scheme: 'https',
      host: 'panel.example.com',
      port: '',
    })
    expect(result).toMatchObject({ ok: false })
    expect(result.ok ? '' : result.error).toContain('already listed')
  })

  it('treats a scheme-less stored entry as the https address it expands to', () => {
    expect(
      addPublicUrlEntry(['panel.lan'], { scheme: 'https', host: 'panel.lan', port: '' })
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
      samePublicUrlSet(['https://a.example', 'panel.lan'], ['panel.lan', 'https://a.example/'])
    ).toBe(true)
  })

  it('sees a different membership', () => {
    expect(samePublicUrlSet(['https://a.example'], [])).toBe(false)
    expect(samePublicUrlSet(['https://a.example'], ['https://b.example'])).toBe(false)
    expect(
      samePublicUrlSet(['https://a.example'], ['https://a.example', 'https://b.example'])
    ).toBe(false)
  })

  it('compares unreadable entries verbatim', () => {
    expect(
      samePublicUrlSet(['https://panel.example.com'], ['https://panel.example.com:8443'])
    ).toBe(true)
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

describe('publicOriginForRecord', () => {
  it('drops the port on 443 and keeps any other', () => {
    expect(publicOriginForRecord({ host: 'panel.example.test', publicPort: 443 })).toBe(
      'https://panel.example.test'
    )
    expect(publicOriginForRecord({ host: 'panel.example.test', publicPort: 8443 })).toBe(
      'https://panel.example.test:8443'
    )
  })

  it('reads a missing port as 8443 and brackets IPv6', () => {
    expect(publicOriginForRecord({ host: 'https://panel.example.test:8443' })).toBe(
      'https://panel.example.test:8443'
    )
    expect(publicOriginForRecord({ host: '[2001:db8::1]', publicPort: 9443 })).toBe(
      'https://[2001:db8::1]:9443'
    )
  })
})

describe('parsePublicPort', () => {
  it('accepts whole ports from 1 to 65535 only', () => {
    expect(parsePublicPort(' 443 ')).toBe(443)
    for (const bad of ['', '0', '65536', '12.5', 'abc', '-1']) {
      expect(parsePublicPort(bad)).toBeNull()
    }
  })
})

describe('buildPublicUrlEntry on the self-hosted runtime', () => {
  const selfHosted = { selfHosted: true }
  const HOST_ONLY = 'Enter a hostname or IP address only, like panel.example.com.'

  function build(host: string, scheme: 'https' | 'http' = 'https', port = '') {
    return buildPublicUrlEntry({ scheme, host, port }, selfHosted)
  }

  it.each([
    ['turbopanel.dev', 'https://turbopanel.dev:8443'],
    ['  Panel.Example.COM  ', 'https://panel.example.com:8443'],
    ['panel', 'https://panel:8443'],
    ['my-panel.lan', 'https://my-panel.lan:8443'],
    ['panel.example.com.', 'https://panel.example.com:8443'],
    ['192.168.1.20', 'https://192.168.1.20:8443'],
    ['2001:db8::1', 'https://[2001:db8::1]:8443'],
    ['2001:DB8:0:0:0:0:0:1', 'https://[2001:db8::1]:8443'],
    ['[2001:db8::1]', 'https://[2001:db8::1]:8443'],
    [`${'a'.repeat(63)}.lan`, `https://${'a'.repeat(63)}.lan:8443`],
  ])('accepts %s', (host, value) => {
    expect(build(host)).toMatchObject({ ok: true, value })
  })

  it('always stores https on 8443, whatever the hidden scheme and port controls hold', () => {
    expect(build('studio.lan', 'http', '9000')).toMatchObject({
      ok: true,
      value: 'https://studio.lan:8443',
    })
  })

  it.each([
    'https://studio.lan',
    'http://studio.lan',
    'https://studio.lan:8443/admin/access',
    'studio.lan/admin',
    'studio.lan?x=1',
    'studio.lan#top',
    '//studio.lan:80',
    '///studio.lan:443',
    String.raw`studio.lan\admin`,
    String.raw`\\studio.lan`,
    'user@studio.lan',
    'user:pass@studio.lan:8443',
    'studio lan',
    'studio_lan',
    'stüdio.lan',
    '-studio.lan',
    'studio-.lan',
    'studio..lan',
    '.studio.lan',
    'studio.lan..',
    `${'a'.repeat(64)}.lan`,
    `${'a.'.repeat(126)}ab`,
    'studio.lan:',
    'studio.lan:8443',
    'studio.lan:08443',
    'studio.lan:443',
    'studio.lan:80',
    'studio.lan:9443',
    '192.168.1.20:8443',
    '[2001:db8::1]:8443',
    '[::1]:8443',
    '[2001:db8::1]:443',
    '10.0.0.1:0',
    'studio.lan:port',
    'studio.lan:-1',
    '256.1.1.1',
    '010.0.0.1',
    '1.2.3',
    'host.123',
    '[2001:db8::1',
    '[studio.lan]',
    '[2001:db8::1]:',
    '2001:db8::zz',
  ])('refuses %s as not a hostname or IP', (host) => {
    expect(build(host)).toEqual({ ok: false, error: HOST_ONLY })
  })

  it('refuses an empty box and localhost with their own messages', () => {
    expect(build('   ')).toEqual({
      ok: false,
      error: 'Enter a hostname, for example panel.example.com',
    })
    expect(build('localhost')).toMatchObject({
      ok: false,
      error: expect.stringContaining('localhost'),
    })
    expect(build('LOCALHOST.')).toMatchObject({
      ok: false,
      error: expect.stringContaining('localhost'),
    })
  })

  it('treats a portless draft and a saved :8443 row as the same address', () => {
    expect(
      addPublicUrlEntry(
        ['https://turbopanel.dev:8443'],
        { scheme: 'https', host: 'turbopanel.dev', port: '' },
        selfHosted
      )
    ).toEqual({ ok: false, error: 'That address is already listed.' })
  })
})

describe('buildPublicUrlEntry on High Availability (no selfHosted)', () => {
  it.each([
    ['https://studio.lan:8443/admin/access', 'https://studio.lan:8443'],
    ['http://studio.lan:8080/x?y=1', 'http://studio.lan:8080'],
    ['https://studio.lan:443', 'https://studio.lan'],
    ['studio.lan:9443', 'https://studio.lan:9443'],
  ])('still absorbs %s as before', (host, value) => {
    expect(buildPublicUrlEntry({ scheme: 'https', host, port: '' })).toMatchObject({
      ok: true,
      value,
    })
  })

  it('still offers http and the port box', () => {
    expect(buildPublicUrlEntry({ scheme: 'http', host: 'panel.lan', port: '8080' })).toMatchObject({
      ok: true,
      value: 'http://panel.lan:8080',
    })
  })
})
