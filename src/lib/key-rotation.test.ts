import { describe, expect, it } from 'vitest'
import type { PreparedKeysetStatement } from '@/lib/instance-api'
import {
  approvalFromAssertion,
  assertionRequestOptions,
  assertionSteps,
  passkeyKindLabel,
  rotationLinkRequest,
  statementKindLabel,
} from './key-rotation'

function prepared(over: Partial<PreparedKeysetStatement> = {}): PreparedKeysetStatement {
  return {
    ok: true,
    statement: 'ST',
    challenge: 'CH',
    rpId: 'cp.example.com',
    keyset: 2,
    kind: 'passkeys',
    oldFingerprint: 'O'.repeat(43),
    newFingerprint: 'O'.repeat(43),
    approverCredentialIds: [],
    possessionCredentialIds: [],
    ...over,
  }
}

describe('key rotation ceremonies', () => {
  it('the first marks need only proofs of possession', () => {
    expect(assertionSteps(prepared({ possessionCredentialIds: ['a', 'b'] }))).toEqual([
      { purpose: 'possession', allowCredentials: ['a'] },
      { purpose: 'possession', allowCredentials: ['b'] },
    ])
  })

  it('a later mark needs an approval from another marked passkey first', () => {
    expect(
      assertionSteps(
        prepared({ approverCredentialIds: ['m1', 'm2'], possessionCredentialIds: ['n'] })
      )
    ).toEqual([
      { purpose: 'approve', allowCredentials: ['m1', 'm2'] },
      { purpose: 'possession', allowCredentials: ['n'] },
    ])
  })

  it('a rotation needs one approval from any marked passkey', () => {
    const steps = assertionSteps(prepared({ kind: 'rotate', approverCredentialIds: ['m1', 'm2'] }))
    expect(steps).toEqual([{ purpose: 'approve', allowCredentials: ['m1', 'm2'] }])
    expect(assertionRequestOptions(prepared(), steps[0]!)).toEqual({
      challenge: 'CH',
      rpId: 'cp.example.com',
      allowCredentials: [
        { id: 'm1', type: 'public-key' },
        { id: 'm2', type: 'public-key' },
      ],
      userVerification: 'required',
      timeout: 300_000,
    })
  })

  it('an assertion becomes an approval, and an incomplete one is refused', () => {
    expect(
      approvalFromAssertion({
        rawId: 'cred',
        response: {
          authenticatorData: 'AD',
          clientDataJSON: 'CD',
          signature: 'SG',
          userHandle: null,
        },
      })
    ).toEqual({
      credentialId: 'cred',
      authenticatorData: 'AD',
      clientDataJSON: 'CD',
      signature: 'SG',
    })
    expect(() => approvalFromAssertion({ rawId: 'cred', response: {} })).toThrow(TypeError)
    expect(() => approvalFromAssertion(null)).toThrow(TypeError)
  })

  it('reads the rotation command link and ignores anything else', () => {
    const key = 'K'.repeat(43)
    expect(rotationLinkRequest({ rotate: key })).toEqual({ kind: 'rotate', newKey: key })
    expect(rotationLinkRequest({ revoke: key })).toEqual({ kind: 'revoke', newKey: key })
    expect(rotationLinkRequest({ rotate: 'short' })).toBeNull()
    expect(rotationLinkRequest({ rotate: [key] })).toBeNull()
    expect(rotationLinkRequest({})).toBeNull()
  })

  it('names kinds in book title case', () => {
    expect(statementKindLabel('rotate')).toBe('Key Rotated')
    expect(statementKindLabel('revoke')).toBe('Key Revoked')
    expect(statementKindLabel('passkeys')).toBe('Passkeys Changed')
    expect(passkeyKindLabel(true)).toBe('Device-Bound')
    expect(passkeyKindLabel(false)).toBe('Synced')
  })
})
