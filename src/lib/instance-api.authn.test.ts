import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  deletePasskey,
  disableTwoFactor,
  enrollTotp,
  fetchTwoFactorStatus,
  isTwoFactorChallenge,
  oauthStartUrl,
  passkeyLoginOptions,
  passkeyLoginVerify,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  regenerateBackupCodes,
  signIn,
  signUp,
  signInOAuthRedirect,
  signInTwoFactor,
  unlinkProvider,
  verifyTotp,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const fetchMock = vi.fn()

/** `[url, init]` of the nth fetch, typed for assertions. */
function callAt(index = 0): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[index] ?? []
  return { url: String(url), init: (init ?? {}) as RequestInit }
}

function bodyAt(index = 0): unknown {
  return JSON.parse(String(callAt(index).init.body))
}

function startQuery(url: string): URLSearchParams {
  return new URL(url, 'https://panel.test').searchParams
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setActiveOrganizationId(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  setActiveOrganizationId(null)
})

describe('signIn', () => {
  it('returns a session when no second factor is enrolled', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        userId: 'u1',
        email: 'ops@example.com',
        role: 'admin',
        is2faEnabled: false,
      }),
    )
    const result = await signIn('ops@example.com', 'secret')
    expect(isTwoFactorChallenge(result)).toBe(false)
    expect(result).toEqual({
      userId: 'u1',
      email: 'ops@example.com',
      role: 'admin',
      is2faEnabled: false,
    })
  })

  it('omits is2faEnabled when the control plane does not report it', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, userId: 'u1', email: null, role: null }),
    )
    const result = await signIn('ops@example.com', 'secret')
    expect('is2faEnabled' in result).toBe(false)
  })

  it('returns the challenge when a second factor is required', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, requires2fa: true, challenge: 'chal-1' }),
    )
    const result = await signIn('ops@example.com', 'secret')
    if (!isTwoFactorChallenge(result)) {
      throw new TypeError('expected a two-factor challenge')
    }
    expect(result.challenge).toBe('chal-1')
  })

  it('does not treat a session payload as a challenge without a challenge id', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, requires2fa: true, userId: 'u1' }),
    )
    const result = await signIn('ops@example.com', 'secret')
    expect(isTwoFactorChallenge(result)).toBe(false)
  })
})

describe('signUp', () => {
  it('posts email and password without invitationId when omitted', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(signUp('new@example.com', 'secret')).resolves.toEqual({ ok: true })
    expect(callAt().url).toContain('/api/client/v1/auth/sign-up')
    expect(bodyAt()).toEqual({ email: 'new@example.com', password: 'secret' })
  })

  it('includes invitationId when provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      signUp('new@example.com', 'secret', '11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual({ ok: true })
    expect(bodyAt()).toEqual({
      email: 'new@example.com',
      password: 'secret',
      invitationId: '11111111-1111-4111-8111-111111111111',
    })
  })
})

describe('signInTwoFactor', () => {
  it('posts an authenticator code with the challenge', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        userId: 'u1',
        email: 'ops@example.com',
        role: 'admin',
        is2faEnabled: true,
      }),
    )
    await expect(signInTwoFactor('chal-1', '123456')).resolves.toEqual({
      userId: 'u1',
      email: 'ops@example.com',
      role: 'admin',
      is2faEnabled: true,
    })
    expect(callAt().url).toContain('/api/client/v1/auth/sign-in/2fa')
    expect(callAt().init.method).toBe('POST')
    expect(bodyAt()).toEqual({ challenge: 'chal-1', code: '123456' })
  })

  it('posts a backup code under its own field', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, userId: 'u1' }))
    await signInTwoFactor('chal-1', 'abcd-efgh', 'backup')
    expect(bodyAt()).toEqual({ challenge: 'chal-1', backupCode: 'abcd-efgh' })
  })
})

describe('fetchTwoFactorStatus', () => {
  it('normalizes the projection', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        enabled: true,
        method: 'totp',
        backupCodesRemaining: 8,
        passkeys: [
          {
            id: 'pk-1',
            name: 'Laptop',
            createdAt: '2026-03-04T10:00:00.000Z',
            deviceType: 'multiDevice',
            isBackedUp: true,
          },
        ],
        linkedProviders: ['github', 'unknown'],
      }),
    )
    await expect(fetchTwoFactorStatus()).resolves.toEqual({
      enabled: true,
      method: 'totp',
      backupCodesRemaining: 8,
      passkeys: [
        {
          id: 'pk-1',
          name: 'Laptop',
          createdAt: '2026-03-04T10:00:00.000Z',
          deviceType: 'multiDevice',
          isBackedUp: true,
        },
      ],
      linkedProviders: ['github'],
    })
    expect(callAt().url).toContain('/api/client/v1/auth/2fa')
  })

  it('fills in missing passkey device fields from older payloads', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        enabled: true,
        passkeys: [{ id: 'pk-1', createdAt: '2026-03-04T10:00:00.000Z' }],
      }),
    )
    await expect(fetchTwoFactorStatus()).resolves.toEqual({
      enabled: true,
      method: null,
      backupCodesRemaining: 0,
      passkeys: [
        {
          id: 'pk-1',
          name: null,
          createdAt: '2026-03-04T10:00:00.000Z',
          deviceType: null,
          isBackedUp: false,
        },
      ],
      linkedProviders: [],
    })
  })

  it('reads an unenrolled account as disabled with no passkeys', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(fetchTwoFactorStatus()).resolves.toEqual({
      enabled: false,
      method: null,
      backupCodesRemaining: 0,
      passkeys: [],
      linkedProviders: [],
    })
  })

  it('survives a malformed passkey row rather than throwing', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, enabled: true, method: 'sms', passkeys: [null] }),
    )
    const status = await fetchTwoFactorStatus()
    expect(status.method).toBeNull()
    expect(status.passkeys).toEqual([
      {
        id: '',
        name: null,
        createdAt: '',
        deviceType: null,
        isBackedUp: false,
      },
    ])
  })
})

describe('totp enrollment', () => {
  it('starts enrollment without a password', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, secret: 'JBSWY3DP', otpauthUri: 'otpauth://x' }),
    )
    await expect(enrollTotp()).resolves.toEqual({
      ok: true,
      secret: 'JBSWY3DP',
      otpauthUri: 'otpauth://x',
    })
    expect(callAt().url).toContain('/api/client/v1/auth/2fa/totp/enroll')
    expect(bodyAt()).toEqual({})
  })

  it('carries a step-up password when one was typed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await enrollTotp('hunter2')
    expect(bodyAt()).toEqual({ password: 'hunter2' })
  })

  it('verifies the first code and returns backup codes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, backupCodes: ['aaaa-bbbb'] }),
    )
    const result = await verifyTotp('123456')
    expect(result.backupCodes).toEqual(['aaaa-bbbb'])
    expect(callAt().url).toContain('/api/client/v1/auth/2fa/totp/verify')
    expect(bodyAt()).toEqual({ code: '123456' })
  })
})

describe('backup codes and disable', () => {
  it('regenerates backup codes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, backupCodes: ['cccc-dddd'] }),
    )
    await regenerateBackupCodes('hunter2')
    expect(callAt().url).toContain(
      '/api/client/v1/auth/2fa/backup-codes/regenerate',
    )
    expect(bodyAt()).toEqual({ password: 'hunter2' })
  })

  it('regenerates without a password when the session is fresh', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, backupCodes: [] }))
    await regenerateBackupCodes()
    expect(bodyAt()).toEqual({})
  })

  it('disables with whichever proof the operator supplied', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await disableTwoFactor('hunter2', '123456')
    expect(callAt().url).toContain('/api/client/v1/auth/2fa/disable')
    expect(bodyAt()).toEqual({ password: 'hunter2', code: '123456' })
  })

  it('omits both proofs when neither was supplied', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await disableTwoFactor()
    expect(bodyAt()).toEqual({})
  })
})

describe('passkey registration', () => {
  it('requests ceremony options', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, challenge: 'chal-1', options: { rpId: 'x' } }),
    )
    const result = await passkeyRegisterOptions('hunter2')
    expect(result.challenge).toBe('chal-1')
    expect(callAt().url).toContain(
      '/api/client/v1/auth/passkeys/register/options',
    )
    expect(bodyAt()).toEqual({ password: 'hunter2' })
  })

  it('requests ceremony options without a password', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, challenge: 'chal-1', options: {} }),
    )
    await passkeyRegisterOptions()
    expect(bodyAt()).toEqual({})
  })

  it('verifies the attestation with its name', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'pk-1' }))
    await expect(
      passkeyRegisterVerify('chal-1', 'Laptop', { id: 'cred' }),
    ).resolves.toEqual({ ok: true, id: 'pk-1' })
    expect(callAt().url).toContain(
      '/api/client/v1/auth/passkeys/register/verify',
    )
    expect(bodyAt()).toEqual({
      challenge: 'chal-1',
      name: 'Laptop',
      credential: { id: 'cred' },
    })
  })
})

describe('oauth helpers', () => {
  it('oauthStartUrl builds a start path without fetching', () => {
    expect(oauthStartUrl('github')).toContain(
      '/api/client/v1/auth/oauth/github/start',
    )
    expect(oauthStartUrl('google', { link: true, redirectTo: '/account/security' })).toContain(
      'link=1',
    )
    expect(
      startQuery(oauthStartUrl('google', { redirectTo: '/account/security' })).get(
        'redirectTo',
      ),
    ).toBe('/account/security')
    expect(
      startQuery(
        oauthStartUrl('github', { redirectTo: '/sign-in?next=/welcome' }),
      ).get('redirectTo'),
    ).toBe('/sign-in?next=/welcome')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signInOAuthRedirect keeps the current sign-in route and leftover query', () => {
    expect(signInOAuthRedirect('/sign-in')).toBe('/sign-in')
    expect(signInOAuthRedirect('sign-in', { error: 'oauth_state_invalid' })).toBe(
      '/sign-in',
    )
    expect(signInOAuthRedirect('/sign-in', { challenge: 'chal-1' })).toBe(
      '/sign-in',
    )
    const currentRedirect = signInOAuthRedirect('/sign-in', {
      next: '/welcome',
      error: 'oauth_exchange_failed',
    })
    expect(currentRedirect).toBe('/sign-in?next=%2Fwelcome')
    expect(
      startQuery(oauthStartUrl('google', { redirectTo: currentRedirect })).get(
        'redirectTo',
      ),
    ).toBe(currentRedirect)
  })

  it('unlinkProvider deletes with an optional step-up password', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await unlinkProvider('github', 'hunter2')
    expect(callAt().url).toContain('/api/client/v1/auth/oauth/github')
    expect(callAt().init.method).toBe('DELETE')
    expect(bodyAt()).toEqual({ password: 'hunter2' })
  })

  it('unlinkProvider omits the password when the session is fresh', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await unlinkProvider('google')
    expect(bodyAt()).toEqual({})
  })
})

describe('deletePasskey', () => {
  it('deletes by id and escapes it into the path', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await deletePasskey('pk/1', 'hunter2')
    expect(callAt().url).toContain('/api/client/v1/auth/passkeys/pk%2F1')
    expect(callAt().init.method).toBe('DELETE')
    expect(bodyAt()).toEqual({ password: 'hunter2' })
  })
})

describe('passkey login', () => {
  it('starts the public ceremony', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, challenge: 'chal-1', options: {} }),
    )
    await passkeyLoginOptions()
    expect(callAt().url).toContain('/api/client/v1/auth/passkeys/login/options')
    expect(callAt().init.method).toBe('POST')
    expect(bodyAt()).toEqual({})
  })

  it('exchanges the assertion for a session', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        userId: 'u1',
        email: 'ops@example.com',
        role: 'admin',
        is2faEnabled: true,
      }),
    )
    await expect(
      passkeyLoginVerify('chal-1', { id: 'cred' }),
    ).resolves.toEqual({
      userId: 'u1',
      email: 'ops@example.com',
      role: 'admin',
      is2faEnabled: true,
    })
    expect(callAt().url).toContain('/api/client/v1/auth/passkeys/login/verify')
    expect(bodyAt()).toEqual({ challenge: 'chal-1', credential: { id: 'cred' } })
  })
})
