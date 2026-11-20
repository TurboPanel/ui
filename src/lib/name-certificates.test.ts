import { describe, expect, it } from 'vitest'
import { DnsCertificateRateLimitedError } from './instance-api'
import type {
  HostingCertificate,
  HostingNameCertificate,
  HostingNameCertificateOption,
  TlsRecord,
} from './instance-api'
import {
  choiceFromValue,
  currentChoice,
  hasMixedChoices,
  isWwwSibling,
  MIXED_VALUE,
  nameChoicesToSend,
  nameState,
  optionLabel,
  optionOf,
  optionValue,
  otherNamesCoveredBy,
  retryWaitMessage,
  sharedOptions,
  sharedValue,
  withLibraryChoice,
  withNameChoice,
  withSharedChoice,
} from './name-certificates'

const opt = (
  certificate: HostingNameCertificateOption['certificate'],
  extra: Partial<HostingNameCertificateOption> = {}
): HostingNameCertificateOption => ({ certificate, available: true, ...extra })

function name(
  hostname: string,
  certificate: HostingNameCertificate['certificate'] = 'self_signed',
  tlsId: string | null = null,
  options: HostingNameCertificateOption[] = [
    opt('self_signed'),
    opt('letsencrypt_http'),
    opt('library', { tlsId: 'lib-1' }),
  ]
): HostingNameCertificate {
  return {
    hostname,
    certificate,
    tlsId,
    certificateOptions: { default: 'letsencrypt_http', options },
  }
}

function row(
  id: string,
  acme: NonNullable<TlsRecord['metadata']['acme']> | undefined,
  status: string,
  dnsNames = ['a.example.net'],
  source = 'lets_encrypt'
) {
  return {
    id,
    organizationId: 'o1',
    name: null,
    source,
    metadata: { dnsNames, status, acme },
    createdAt: '',
    updatedAt: '',
  } as unknown as TlsRecord
}

const NOW = '2030-01-02T03:04:05.000Z'

describe('picker values', () => {
  it('round-trips a certificate and a library pin', () => {
    expect(optionValue(opt('self_signed'))).toBe('self_signed')
    expect(optionValue(opt('library', { tlsId: 'lib-1' }))).toBe('library:lib-1')
    expect(choiceFromValue('library:lib-1')).toEqual({ certificate: 'library', tlsId: 'lib-1' })
    expect(choiceFromValue('letsencrypt_http')).toEqual({
      certificate: 'letsencrypt_http',
      tlsId: null,
    })
    expect(choiceFromValue('nonsense')).toBeNull()
    expect(choiceFromValue(MIXED_VALUE)).toBeNull()
  })

  it('names an option by the panel label, the library name, then the kind', () => {
    const library = [row('lib-1', undefined, 'ready', ['a.example.net'], 'upload')]
    expect(optionLabel(opt('self_signed', { label: 'Test' }), library)).toBe('Test')
    expect(optionLabel(opt('library', { tlsId: 'lib-1' }), library)).toBe(
      'Certificate From The Library: a.example.net'
    )
    expect(optionLabel(opt('library', { tlsId: 'gone' }), library)).toBe(
      'Certificate From The Library'
    )
    expect(optionLabel(opt('self_signed'), [])).toBe('Self-Signed')
  })

  it('finds the option a choice stands on', () => {
    const n = name('a.example.net')
    expect(optionOf(n, { certificate: 'library', tlsId: 'lib-1' })?.tlsId).toBe('lib-1')
    expect(optionOf(n, { certificate: 'letsencrypt_http', tlsId: null })?.certificate).toBe(
      'letsencrypt_http'
    )
    expect(optionOf(n, { certificate: 'library', tlsId: 'other' })).toBeUndefined()
  })
})

describe('edits', () => {
  const names = [name('a.example.net'), name('b.example.net', 'letsencrypt_http')]

  it('reads the saved choice until an edit replaces it', () => {
    expect(currentChoice(names[0]!, {})).toEqual({ certificate: 'self_signed', tlsId: null })
    const edits = withNameChoice(names, {}, 'A.example.net', {
      certificate: 'letsencrypt_http',
      tlsId: null,
    })
    expect(currentChoice(names[0]!, edits).certificate).toBe('letsencrypt_http')
  })

  it('clears an edit that puts the saved choice back', () => {
    const edits = withNameChoice(names, {}, 'a.example.net', {
      certificate: 'letsencrypt_http',
      tlsId: null,
    })
    expect(
      withNameChoice(names, edits, 'a.example.net', { certificate: 'self_signed', tlsId: null })
    ).toEqual({})
  })

  it('sends only the names that changed, with a tlsId only when one is pinned', () => {
    expect(nameChoicesToSend(names, {})).toBeNull()
    const edits = withLibraryChoice(names, {}, ['a.example.net', 'b.example.net'], 'lib-1')
    expect(nameChoicesToSend(names, edits)).toEqual([
      { hostname: 'a.example.net', certificate: 'library', tlsId: 'lib-1' },
      { hostname: 'b.example.net', certificate: 'library', tlsId: 'lib-1' },
    ])
    const toSelf = withNameChoice(names, {}, 'b.example.net', {
      certificate: 'self_signed',
      tlsId: 'stale',
    })
    expect(nameChoicesToSend(names, toSelf)).toEqual([
      { hostname: 'b.example.net', certificate: 'self_signed' },
    ])
  })

  it('tells when names would differ', () => {
    expect(hasMixedChoices(names, {})).toBe(true)
    expect(hasMixedChoices([names[0]!], {})).toBe(false)
  })
})

describe('same for all names', () => {
  it('shares a value, or says mixed, or nothing without names', () => {
    const same = [name('a.example.net'), name('b.example.net')]
    expect(sharedValue(same, {})).toBe('self_signed')
    expect(
      sharedValue([name('a.example.net'), name('b.example.net', 'letsencrypt_http')], {})
    ).toBe(MIXED_VALUE)
    expect(sharedValue([], {})).toBeNull()
  })

  it('offers only what every name offers', () => {
    const a = name('a.example.net')
    const b = name('b.example.net', 'self_signed', null, [
      opt('self_signed'),
      opt('library', { tlsId: 'lib-1' }),
    ])
    expect(sharedOptions([a, b]).map(optionValue)).toEqual(['self_signed', 'library:lib-1'])
    expect(sharedOptions([])).toEqual([])
  })

  it('leaves a name alone that cannot use the choice', () => {
    const a = name('a.example.net')
    const b = name('b.example.net', 'self_signed', null, [
      opt('self_signed'),
      opt('letsencrypt_http', { available: false, reason: 'No server.' }),
    ])
    const edits = withSharedChoice([a, b], {}, { certificate: 'letsencrypt_http', tlsId: null })
    expect(Object.keys(edits)).toEqual(['a.example.net'])
  })
})

describe('otherNamesCoveredBy', () => {
  const library = [row('lib-1', undefined, 'ready', ['*.example.net'], 'upload')]
  const names = [name('a.example.net'), name('b.example.net'), name('c.other.test')]

  it('offers the names the certificate lists and can serve', () => {
    expect(
      otherNamesCoveredBy(names, {}, { hostname: 'a.example.net', tlsId: 'lib-1' }, library)
    ).toEqual(['b.example.net'])
  })

  it('offers nothing without a library pin, or for a name already using it', () => {
    expect(
      otherNamesCoveredBy(names, {}, { hostname: 'a.example.net', tlsId: null }, library)
    ).toEqual([])
    const edits = withLibraryChoice(names, {}, ['b.example.net'], 'lib-1')
    expect(
      otherNamesCoveredBy(names, edits, { hostname: 'a.example.net', tlsId: 'lib-1' }, library)
    ).toEqual([])
  })
})

describe('isWwwSibling', () => {
  it('is true for the www spelling of a listed name', () => {
    const names = [name('example.net'), name('www.example.net')]
    expect(isWwwSibling('www.example.net', names)).toBe(true)
    expect(isWwwSibling('example.net', names)).toBe(false)
    expect(isWwwSibling('www.other.net', names)).toBe(false)
  })
})

describe('nameState', () => {
  const site = (state: HostingCertificate['state'], extra: Record<string, unknown> = {}) =>
    ({ state, ...extra }) as unknown as HostingCertificate
  const pinned = (rows: TlsRecord[]) =>
    nameState({ certificate: 'letsencrypt_dns', tlsId: rows[0]!.id }, rows, null, 'en-US')

  it('says self-signed in words', () => {
    const state = nameState({ certificate: 'self_signed', tlsId: null }, [], null)
    expect(state.label).toBe('Self-Signed')
    expect(state.tone).toBe('muted')
  })

  it('reads a failed order, with the next attempt, and offers a retry for a panel order', () => {
    const state = pinned([
      row(
        't1',
        {
          stage: 'backoff',
          lastError: 'DNS timed out.',
          nextAttemptAt: NOW,
          challengeType: 'dns-01',
        },
        'failed'
      ),
    ])
    expect(state.label).toBe('Failed')
    expect(state.tone).toBe('danger')
    expect(state.detail).toContain('DNS timed out.')
    expect(state.detail).toContain('Trying again')
    expect(state.canRetry).toBe(true)
    expect(state.retryTlsId).toBe('t1')
  })

  it('does not offer a retry for an uploaded row, even one the panel orders', () => {
    const state = pinned([
      row(
        't9',
        { stage: 'backoff', lastError: 'x', managedBy: 'panel' },
        'failed',
        undefined,
        'upload'
      ),
    ])
    expect(state.canRetry).toBe(false)
  })

  it('does not offer a retry for an HTTP order', () => {
    const state = nameState(
      { certificate: 'letsencrypt_http', tlsId: 't2' },
      [row('t2', { stage: 'backoff', lastError: 'x', challengeType: 'http-01' }, 'failed')],
      null
    )
    expect(state.canRetry).toBe(false)
    expect(state.retryTlsId).toBeNull()
  })

  it('reads waiting and open orders', () => {
    expect(
      pinned([row('t3', { stage: 'waiting', warning: 'Needs a server.' }, 'pending')]).detail
    ).toBe('Needs a server.')
    expect(pinned([row('t3', { stage: 'waiting' }, 'pending')]).detail).toBe(
      'Waiting for a server to serve this name.'
    )
    expect(pinned([row('t4', { stage: 'ordering' }, 'pending')]).label).toBe('Order Open')
    expect(pinned([row('t5', {}, 'automatic')]).label).toBe('Waiting')
  })

  it('reads ready and expired rows', () => {
    expect(pinned([row('t6', { notAfter: NOW }, 'automatic')]).label).toBe('Ready')
    expect(pinned([row('t7', undefined, 'ready')]).label).toBe('Ready')
    const expired = pinned([row('t8', { lastError: 'Gone.', challengeType: 'dns-01' }, 'expired')])
    expect(expired.label).toBe('Expired')
    expect(expired.canRetry).toBe(true)
  })

  it('says a library certificate that left the library is missing', () => {
    expect(nameState({ certificate: 'library', tlsId: 'gone' }, [], null).label).toBe('Missing')
  })

  it('falls back to the site certificate for a name with no library row', () => {
    const state = (c: HostingCertificate | null) =>
      nameState({ certificate: 'letsencrypt_http', tlsId: null }, [], c, 'en-US')
    expect(state(null).label).toBe('Waiting')
    expect(state(site('secure')).label).toBe('Ready')
    expect(state(site('uploaded')).label).toBe('Ready')
    expect(state(site('waiting_for_dns')).detail).toBe('The name does not point at the server yet.')
    expect(state(site('waiting_for_dns', { nextTryAt: NOW })).detail).toContain('Checked again')
    expect(state(site('issuing')).label).toBe('Order Open')
    expect(state(site('issuing', { serverProgress: 'waiting_for_deploy' })).detail).toBe(
      'Deploy the site to start the order.'
    )
    const failed = state(site('renewal_failed', { lastError: 'Nope.' }))
    expect(failed.label).toBe('Failed')
    expect(failed.detail).toBe('Nope.')
    expect(state(site('self_signed' as HostingCertificate['state'])).label).toBe('Test Certificate')
  })
})

describe('retryWaitMessage', () => {
  it('says when to try again after a rate limit, and nothing for other errors', () => {
    expect(retryWaitMessage(new DnsCertificateRateLimitedError(NOW), 'en-US')).toContain(
      'Try again after'
    )
    expect(retryWaitMessage(new DnsCertificateRateLimitedError(null))).toBe(
      'The certificate authority asked for a wait. Try again later.'
    )
    expect(retryWaitMessage(new Error('boom'))).toBeNull()
  })
})

describe('names that already have an issued certificate', () => {
  const origin = name('a.example.net', 'cloudflare_origin', 'origin-1', [
    opt('self_signed'),
    opt('cloudflare_origin'),
  ])
  const letsEncrypt = name('b.example.net', 'letsencrypt_http', 'le-1')
  const names = [origin, letsEncrypt]

  it('reads a pinned origin or Let’s Encrypt name as that kind, not as an unknown value', () => {
    expect(optionValue(opt('cloudflare_origin', { tlsId: 'origin-1' }))).toBe('cloudflare_origin')
    expect(optionValue(opt('letsencrypt_http', { tlsId: 'le-1' }))).toBe('letsencrypt_http')
    expect(choiceFromValue('letsencrypt_http:le-1')).toEqual({
      certificate: 'letsencrypt_http',
      tlsId: null,
    })
    expect(currentChoice(origin, {})).toEqual({ certificate: 'cloudflare_origin', tlsId: null })
    expect(optionOf(letsEncrypt, currentChoice(letsEncrypt, {}))?.certificate).toBe(
      'letsencrypt_http'
    )
  })

  it('sends nothing when the same kind is picked again, so the issued certificate stays', () => {
    const edits = withNameChoice(names, {}, 'b.example.net', {
      certificate: 'letsencrypt_http',
      tlsId: null,
    })
    expect(edits).toEqual({})
    expect(nameChoicesToSend(names, edits)).toBeNull()
  })

  it('sends no tlsId when the kind changes, and the library pin when it is chosen', () => {
    const toSelf = withNameChoice(names, {}, 'a.example.net', {
      certificate: 'self_signed',
      tlsId: null,
    })
    expect(nameChoicesToSend(names, toSelf)).toEqual([
      { hostname: 'a.example.net', certificate: 'self_signed' },
    ])
    const toLibrary = withNameChoice(names, {}, 'b.example.net', {
      certificate: 'library',
      tlsId: 'lib-1',
    })
    expect(nameChoicesToSend(names, toLibrary)).toEqual([
      { hostname: 'b.example.net', certificate: 'library', tlsId: 'lib-1' },
    ])
  })

  it('counts two names of the same kind as the same, and different kinds as mixed', () => {
    const twoLe = [letsEncrypt, name('c.example.net', 'letsencrypt_http', 'le-2')]
    expect(hasMixedChoices(twoLe, {})).toBe(false)
    expect(sharedValue(twoLe, {})).toBe('letsencrypt_http')
    expect(hasMixedChoices(names, {})).toBe(true)
    expect(sharedValue(names, {})).toBe(MIXED_VALUE)
  })

  it('treats the shared Let’s Encrypt pick as unchanged for a name that already has it', () => {
    const edits = withSharedChoice(
      [letsEncrypt, name('c.example.net', 'self_signed')],
      {},
      { certificate: 'letsencrypt_http', tlsId: null }
    )
    expect(Object.keys(edits)).toEqual(['c.example.net'])
  })
})
