import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOrgReauthSettings, saveOrgReauthSettings, submitReauth } from './instance-api'
import {
  canSubmitStepUp,
  createStepUpBroker,
  fetchWithStepUp,
  parseStepUpChallenge,
  reauthFailureMessage,
  stepUpActionLabel,
  stepUpMethodToAsk,
  stepUpRequestBody,
  type StepUpChallenge,
} from './step-up'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const refusal = (methods: unknown = ['password']) =>
  jsonResponse({ ok: false, error: 'reauth_required', action: 'project.delete', methods }, 403)

describe('parseStepUpChallenge', () => {
  it('reads the reauth_required refusal', () => {
    expect(
      parseStepUpChallenge(403, {
        error: 'reauth_required',
        action: 'member.remove',
        methods: ['totp'],
      })
    ).toEqual({ action: 'member.remove', methods: ['totp'] })
  })

  it('is null for anything else, so a plain 403 never opens the prompt', () => {
    expect(parseStepUpChallenge(403, { error: 'Forbidden' })).toBeNull()
    expect(parseStepUpChallenge(401, { error: 'reauth_required' })).toBeNull()
    expect(parseStepUpChallenge(403, null)).toBeNull()
    expect(parseStepUpChallenge(403, 'reauth_required')).toBeNull()
  })

  it('drops unknown methods and falls back to the password', () => {
    expect(parseStepUpChallenge(403, { error: 'reauth_required', methods: ['fax'] })).toEqual({
      action: null,
      methods: ['password'],
    })
    expect(parseStepUpChallenge(403, { error: 'reauth_required', methods: ['signin', 7] })).toEqual(
      {
        action: null,
        methods: ['signin'],
      }
    )
  })
})

describe('step-up copy and input', () => {
  it('names the action in app vocabulary and has a fallback', () => {
    expect(stepUpActionLabel('project.delete')).toBe('delete this project')
    expect(stepUpActionLabel('nothing.known')).toBe('do this')
    expect(stepUpActionLabel(null)).toBe('do this')
  })

  it('asks for the authenticator code first, then the password, else sign-in', () => {
    expect(stepUpMethodToAsk(['password', 'totp'])).toBe('totp')
    expect(stepUpMethodToAsk(['password'])).toBe('password')
    expect(stepUpMethodToAsk(['signin'])).toBe('signin')
    expect(stepUpMethodToAsk([])).toBe('signin')
  })

  it('does not spend an attempt on an obvious typo', () => {
    expect(canSubmitStepUp('password', '')).toBe(false)
    expect(canSubmitStepUp('password', 'x')).toBe(true)
    expect(canSubmitStepUp('totp', '123')).toBe(false)
    expect(canSubmitStepUp('totp', '123 456')).toBe(true)
  })

  it('builds the request body for each proof', () => {
    expect(stepUpRequestBody('password', 'a b')).toEqual({ password: 'a b' })
    expect(stepUpRequestBody('totp', ' 123 456 ')).toEqual({ code: '123456' })
  })

  it('has a message for each way the endpoint refuses', () => {
    expect(reauthFailureMessage(429)).toContain('Too many attempts')
    expect(reauthFailureMessage(403)).toContain('did not match')
    expect(reauthFailureMessage(401)).toContain('signed out')
    expect(reauthFailureMessage(500)).toContain('Could not confirm')
  })
})

describe('createStepUpBroker', () => {
  const challenge: StepUpChallenge = { action: 'server.delete', methods: ['password'] }

  it('answers false at once when no sheet is mounted', async () => {
    await expect(createStepUpBroker().request(challenge)).resolves.toBe(false)
  })

  it('shows one prompt for parallel requests and shares the answer', async () => {
    const broker = createStepUpBroker()
    const seen: (StepUpChallenge | null)[] = []
    broker.subscribe((next) => seen.push(next))
    const first = broker.request(challenge)
    const second = broker.request(challenge)
    expect(seen).toEqual([challenge])
    broker.settle(true)
    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(seen).toEqual([challenge, null])
  })

  it('resolves false when the person gives up, and can prompt again after', async () => {
    const broker = createStepUpBroker()
    broker.subscribe(() => {})
    const first = broker.request(challenge)
    broker.settle(false)
    await expect(first).resolves.toBe(false)
    const again = broker.request(challenge)
    broker.settle(true)
    await expect(again).resolves.toBe(true)
  })

  it('settles a pending prompt as cancelled when the sheet unmounts', async () => {
    const broker = createStepUpBroker()
    const unsubscribe = broker.subscribe(() => {})
    const pending = broker.request(challenge)
    unsubscribe()
    await expect(pending).resolves.toBe(false)
  })
})

describe('fetchWithStepUp', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  function brokerAnswering(proved: boolean) {
    const broker = createStepUpBroker()
    broker.subscribe((next) => {
      if (next) queueMicrotask(() => broker.settle(proved))
    })
    return broker
  }

  it('passes ordinary responses through untouched', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const res = await fetchWithStepUp('/x', { method: 'DELETE' }, brokerAnswering(true))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves a plain permission refusal alone', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Forbidden' }, 403))
    const res = await fetchWithStepUp('/x', undefined, brokerAnswering(true))
    expect(res.status).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries the same request once after a proof', async () => {
    fetchMock.mockResolvedValueOnce(refusal()).mockResolvedValueOnce(jsonResponse({ ok: true }))
    const init = { method: 'DELETE', body: '{"a":1}' }
    const res = await fetchWithStepUp('/projects/1', init, brokerAnswering(true))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]).toEqual(['/projects/1', init])
  })

  it('hands back the original refusal, body intact, when the person cancels', async () => {
    fetchMock.mockResolvedValueOnce(refusal())
    const res = await fetchWithStepUp('/x', undefined, brokerAnswering(false))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('reauth_required')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not loop when the retry is refused again', async () => {
    fetchMock.mockResolvedValueOnce(refusal()).mockResolvedValueOnce(refusal())
    const res = await fetchWithStepUp('/x', undefined, brokerAnswering(true))
    expect(res.status).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives the refusal back when no sheet is mounted', async () => {
    fetchMock.mockResolvedValueOnce(refusal())
    const res = await fetchWithStepUp('/x', undefined, createStepUpBroker())
    expect(res.status).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks with the methods the server listed', async () => {
    fetchMock.mockResolvedValueOnce(refusal(['totp']))
    const broker = createStepUpBroker()
    const asked: (StepUpChallenge | null)[] = []
    broker.subscribe((next) => {
      asked.push(next)
      if (next) queueMicrotask(() => broker.settle(false))
    })
    await fetchWithStepUp('/x', undefined, broker)
    expect(asked[0]).toEqual({ action: 'project.delete', methods: ['totp'] })
  })
})

describe('reauth wrappers', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const urlOf = (i: number) => String(fetchMock.mock.calls[i]?.[0])
  const initOf = (i: number) => fetchMock.mock.calls[i]?.[1] as RequestInit | undefined

  it('submitReauth posts the proof to /auth/reauth', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, expiresAt: '2026-10-01T00:05:00.000Z' })
    )
    await expect(submitReauth({ code: '123456' })).resolves.toEqual({
      ok: true,
      expiresAt: '2026-10-01T00:05:00.000Z',
    })
    expect(urlOf(0)).toContain('/auth/reauth')
    expect(initOf(0)?.method).toBe('POST')
    expect(initOf(0)?.credentials).toBe('include')
    expect(JSON.parse(String(initOf(0)?.body))).toEqual({ code: '123456' })
  })

  it('submitReauth shows its own message for a wrong proof and never re-prompts', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'Reauthentication failed' }, 403)
    )
    await expect(submitReauth({ password: 'nope' })).rejects.toThrow('That did not match')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('submitReauth reports a throttled attempt', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: 'Too many requests' }, 429))
    await expect(submitReauth({ password: 'nope' })).rejects.toThrow('Too many attempts')
  })

  it('reads and saves the organization setting on the reauth-settings route', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ requireReauthForDestructive: false }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, requireReauthForDestructive: true }))
    await expect(fetchOrgReauthSettings('org-1')).resolves.toEqual({
      requireReauthForDestructive: false,
    })
    await saveOrgReauthSettings('org-1', { requireReauthForDestructive: true })
    expect(urlOf(0)).toContain('/organizations/org-1/reauth-settings')
    expect(urlOf(1)).toContain('/organizations/org-1/reauth-settings')
    expect(initOf(1)?.method).toBe('PUT')
    expect(JSON.parse(String(initOf(1)?.body))).toEqual({ requireReauthForDestructive: true })
  })
})
