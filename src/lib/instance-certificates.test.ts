import { describe, expect, it } from 'vitest'
import {
  certificateSourceEligibility,
  daemonCapabilitiesStatus,
  hostnameStatusPresentation,
  http01PreflightPresentation,
  INSTANCE_ACME_HTTP01_ISSUER_UNREACHABLE,
  INSTANCE_HOSTNAME_SOURCE_LABELS,
  panelHostnameHttpsUrl,
  lockoutWarning,
  LETS_ENCRYPT_TERMS_LOADING_MESSAGE,
  LETS_ENCRYPT_TERMS_UNAVAILABLE_MESSAGE,
  letsEncryptSaveBlockedMessage,
  letsEncryptTermsAccepted,
  requiresPlatformCaConfirm,
} from '@/lib/instance-certificates'

const CAPABLE = { 'instance-cert-sources-per-hostname': true }

describe('INSTANCE_HOSTNAME_SOURCE_LABELS', () => {
  it('names Platform CA, Uploaded, and Let\'s Encrypt', () => {
    expect(INSTANCE_HOSTNAME_SOURCE_LABELS['platform-ca']).toBe('Platform CA')
    expect(INSTANCE_HOSTNAME_SOURCE_LABELS.uploaded).toBe('Uploaded')
    expect(INSTANCE_HOSTNAME_SOURCE_LABELS['lets-encrypt']).toBe("Let's Encrypt")
  })
})

describe('hostnameStatusPresentation', () => {
  it('pairs a tone with a label and an expiry line', () => {
    expect(
      hostnameStatusPresentation({
        status: 'ready',
        notAfter: '2026-12-01T00:00:00.000Z',
      }),
    ).toEqual({
      dot: 'online',
      badge: 'ok',
      label: 'Ready',
      expiry: '2026-12-01',
    })
    expect(
      hostnameStatusPresentation({ status: 'pending', notAfter: null }).label,
    ).toBe('Pending')
    expect(
      hostnameStatusPresentation({ status: 'failed', notAfter: null }).dot,
    ).toBe('failed')
    expect(
      hostnameStatusPresentation({ status: 'expired', notAfter: null }).label,
    ).toBe('Expired')
    expect(
      hostnameStatusPresentation({ status: 'ready', notAfter: null }).expiry,
    ).toBe('No expiry')
  })
})

describe('certificateSourceEligibility', () => {
  it('refuses uploaded and Let\'s Encrypt when the daemon cannot render them', () => {
    const refused = certificateSourceEligibility('panel.example.com', {
      certificates: [{ dnsNames: ['panel.example.com'] }],
      capabilities: { 'instance-cert-sources-per-hostname': false },
    })
    expect(refused.uploaded).toContain('too old')
    expect(refused['lets-encrypt']).toContain('too old')
  })

  it('names why the daemon state blocks a source instead of calling it too old', () => {
    for (const [status, phrase] of [
      ['not-applicable', 'self-hosted'],
      ['disconnected', "isn't connected"],
    ] as const) {
      const refused = certificateSourceEligibility('panel.example.com', {
        certificates: [],
        capabilities: undefined,
        capabilitiesStatus: status,
      })
      expect(refused['lets-encrypt']).toContain(phrase)
      expect(refused['lets-encrypt']).not.toContain('too old')
    }
  })

  it('reads the daemon query into one status', () => {
    expect(daemonCapabilitiesStatus({ isError: false })).toBe('loading')
    expect(daemonCapabilitiesStatus({ isError: true })).toBe('error')
    expect(daemonCapabilitiesStatus({ data: { applicable: false }, isError: false })).toBe(
      'not-applicable',
    )
    expect(
      daemonCapabilitiesStatus({ data: { applicable: true, connected: false }, isError: false }),
    ).toBe('disconnected')
    expect(
      daemonCapabilitiesStatus({ data: { applicable: true, connected: true }, isError: false }),
    ).toBe('ready')
  })

  it('says the daemon is still being read, or unreadable, rather than "too old"', () => {
    const loading = certificateSourceEligibility('panel.example.com', {
      certificates: [],
      capabilities: null,
      capabilitiesStatus: 'loading',
    })
    expect(loading['lets-encrypt']).toContain('Checking')
    expect(loading['lets-encrypt']).not.toContain('too old')
    const failed = certificateSourceEligibility('panel.example.com', {
      certificates: [],
      capabilities: null,
      capabilitiesStatus: 'error',
    })
    expect(failed.uploaded).toContain("Couldn't read")
    expect(failed.uploaded).not.toContain('too old')
  })

  it('refuses Let\'s Encrypt for private and wildcard names', () => {
    const privateName = certificateSourceEligibility('panel.lan', {
      certificates: [],
      capabilities: CAPABLE,
    })
    expect(privateName['lets-encrypt']).toContain('private')
    const wildcard = certificateSourceEligibility('*.example.com', {
      certificates: [{ dnsNames: ['*.example.com'] }],
      capabilities: CAPABLE,
    })
    expect(wildcard['lets-encrypt']).toContain('wildcard')
    expect(wildcard.uploaded).toBeUndefined()
  })

  it('refuses an uploaded source nothing covers', () => {
    const refused = certificateSourceEligibility('panel.example.com', {
      certificates: [{ dnsNames: ['other.example.com'] }],
      capabilities: CAPABLE,
    })
    expect(refused.uploaded).toContain('No uploaded certificate')
    expect(refused['lets-encrypt']).toBeUndefined()
  })
})

describe('lockoutWarning', () => {
  const current = [{ host: 'panel.example.com', source: 'platform-ca' as const }]

  it('is quiet when nothing changes', () => {
    expect(lockoutWarning(current, current)).toBeNull()
  })

  it('names the Platform CA recovery address on :8443', () => {
    const warning = lockoutWarning(current, [
      { host: 'panel.example.com', source: 'lets-encrypt' },
    ])
    expect(warning).toContain('https://panel.example.com:8443')
    expect(warning).toContain('Platform CA')
  })
})

describe('requiresPlatformCaConfirm', () => {
  it('confirms when the last Platform CA hostname is removed', () => {
    expect(
      requiresPlatformCaConfirm(
        [{ host: 'panel.example.com', source: 'platform-ca' }],
        [],
      ),
    ).toBe(true)
  })

  it('confirms when the only routable name leaves the Platform CA', () => {
    expect(
      requiresPlatformCaConfirm(
        [
          { host: 'panel.lan', source: 'platform-ca' },
          { host: 'panel.example.com', source: 'platform-ca' },
        ],
        [
          { host: 'panel.lan', source: 'platform-ca' },
          { host: 'panel.example.com', source: 'lets-encrypt' },
        ],
      ),
    ).toBe(true)
  })

  it('stays quiet when a Platform CA name remains', () => {
    expect(
      requiresPlatformCaConfirm(
        [
          { host: 'a.example.com', source: 'platform-ca' },
          { host: 'b.example.com', source: 'platform-ca' },
        ],
        [{ host: 'a.example.com', source: 'platform-ca' }],
      ),
    ).toBe(false)
  })
})

describe('panelHostnameHttpsUrl', () => {
  it('serves every hostname at https on port 8443', () => {
    expect(panelHostnameHttpsUrl('panel.example.com')).toBe(
      'https://panel.example.com:8443',
    )
    expect(panelHostnameHttpsUrl('https://panel.example.com')).toBe(
      'https://panel.example.com:8443',
    )
    expect(panelHostnameHttpsUrl('https://panel.example.com:443')).toBe(
      'https://panel.example.com:8443',
    )
    expect(panelHostnameHttpsUrl('https://panel.example.com:9443')).toBe(
      'https://panel.example.com:8443',
    )
    expect(panelHostnameHttpsUrl('2001:db8::1')).toBe(
      'https://[2001:db8::1]:8443',
    )
  })
})

describe('http01PreflightPresentation', () => {
  it('reports a failed nonce check separately from later issuance', () => {
    const failed = http01PreflightPresentation({
      source: 'lets-encrypt',
      acmeLastError:
        'Let\'s Encrypt HTTP-01 preflight failed for panel.example.com: http://panel.example.com/.well-known/acme-challenge/abc did not reach the instance ACME issuer (HTTP 404)',
      acmeLastAttemptAt: '2026-09-22T00:00:00.000Z',
    })
    expect(failed?.kind).toBe('failed')
    expect(failed?.text.includes(INSTANCE_ACME_HTTP01_ISSUER_UNREACHABLE)).toBe(true)

    const issued = http01PreflightPresentation({
      source: 'lets-encrypt',
      acmeLastError: 'rate limited',
      acmeLastAttemptAt: '2026-09-22T00:00:00.000Z',
    })
    expect(issued).toEqual({
      kind: 'passed',
      text: 'HTTP-01 preflight passed before issuance was attempted.',
    })
  })

  it('stays unrecorded until an attempt exists and ignores other sources', () => {
    expect(http01PreflightPresentation({
      source: 'lets-encrypt',
      acmeLastError: null,
      acmeLastAttemptAt: null,
    })?.kind).toBe('unrecorded')
    expect(http01PreflightPresentation({
      source: 'platform-ca',
      acmeLastError: null,
      acmeLastAttemptAt: null,
    })).toBeNull()
  })
})

describe('letsEncryptTermsAccepted', () => {
  it("prefers the server's tosAccepted over the raw setting", () => {
    expect(letsEncryptTermsAccepted({
      tosAccepted: true,
      settings: { TURBOPANEL_INSTANCE_ACME__TOS_ACCEPTED: { value: 'false', source: 'db' } },
    })).toBe(true)
    expect(letsEncryptTermsAccepted({
      tosAccepted: false,
      settings: { TURBOPANEL_INSTANCE_ACME__TOS_ACCEPTED: { value: 'true', source: 'db' } },
    })).toBe(false)
  })

  it("reads an older control plane with the server's own flag rule, not 'true' only", () => {
    for (const value of ['1', 'true', 'TRUE', 'yes', ' Yes ']) {
      expect(letsEncryptTermsAccepted({
        settings: { TURBOPANEL_INSTANCE_ACME__TOS_ACCEPTED: { value, source: 'env' } },
      })).toBe(true)
    }
    for (const value of ['0', 'false', 'no', '', null]) {
      expect(letsEncryptTermsAccepted({
        settings: { TURBOPANEL_INSTANCE_ACME__TOS_ACCEPTED: { value, source: 'db' } },
      })).toBe(false)
    }
    expect(letsEncryptTermsAccepted(undefined)).toBe(false)
  })
})

describe('letsEncryptSaveBlockedMessage', () => {
  const notAccepted = (source: string) => ({
    data: {
      tosAccepted: false,
      settings: { TURBOPANEL_INSTANCE_ACME__TOS_ACCEPTED: { value: 'false', source } },
    },
    isError: false,
  })

  it('never blocks a save with no Let\'s Encrypt row, whatever the settings say', () => {
    expect(letsEncryptSaveBlockedMessage({
      usesLetsEncrypt: false,
      acme: { data: undefined, isError: true },
    })).toBeNull()
  })

  it('blocks with a loading sentence, not "not accepted", while the settings load', () => {
    expect(letsEncryptSaveBlockedMessage({
      usesLetsEncrypt: true,
      acme: { data: undefined, isError: false },
    })).toBe(LETS_ENCRYPT_TERMS_LOADING_MESSAGE)
  })

  it('blocks with an unavailable sentence when the settings failed to load', () => {
    expect(letsEncryptSaveBlockedMessage({
      usesLetsEncrypt: true,
      acme: { data: undefined, isError: true },
    })).toBe(LETS_ENCRYPT_TERMS_UNAVAILABLE_MESSAGE)
  })

  it('allows the save once the server says the terms are accepted', () => {
    expect(letsEncryptSaveBlockedMessage({
      usesLetsEncrypt: true,
      acme: { data: { tosAccepted: true }, isError: false },
    })).toBeNull()
  })

  it('points to Certificates when the terms are not accepted in the database', () => {
    expect(letsEncryptSaveBlockedMessage({
      usesLetsEncrypt: true,
      acme: notAccepted('default'),
    })).toContain('Certificates')
  })

  it('points to the environment when the terms are env-sourced and not accepted', () => {
    expect(letsEncryptSaveBlockedMessage({
      usesLetsEncrypt: true,
      acme: notAccepted('env'),
    })).toContain('TURBOPANEL_INSTANCE_ACME__TOS_ACCEPTED=true')
  })
})
