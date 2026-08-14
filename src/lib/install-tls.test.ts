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
  })

  it('never flags plaintext HTTP', () => {
    expect(installOriginNeedsInsecureTls('http://studio.lan:8880')).toBe(false)
  })
})

describe('formatInstanceDlBase', () => {
  it('appends /downloads/daemon', () => {
    expect(formatInstanceDlBase('https://turbopanel.dev/')).toBe(
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
})
