import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usesSameOriginApi } from '@/lib/control-plane'
import { base64urlToBytes, bytesToBase64url } from './base64url'
import {
  isPasskeySupported,
  loginWithPasskey,
  registerPasskey,
  serializeAssertion,
  serializeAttestation,
  toCreationOptions,
  toRequestOptions,
} from './passkey-client.web'

vi.mock('@/lib/control-plane', () => ({
  usesSameOriginApi: vi.fn(() => true),
}))

const create = vi.fn()
const get = vi.fn()

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

/** Minimal stand-in for the browser globals WebAuthn is gated on. */
function stubBrowser(): void {
  vi.stubGlobal('window', { PublicKeyCredential: class {} })
  vi.stubGlobal('navigator', { credentials: { create, get } })
}

const REGISTER_OPTIONS = {
  rp: { id: 'panel.example.com', name: 'TurboPanel' },
  user: { id: 'dXNlci0x', name: 'admin@example.com', displayName: 'admin' },
  challenge: 'Y2hhbGxlbmdl',
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  excludeCredentials: [{ type: 'public-key', id: 'ZXhpc3Rpbmc' }],
}

const LOGIN_OPTIONS = {
  rpId: 'panel.example.com',
  challenge: 'Y2hhbGxlbmdl',
  allowCredentials: [{ type: 'public-key', id: 'a25vd24' }],
  userVerification: 'preferred',
}

function attestationCredential(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'Y3JlZC1pZA',
    rawId: bytes(1, 2, 3).buffer,
    type: 'public-key',
    response: {
      clientDataJSON: bytes(4, 5, 6).buffer,
      attestationObject: bytes(7, 8, 9).buffer,
    },
    ...overrides,
  }
}

function assertionCredential(
  response: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'Y3JlZC1pZA',
    rawId: bytes(1, 2, 3).buffer,
    type: 'public-key',
    response: {
      clientDataJSON: bytes(4, 5, 6).buffer,
      authenticatorData: bytes(7, 8, 9).buffer,
      signature: bytes(10, 11, 12).buffer,
      userHandle: null,
      ...response,
    },
  }
}

beforeEach(() => {
  vi.mocked(usesSameOriginApi).mockReturnValue(true)
  stubBrowser()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('isPasskeySupported', () => {
  it('is true for a same-origin browser with WebAuthn', () => {
    expect(isPasskeySupported()).toBe(true)
  })

  it('is false when the control plane is a different origin', () => {
    vi.mocked(usesSameOriginApi).mockReturnValue(false)
    expect(isPasskeySupported()).toBe(false)
  })

  it('is false without a window', () => {
    vi.stubGlobal('window', undefined)
    expect(isPasskeySupported()).toBe(false)
  })

  it('is false in a browser without WebAuthn', () => {
    vi.stubGlobal('window', {})
    expect(isPasskeySupported()).toBe(false)
  })
})

describe('toCreationOptions', () => {
  it('decodes the challenge and user handle to binary', () => {
    const options = toCreationOptions(REGISTER_OPTIONS)
    expect(options.challenge).toBeInstanceOf(Uint8Array)
    expect(bytesToBase64url(options.challenge as Uint8Array)).toBe('Y2hhbGxlbmdl')
    const user = options.user as { id: Uint8Array; name: string }
    expect(bytesToBase64url(user.id)).toBe('dXNlci0x')
    expect(user.name).toBe('admin@example.com')
  })

  it('decodes excluded credential ids and keeps their other fields', () => {
    const options = toCreationOptions(REGISTER_OPTIONS)
    const excluded = options.excludeCredentials as {
      type: string
      id: Uint8Array
    }[]
    expect(excluded[0]?.type).toBe('public-key')
    expect(bytesToBase64url(excluded[0]!.id)).toBe('ZXhpc3Rpbmc')
  })

  it('passes other fields through untouched', () => {
    const options = toCreationOptions(REGISTER_OPTIONS)
    expect(options.rp).toEqual(REGISTER_OPTIONS.rp)
    expect(options.pubKeyCredParams).toEqual(REGISTER_OPTIONS.pubKeyCredParams)
  })

  it('omits excludeCredentials when the server sent none', () => {
    const { excludeCredentials: _omitted, ...withoutList } = REGISTER_OPTIONS
    expect('excludeCredentials' in toCreationOptions(withoutList)).toBe(false)
  })

  it('drops a null credential list rather than handing null to WebAuthn', () => {
    const options = toCreationOptions({
      ...REGISTER_OPTIONS,
      excludeCredentials: null,
    })
    expect('excludeCredentials' in options).toBe(false)
  })

  it('rejects a payload that is not an object', () => {
    expect(() => toCreationOptions('nope')).toThrow(TypeError)
    expect(() => toCreationOptions(null)).toThrow(TypeError)
    expect(() => toCreationOptions([])).toThrow(TypeError)
  })

  it('rejects a missing challenge', () => {
    expect(() =>
      toCreationOptions({ ...REGISTER_OPTIONS, challenge: '' }),
    ).toThrow(TypeError)
  })
})

describe('toRequestOptions', () => {
  it('decodes the challenge and allowed credential ids', () => {
    const options = toRequestOptions(LOGIN_OPTIONS)
    expect(bytesToBase64url(options.challenge as Uint8Array)).toBe('Y2hhbGxlbmdl')
    const allowed = options.allowCredentials as { id: Uint8Array }[]
    expect(bytesToBase64url(allowed[0]!.id)).toBe('a25vd24')
    expect(options.userVerification).toBe('preferred')
  })

  it('omits allowCredentials for a discoverable-credential ceremony', () => {
    const options = toRequestOptions({ challenge: 'Y2hhbGxlbmdl' })
    expect('allowCredentials' in options).toBe(false)
  })

  it('drops a null credential list rather than handing null to WebAuthn', () => {
    const options = toRequestOptions({
      ...LOGIN_OPTIONS,
      allowCredentials: null,
    })
    expect('allowCredentials' in options).toBe(false)
  })
})

describe('serializeAttestation', () => {
  it('re-encodes every binary field as base64url', () => {
    const json = serializeAttestation(attestationCredential())
    expect(json.id).toBe('Y3JlZC1pZA')
    expect(json.type).toBe('public-key')
    expect([...base64urlToBytes(json.rawId as string)]).toEqual([1, 2, 3])
    const response = json.response as Record<string, string>
    expect([...base64urlToBytes(response.clientDataJSON!)]).toEqual([4, 5, 6])
    expect([...base64urlToBytes(response.attestationObject!)]).toEqual([7, 8, 9])
  })

  it('includes transports when the authenticator reports them', () => {
    const credential = attestationCredential()
    const response = credential.response as Record<string, unknown>
    response.getTransports = () => ['internal', 'hybrid', 7]
    const json = serializeAttestation(credential)
    expect(json.transports).toEqual(['internal', 'hybrid'])
    expect((json.response as Record<string, unknown>).transports).toEqual([
      'internal',
      'hybrid',
    ])
  })

  it('omits transports when the call returns nothing usable', () => {
    const credential = attestationCredential()
    const response = credential.response as Record<string, unknown>
    response.getTransports = () => 'internal'
    expect(serializeAttestation(credential).transports).toBeUndefined()

    response.getTransports = () => []
    expect(serializeAttestation(credential).transports).toBeUndefined()
  })

  it('defaults the credential type when the browser omits it', () => {
    expect(serializeAttestation(attestationCredential({ type: '' })).type).toBe(
      'public-key',
    )
  })

  it('accepts a typed-array response as well as an ArrayBuffer', () => {
    const credential = attestationCredential({ rawId: bytes(1, 2, 3) })
    expect([
      ...base64urlToBytes(serializeAttestation(credential).rawId as string),
    ]).toEqual([1, 2, 3])
  })

  it('rejects a response field that is not binary', () => {
    expect(() =>
      serializeAttestation(attestationCredential({ rawId: 'not-binary' })),
    ).toThrow(TypeError)
  })
})

describe('serializeAssertion', () => {
  it('re-encodes the assertion response', () => {
    const json = serializeAssertion(assertionCredential())
    const response = json.response as Record<string, string | null>
    expect([...base64urlToBytes(response.authenticatorData!)]).toEqual([7, 8, 9])
    expect([...base64urlToBytes(response.signature!)]).toEqual([10, 11, 12])
    expect(response.userHandle).toBeNull()
  })

  it('encodes a present user handle', () => {
    const json = serializeAssertion(
      assertionCredential({ userHandle: bytes(13, 14).buffer }),
    )
    const response = json.response as Record<string, string>
    expect([...base64urlToBytes(response.userHandle!)]).toEqual([13, 14])
  })

  it('normalizes an absent user handle to null', () => {
    const json = serializeAssertion(
      assertionCredential({ userHandle: undefined }),
    )
    expect((json.response as Record<string, unknown>).userHandle).toBeNull()
  })
})

describe('registerPasskey', () => {
  it('drives navigator.credentials.create and returns encoded JSON', async () => {
    create.mockResolvedValue(attestationCredential())

    const result = await registerPasskey(REGISTER_OPTIONS)

    expect(result.supported).toBe(true)
    const request = create.mock.calls[0]?.[0] as {
      publicKey: Record<string, unknown>
    }
    expect(request.publicKey.challenge).toBeInstanceOf(Uint8Array)
    if (!result.supported) throw new TypeError('expected a supported result')
    const credential = result.credential as Record<string, unknown>
    expect(credential.id).toBe('Y3JlZC1pZA')
  })

  it('reports unsupported instead of calling WebAuthn off-origin', async () => {
    vi.mocked(usesSameOriginApi).mockReturnValue(false)
    expect(await registerPasskey(REGISTER_OPTIONS)).toEqual({ supported: false })
    expect(create).not.toHaveBeenCalled()
  })

  it('reports unsupported when the browser exposes no credentials container', async () => {
    vi.stubGlobal('navigator', {})
    expect(await registerPasskey(REGISTER_OPTIONS)).toEqual({ supported: false })
  })

  it('throws when the operator dismisses the prompt', async () => {
    create.mockResolvedValue(null)
    await expect(registerPasskey(REGISTER_OPTIONS)).rejects.toThrow(
      'Passkey registration was cancelled.',
    )
  })
})

describe('loginWithPasskey', () => {
  it('drives navigator.credentials.get and returns encoded JSON', async () => {
    get.mockResolvedValue(assertionCredential())

    const result = await loginWithPasskey(LOGIN_OPTIONS)

    expect(result.supported).toBe(true)
    const request = get.mock.calls[0]?.[0] as {
      publicKey: Record<string, unknown>
    }
    expect(request.publicKey.challenge).toBeInstanceOf(Uint8Array)
    if (!result.supported) throw new TypeError('expected a supported result')
    const credential = result.credential as { response: Record<string, string> }
    expect([
      ...base64urlToBytes(credential.response.signature!),
    ]).toEqual([10, 11, 12])
  })

  it('reports unsupported off-origin', async () => {
    vi.mocked(usesSameOriginApi).mockReturnValue(false)
    expect(await loginWithPasskey(LOGIN_OPTIONS)).toEqual({ supported: false })
    expect(get).not.toHaveBeenCalled()
  })

  it('throws when the operator dismisses the prompt', async () => {
    get.mockResolvedValue(null)
    await expect(loginWithPasskey(LOGIN_OPTIONS)).rejects.toThrow(
      'Passkey sign-in was cancelled.',
    )
  })
})
