import { describe, expect, it } from 'vitest'
import { bytesToBase64url } from '@/lib/base64url'
import type { PreparedKeysetStatement } from '@/lib/instance-api'
import {
  approvalFromAssertion,
  checkPreparedStatement,
  readStatementFacts,
  assertionRequestOptions,
  allowedForStep,
  assertionSteps,
  passkeyKindLabel,
  SECOND_PASSKEY_MISSING,
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

  it('an emergency revoke asks two different marked passkeys, one after the other', () => {
    const steps = assertionSteps(
      prepared({ kind: 'revoke', approvalsNeeded: 2, approverCredentialIds: ['m1', 'm2'] })
    )
    expect(steps).toEqual([
      { purpose: 'approve', allowCredentials: ['m1', 'm2'] },
      { purpose: 'approve', allowCredentials: ['m1', 'm2'] },
    ])
    // The second ceremony leaves out the passkey that answered first.
    expect(allowedForStep(steps[1]!, new Set(['m1']))).toEqual({
      purpose: 'approve',
      allowCredentials: ['m2'],
    })
    expect(() => allowedForStep(steps[1]!, new Set(['m1', 'm2']))).toThrow(SECOND_PASSKEY_MISSING)
    // A proof of possession is never narrowed.
    const proof = { purpose: 'possession', allowCredentials: ['n'] } as const
    expect(allowedForStep(proof, new Set(['n']))).toBe(proof)
  })

  it('an older control plane without approvalsNeeded gets one approval', () => {
    expect(assertionSteps(prepared({ kind: 'revoke', approverCredentialIds: ['m1'] }))).toEqual([
      { purpose: 'approve', allowCredentials: ['m1'] },
    ])
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

const encoder = new TextEncoder()
const digest = async (bytes: Uint8Array) =>
  bytesToBase64url(await crypto.subtle.digest('SHA-256', bytes as BufferSource))

/** Statement bytes as the control plane builds them, for a key made of `fill`. */
async function statementFor(
  kind: 'rotate' | 'revoke' | 'passkeys',
  over: Record<string, unknown> = {}
) {
  const oldPub = new Uint8Array(32).fill(1)
  const newPub = kind === 'passkeys' ? oldPub : new Uint8Array(32).fill(2)
  const oldFingerprint = await digest(oldPub)
  const newFingerprint = await digest(newPub)
  const text = JSON.stringify({
    type: 'tp-keyset',
    v: 1,
    keyset: 5,
    prev: oldFingerprint,
    kind,
    rpId: 'cp.example.com',
    current: { kid: newFingerprint, pub: bytesToBase64url(newPub) },
    passkeys: [],
    iat: 1,
    ...over,
  })
  const bytes = encoder.encode(text)
  return {
    statement: bytesToBase64url(bytes),
    challenge: await digest(bytes),
    oldFingerprint,
    newFingerprint,
    newKey: bytesToBase64url(newPub),
  }
}

describe('reading a prepared statement in the browser', () => {
  it('takes the challenge and the fingerprints from the bytes themselves', async () => {
    const built = await statementFor('rotate')
    expect(await readStatementFacts(built.statement)).toEqual({
      challenge: built.challenge,
      keyset: 5,
      kind: 'rotate',
      oldFingerprint: built.oldFingerprint,
      newFingerprint: built.newFingerprint,
      newKey: built.newKey,
    })
  })

  it('refuses bytes that are not a statement, or a key that does not match its fingerprint', async () => {
    await expect(readStatementFacts('not base64 !')).rejects.toThrow(TypeError)
    await expect(readStatementFacts(bytesToBase64url(encoder.encode('[]')))).rejects.toThrow(
      /could not be read/
    )
    await expect(
      readStatementFacts(bytesToBase64url(encoder.encode('{"keyset":"5"}')))
    ).rejects.toThrow(/could not be read/)
    const lying = await statementFor('rotate', {
      current: { kid: 'Z'.repeat(43), pub: bytesToBase64url(new Uint8Array(32).fill(2)) },
    })
    await expect(readStatementFacts(lying.statement)).rejects.toThrow(/could not be read/)
  })

  it('accepts a statement that is what was asked for and described', async () => {
    const built = await statementFor('rotate')
    const fromServer = prepared({ ...built, keyset: 5, kind: 'rotate' })
    const checked = await checkPreparedStatement(fromServer, { kind: 'rotate' })
    expect(checked.challenge).toBe(built.challenge)
    expect(checked.newFingerprint).toBe(built.newFingerprint)
    // The link from the rotation command names the same key.
    await expect(
      checkPreparedStatement(fromServer, { kind: 'rotate', newKey: built.newKey })
    ).resolves.toBeTruthy()
    const marks = await statementFor('passkeys')
    await expect(
      checkPreparedStatement(prepared({ ...marks, keyset: 5 }), { kind: 'passkeys', mark: ['p'] })
    ).resolves.toBeTruthy()
  })

  it('refuses a statement the control plane described differently from its bytes', async () => {
    const built = await statementFor('rotate')
    const honest = prepared({ ...built, keyset: 5, kind: 'rotate' })
    const lies: Partial<PreparedKeysetStatement>[] = [
      { newFingerprint: 'F'.repeat(43) },
      { oldFingerprint: 'F'.repeat(43) },
      { challenge: 'other' },
      { keyset: 6 },
      { kind: 'revoke' },
    ]
    for (const lie of lies) {
      await expect(
        checkPreparedStatement({ ...honest, ...lie }, { kind: 'rotate' })
      ).rejects.toThrow(/does not match/)
    }
    // Asked for a mark, got a key change.
    await expect(checkPreparedStatement(honest, { kind: 'passkeys' })).rejects.toThrow(
      /does not match/
    )
  })

  it('refuses a statement for another key than the one in the link', async () => {
    const built = await statementFor('rotate')
    await expect(
      checkPreparedStatement(prepared({ ...built, keyset: 5, kind: 'rotate' }), {
        kind: 'rotate',
        newKey: bytesToBase64url(new Uint8Array(32).fill(9)),
      })
    ).rejects.toThrow(/not for the key in your link/)
  })

  it('refuses a "passkeys" statement that changes the key', async () => {
    const built = await statementFor('rotate', { kind: 'passkeys' })
    await expect(
      checkPreparedStatement(prepared({ ...built, keyset: 5, kind: 'passkeys' }), {
        kind: 'passkeys',
      })
    ).rejects.toThrow(/does not match/)
  })
})
