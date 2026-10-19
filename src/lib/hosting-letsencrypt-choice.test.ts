import { describe, expect, it } from 'vitest'
import { offersLetsEncrypt } from './hosting-letsencrypt-choice'

const base = { composeOwned: false, protocol: 'http', tlsId: null, hostnameCount: 1 } as const

describe('offersLetsEncrypt', () => {
  it('offers it for a web route the panel authors with a hostname and no picked certificate', () => {
    expect(offersLetsEncrypt(base)).toBe(true)
  })

  it.each([
    ['a compose-declared route', { composeOwned: true }],
    ['a tcp route', { protocol: 'tcp' }],
    ['a udp route', { protocol: 'udp' }],
    ['a picked certificate', { tlsId: 'tls-1' }],
    ['no hostname', { hostnameCount: 0 }],
  ] as const)('does not offer it for %s', (_name, patch) => {
    expect(offersLetsEncrypt({ ...base, ...patch })).toBe(false)
  })
})
