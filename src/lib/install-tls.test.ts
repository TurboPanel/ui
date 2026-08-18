import { describe, expect, it } from 'vitest'
import {
  formatInstanceDlBase,
  installOriginNeedsInsecureTls,
  installTlsHint,
} from './install-tls'

describe('installOriginNeedsInsecureTls', () => {
  it('treats Cloudflare-style public HTTPS on 443 as trusted', () => {
    expect(installOriginNeedsInsecureTls('https://turbopanel.dev')).toBe(false)
    expect(installOriginNeedsInsecureTls('https://panel.example.com')).toBe(
      false,
    )
  })

  it('treats the self-signed Caddy listener as insecure', () => {
    expect(installOriginNeedsInsecureTls('https://studio.lan:8443')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://panel.example.com:8443')).toBe(
      true,
    )
  })

  it('treats reserved LAN TLDs as insecure even on 443', () => {
    expect(installOriginNeedsInsecureTls('https://studio.lan')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://localhost')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://app.localhost')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://box.local')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://box.internal')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://box.home')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://box.corp')).toBe(true)
  })

  it('treats loopback and RFC1918 IPv4 hosts as insecure on 443', () => {
    expect(installOriginNeedsInsecureTls('https://127.0.0.1')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://10.0.0.5')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://192.168.1.10')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://172.16.0.2')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://172.31.255.1')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://169.254.1.1')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://172.32.0.1')).toBe(false)
  })

  it('treats loopback and ULA IPv6 hosts as insecure on 443', () => {
    expect(installOriginNeedsInsecureTls('https://[::1]')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://[0:0:0:0:0:0:0:1]')).toBe(
      true,
    )
    expect(installOriginNeedsInsecureTls('https://[fe80::1]')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://[fd12::1]')).toBe(true)
    expect(installOriginNeedsInsecureTls('https://[fc00::1]')).toBe(true)
  })

  it('never flags plaintext HTTP or non-https schemes', () => {
    expect(installOriginNeedsInsecureTls('http://studio.lan:8880')).toBe(false)
    expect(installOriginNeedsInsecureTls('ftp://panel.example.com')).toBe(false)
    expect(installOriginNeedsInsecureTls('not a url')).toBe(false)
  })

  it('returns false for unparseable https-looking strings', () => {
    expect(installOriginNeedsInsecureTls('https://')).toBe(false)
  })
})

describe('formatInstanceDlBase', () => {
  it('appends /downloads/daemon', () => {
    expect(formatInstanceDlBase('https://turbopanel.dev/')).toBe(
      'https://turbopanel.dev/downloads/daemon',
    )
    expect(formatInstanceDlBase('https://turbopanel.dev')).toBe(
      'https://turbopanel.dev/downloads/daemon',
    )
  })
})

describe('installTlsHint', () => {
  it('explains public TLS vs platform CA', () => {
    expect(installTlsHint('https://turbopanel.dev')).toContain(
      'publicly trusted TLS',
    )
    expect(installTlsHint('https://studio.lan:8443')).toContain('platform CA')
    expect(installTlsHint('http://studio.lan:8880')).toContain('Plaintext HTTP')
  })

  it('returns null for empty or non-http(s) origins', () => {
    expect(installTlsHint('')).toBeNull()
    expect(installTlsHint('  ')).toBeNull()
    expect(installTlsHint('ftp://panel.example.com')).toBeNull()
  })
})
