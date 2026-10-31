import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  AccountChoiceNeededError,
  addTunnelBadge,
  addTunnelBadgeZone,
  BadgeInUseError,
  removeTunnelBadgeZone,
  checkTunnelBadge,
  connectTunnelCarrier,
  deleteTunnelBadge,
  deleteTunnelCarrier,
  fetchTunnelCarriers,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance-api Cloudflare account wrappers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setActiveOrganizationId(null)
  })

  function lastCall(): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? []
    return { url: String(url), init: (init ?? {}) as RequestInit }
  }

  it('lists accounts with their tokens', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ carriers: [] }))
    await expect(fetchTunnelCarriers('org-1')).resolves.toEqual({ carriers: [] })
    expect(lastCall().url).toContain('/organizations/org-1/carriers')
  })

  it('connects with only the token and label', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ connected: [] }, 201))
    await connectTunnelCarrier('org-1', { label: 'Main', token: `cfat_${'x'.repeat(8)}` })
    const { url, init } = lastCall()
    expect(url).toContain('/organizations/org-1/carriers/connect')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      provider: 'cloudflare',
      label: 'Main',
      token: `cfat_${'x'.repeat(8)}`,
    })
  })

  it('sends the chosen accounts on the second try', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ connected: [] }, 201))
    await connectTunnelCarrier('org-1', {
      label: 'Main',
      token: `cfat_${'x'.repeat(8)}`,
      accountIds: ['a1'],
    })
    expect(JSON.parse(String(lastCall().init.body)).accountIds).toEqual(['a1'])
  })

  it('turns an account choice into a typed error carrying the accounts', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'account_choice_needed',
          accounts: [{ id: 'a1', name: 'One' }, { id: 7 }, null],
        },
        409
      )
    )
    const err = await connectTunnelCarrier('org-1', {
      label: 'Main',
      token: `cfat_${'x'.repeat(8)}`,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AccountChoiceNeededError)
    expect((err as AccountChoiceNeededError).accounts).toEqual([{ id: 'a1', name: 'One' }])
  })

  it('tolerates a choice reply with no account list', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'account_choice_needed' }, 409))
    const err = await connectTunnelCarrier('org-1', {
      label: 'M',
      token: `cfat_${'x'.repeat(8)}`,
    }).catch((e: unknown) => e)
    expect((err as AccountChoiceNeededError).accounts).toEqual([])
  })

  it('keeps the code and the panel sentence on other refusals', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'badge_not_useful', message: 'It needs: tunnels.' }, 400)
    )
    await expect(
      connectTunnelCarrier('org-1', { label: 'M', token: `cfat_${'x'.repeat(8)}` })
    ).rejects.toThrow(/HTTP 400: badge_not_useful/)
  })

  it('keeps the status when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }))
    await expect(
      connectTunnelCarrier('org-1', { label: 'M', token: `cfat_${'x'.repeat(8)}` })
    ).rejects.toThrow(/HTTP 500/)
  })

  it('adds, checks and removes tokens and removes accounts', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }))
    await addTunnelBadge('org-1', 'c1', { label: 'L', token: `cfat_${'x'.repeat(8)}` })
    expect(lastCall().url).toContain('/carriers/c1/badges')
    expect(lastCall().init.method).toBe('POST')
    await checkTunnelBadge('org-1', 'c1', 'b1')
    expect(lastCall().url).toContain('/carriers/c1/badges/b1/check')
    await deleteTunnelBadge('org-1', 'c1', 'b1')
    expect(lastCall().init.method).toBe('DELETE')
    expect(lastCall().url).toMatch(/\/carriers\/c1\/badges\/b1$/)
    await deleteTunnelCarrier('org-1', 'c1')
    expect(lastCall().url).toMatch(/\/carriers\/c1$/)
  })
  it('names a zone for a token and stops naming it', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ badge: {}, missing: [] }))
    await addTunnelBadgeZone('org-1', 'c1', 'b1', { id: 'z9', name: 'shop.example.org' })
    expect(lastCall().url).toContain('/carriers/c1/badges/b1/zones')
    expect(lastCall().init.method).toBe('POST')
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ id: 'z9', name: 'shop.example.org' })
    await removeTunnelBadgeZone('org-1', 'c1', 'b1', 'z 9')
    expect(lastCall().init.method).toBe('DELETE')
    expect(lastCall().url).toMatch(/\/badges\/b1\/zones\/z%209$/)
  })

  it('sends the zones named while adding a token', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ badge: {}, missing: [] }, 201))
    await addTunnelBadge('org-1', 'c1', {
      label: 'L',
      token: `cfat_${'x'.repeat(8)}`,
      zones: [{ id: 'z1' }],
    })
    expect(JSON.parse(String(lastCall().init.body)).zones).toEqual([{ id: 'z1' }])
  })

  it('carries what depends on a token when removing it is refused', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'badge_in_use',
          total: 2,
          dependents: [
            { kind: 'tunnel', id: 't1', name: 'web', zone: null },
            { kind: 'hostname', id: 'h1', name: 'blog.example.com', zone: 'example.com' },
            { kind: 'other', id: 'x', name: 'dropped' },
          ],
        },
        409
      )
    )
    const failure = await deleteTunnelBadge('org-1', 'c1', 'b1').catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(BadgeInUseError)
    const refused = failure as BadgeInUseError
    expect(refused.total).toBe(2)
    expect(refused.dependents.map((d) => d.name)).toEqual(['web', 'blog.example.com'])
    expect(refused.message).toMatch(/badge_in_use/)
  })

  it('keeps the usual message for any other refusal of a removal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404))
    await expect(deleteTunnelBadge('org-1', 'c1', 'b1')).rejects.toThrow(/HTTP 404/)
  })
})
