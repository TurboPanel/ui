import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  channelAwaitsConfirmation,
  channelErrorCopy,
  channelVerifiedBanner,
  confirmationSentCopy,
  addressHint,
} from '@/lib/notification-channels'
import { createNotificationChannel, resendNotificationChannelVerification } from './instance-api'
import { setActiveOrganizationId } from './org-context'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('email channel confirmation: the pure half', () => {
  it('only an unverified email channel awaits confirmation', () => {
    expect(channelAwaitsConfirmation({ kind: 'email', verifiedAt: null })).toBe(true)
    expect(channelAwaitsConfirmation({ kind: 'email', verifiedAt: '2026-10-01T00:00:00Z' })).toBe(
      false
    )
    expect(channelAwaitsConfirmation({ kind: 'slack', verifiedAt: null })).toBe(false)
    expect(channelAwaitsConfirmation({ kind: 'push', verifiedAt: null })).toBe(false)
  })

  it('the sent notice names the address and says nothing is sent yet', () => {
    const copy = confirmationSentCopy('pager@example.org')
    expect(copy).toContain('pager@example.org')
    expect(copy).toMatch(/Nothing is sent/)
  })

  it('the landing banner reads the redirect parameter', () => {
    expect(channelVerifiedBanner('1')?.tone).toBe('info')
    expect(channelVerifiedBanner(['1', 'x'])?.title).toBe('Address confirmed')
    expect(channelVerifiedBanner('0')?.tone).toBe('warning')
    expect(channelVerifiedBanner(undefined)).toBeNull()
    expect(channelVerifiedBanner('2')).toBeNull()
    expect(channelVerifiedBanner([])).toBeNull()
  })

  it('refusal codes from the new routes become sentences', () => {
    for (const code of ['email_unavailable', 'email_send_failed', 'too_soon', 'already_verified']) {
      const copy = channelErrorCopy(new Error(`Request failed: HTTP 503: ${code}`))
      expect(copy).not.toMatch(/HTTP/)
      expect(copy.length).toBeGreaterThan(20)
    }
  })

  it('the email hint no longer claims only known addresses are accepted', () => {
    expect(addressHint('email')).toMatch(/confirmation link/)
    expect(addressHint('email')).not.toMatch(/Your own address for a personal channel/)
  })
})

describe('email channel confirmation: the control-plane calls', () => {
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

  const urlOf = (i: number) => String(fetchMock.mock.calls[i]?.[0])
  const initOf = (i: number) => fetchMock.mock.calls[i]?.[1] as RequestInit | undefined

  it('an email channel is created through the verification route, other kinds through the plain one', async () => {
    const email = {
      scope: 'user' as const,
      kind: 'email' as const,
      label: 'Pager',
      address: 'pager@example.org',
      rules: [{ event: '*', minSeverity: 'warning' as const }],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse({ channel: { id: 'c1', verifiedAt: null } }, 201))
    await expect(createNotificationChannel(email)).resolves.toEqual({ id: 'c1', verifiedAt: null })
    expect(urlOf(0)).toMatch(/\/notification-channels\/email$/)
    expect(initOf(0)).toMatchObject({ method: 'POST', body: JSON.stringify(email) })

    const slack = { ...email, kind: 'slack' as const, address: 'https://hooks.slack.com/x' }
    fetchMock.mockResolvedValueOnce(jsonResponse({ channel: { id: 'c2' } }, 201))
    await createNotificationChannel(slack)
    expect(urlOf(1)).toMatch(/\/notification-channels$/)
  })

  it('resending posts to the channel verify route, scoped to the organization when given', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await resendNotificationChannelVerification('c/1', 'org-9')
    expect(urlOf(0)).toMatch(/\/notification-channels\/c%2F1\/verify$/)
    expect(initOf(0)).toMatchObject({ method: 'POST' })
  })

  it('a refused resend surfaces the refusal code for the copy map', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'too_soon', retryAfterSeconds: 40 }, 429))
    await expect(resendNotificationChannelVerification('c1')).rejects.toThrow(/too_soon/)
  })
})
