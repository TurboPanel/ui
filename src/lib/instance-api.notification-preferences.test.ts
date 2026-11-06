import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  applyNotificationPreset,
  deleteNotificationPreference,
  fetchEffectiveNotificationLevels,
  fetchNotificationPreferences,
  postNotificationUnsubscribe,
  putNotificationPreference,
  updateNotificationSettings,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const ORG = '00000000-0000-4000-8000-000000000001'
const PROJECT = '00000000-0000-4000-8000-0000000000a1'

describe('notification preference wrappers', () => {
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

  it('reads the global rows with no query, and one organization by query', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ rows: [] })))
    await fetchNotificationPreferences()
    await fetchNotificationPreferences({ organizationId: ORG, projectId: PROJECT })
    expect(urlOf(0)).toMatch(/\/api\/client\/v1\/notification-preferences$/)
    expect(urlOf(1)).toContain(
      `/notification-preferences?organizationId=${ORG}&projectId=${PROJECT}`
    )
  })

  it('reads effective levels at a scope and subject', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ effective: { inbox: { level: 'all', source: 'global', sourceId: 'r' } } })
    )
    const effective = await fetchEffectiveNotificationLevels(
      { organizationId: ORG },
      { categoryCode: 'servers' }
    )
    expect(urlOf(0)).toContain(
      `/notification-preferences/effective?organizationId=${ORG}&categoryCode=servers`
    )
    expect(effective.inbox.level).toBe('all')
  })

  it('writes, deletes, applies a preset and sets the administrator switch', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true, id: 'p-1', allOrganizations: true }))
    )
    await putNotificationPreference({ organizationId: ORG, kind: 'email', level: 'warning' })
    await deleteNotificationPreference('p/1')
    await applyNotificationPreset(null, 'recommended')
    await updateNotificationSettings(true)
    expect(initOf(0)?.method).toBe('PUT')
    expect(JSON.parse(String(initOf(0)?.body))).toEqual({
      organizationId: ORG,
      kind: 'email',
      level: 'warning',
    })
    expect(urlOf(1)).toContain('/notification-preferences/p%2F1')
    expect(initOf(1)?.method).toBe('DELETE')
    expect(urlOf(2)).toContain('/notification-preferences/preset')
    expect(JSON.parse(String(initOf(2)?.body))).toEqual({
      organizationId: null,
      preset: 'recommended',
    })
    expect(urlOf(3)).toContain('/notification-settings')
    expect(JSON.parse(String(initOf(3)?.body))).toEqual({ allOrganizations: true })
  })

  it('unsubscribe: applied, not applied, expired, and other failures', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, organizationId: ORG, categoryCode: 'backups' })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: false }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: 'invalid_or_expired' }, 400))
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
    expect(await postNotificationUnsubscribe('t/1')).toEqual({
      ok: true,
      organizationId: ORG,
      categoryCode: 'backups',
    })
    expect(urlOf(0)).toContain('/notification-unsubscribe/t%2F1')
    expect(initOf(0)?.method).toBe('POST')
    expect(await postNotificationUnsubscribe('t')).toEqual({ ok: false, reason: 'not_applied' })
    expect(await postNotificationUnsubscribe('t')).toEqual({
      ok: false,
      reason: 'invalid_or_expired',
    })
    await expect(postNotificationUnsubscribe('t')).rejects.toThrow(/HTTP 500/)
  })
})
