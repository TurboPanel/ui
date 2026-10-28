import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  createNotificationChannel,
  deleteNotificationChannel,
  dismissNotification,
  fetchNotificationChannels,
  fetchNotificationEvents,
  fetchNotifications,
  fetchOrgComposeGatedFields,
  fetchOrgComposeRemoteBuildSources,
  saveOrgComposeRemoteBuildSources,
  fetchUnreadNotificationCount,
  fetchUpgradeHistory,
  fetchUpgradeRunServers,
  fetchUpgradeServersPage,
  fetchUpgradeSettings,
  checkForUpdates,
  markNotificationsRead,
  pauseUpdates,
  resumeUpdates,
  saveUpgradeSettings,
  updateNotificationChannel,
  UpdateCheckTooSoonError,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Thin fetch wrappers that no other suite drives: each one must hit its route
 * with the right method, query string and body, and unwrap the response the
 * way its callers expect.
 */
describe('instance-api upgrade, notification and compose-gated-field wrappers', () => {
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

  it('org compose-gated fields are read from the privileged-fields route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ composeGatedFieldsEnabled: true }))
    await expect(fetchOrgComposeGatedFields('org-1')).resolves.toEqual({
      composeGatedFieldsEnabled: true,
    })
    expect(urlOf(0)).toContain('/organizations/org-1/compose-privileged-fields')
  })

  it('org remote build sources read and write the compose-remote-build-sources route', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ composeRemoteBuildSourcesEnabled: false }))
    await expect(fetchOrgComposeRemoteBuildSources('org-1')).resolves.toEqual({
      composeRemoteBuildSourcesEnabled: false,
    })
    expect(urlOf(0)).toContain('/organizations/org-1/compose-remote-build-sources')

    fetchMock.mockResolvedValueOnce(jsonResponse({ composeRemoteBuildSourcesEnabled: true }))
    await saveOrgComposeRemoteBuildSources('org-1', { composeRemoteBuildSourcesEnabled: true })
    expect(initOf(1)?.method).toBe('PUT')
    expect(initOf(1)?.body).toBe(JSON.stringify({ composeRemoteBuildSourcesEnabled: true }))
  })

  it('upgrade reads build the query string only from the params given', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true, runs: [], servers: [], total: 0 }))
    )
    await fetchUpgradeHistory()
    expect(urlOf(0)).toMatch(/\/instance\/updates\/history$/)
    await fetchUpgradeHistory({ offset: 8, limit: 4 })
    expect(urlOf(1)).toContain('/instance/updates/history?offset=8&limit=4')

    await fetchUpgradeServersPage()
    expect(urlOf(2)).toMatch(/\/instance\/updates\/servers$/)
    await fetchUpgradeServersPage({ offset: 0, limit: 25, status: 'needs_attention' })
    expect(urlOf(3)).toContain('/instance/updates/servers?offset=0&limit=25&status=needs_attention')

    await fetchUpgradeHistory({ offset: 0, limit: 25, status: 'any', trigger: 'automatic' })
    expect(urlOf(4)).toContain(
      '/instance/updates/history?offset=0&limit=25&status=any&trigger=automatic'
    )
    await fetchUpgradeHistory({ offset: 0, limit: 25, status: '', trigger: '' })
    expect(urlOf(5)).toMatch(/\/instance\/updates\/history\?offset=0&limit=25$/)
  })

  it('a run server page sends only the filters that are set', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true, servers: [], total: 0 }))
    )
    await fetchUpgradeRunServers('run/1')
    expect(urlOf(0)).toMatch(/\/instance\/updates\/runs\/run%2F1\/servers$/)
    await fetchUpgradeRunServers('run-1', {
      offset: 50,
      limit: 50,
      sort: 'duration',
      dir: 'desc',
      status: 'failed',
      organizationId: 'org-1',
      q: '  web  ',
    })
    expect(urlOf(1)).toContain(
      '/instance/updates/runs/run-1/servers?offset=50&limit=50&sort=duration&dir=desc&status=failed&organizationId=org-1&q=web'
    )
    await fetchUpgradeRunServers('run-1', {
      serverId: 's-1',
      limit: 1,
      organizationId: null,
      q: '',
    })
    expect(urlOf(2)).toContain('/instance/updates/runs/run-1/servers?limit=1&serverId=s-1')
  })

  it('upgrade settings and the pause control use their routes and methods', async () => {
    const settings = { batch: { mode: 'count', value: 1 } }
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true, settings })))

    await fetchUpgradeSettings()
    expect(urlOf(0)).toContain('/instance/updates/settings')

    await saveUpgradeSettings(settings as never)
    expect(urlOf(1)).toContain('/instance/updates/settings')
    expect(initOf(1)).toMatchObject({ method: 'PUT', body: JSON.stringify(settings) })

    await pauseUpdates()
    expect(urlOf(2)).toMatch(/\/instance\/updates\/pause$/)
    await resumeUpdates()
    expect(urlOf(3)).toMatch(/\/instance\/updates\/resume$/)
    for (const i of [2, 3]) expect(initOf(i)).toMatchObject({ method: 'POST' })
  })

  it('Check Now posts only to the check route and answers the status body', async () => {
    const status = { ok: true, channel: 'release', automatic: true, units: {} }
    fetchMock.mockResolvedValueOnce(jsonResponse(status))
    await expect(checkForUpdates('abc')).resolves.toEqual(status)
    expect(urlOf(0)).toMatch(/\/instance\/updates\/check\?consoleCommit=abc$/)
    expect(initOf(0)).toMatchObject({ method: 'POST' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Check Now too soon names when to try again', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { ok: false, error: 'check_too_soon', retryAfterSeconds: 37, message: 'Too soon' },
        429
      )
    )
    const refused = await checkForUpdates().catch((err: unknown) => err)
    expect(refused).toBeInstanceOf(UpdateCheckTooSoonError)
    expect((refused as UpdateCheckTooSoonError).retryAfterSeconds).toBe(37)
    expect(urlOf(0)).toMatch(/\/instance\/updates\/check$/)

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: 'check_too_soon' }, 429))
    const noWait = await checkForUpdates().catch((err: unknown) => err)
    expect((noWait as UpdateCheckTooSoonError).retryAfterSeconds).toBe(60)
  })

  it('notification reads default missing fields and pass the paging params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    await expect(fetchNotifications()).resolves.toEqual({ notifications: [], unread: 0 })
    expect(urlOf(0)).toMatch(/\/notifications$/)

    fetchMock.mockResolvedValueOnce(jsonResponse({ notifications: [{ id: 'n1' }], unread: 3 }))
    await expect(fetchNotifications({ limit: 20, before: 'n9' })).resolves.toEqual({
      notifications: [{ id: 'n1' }],
      unread: 3,
    })
    expect(urlOf(1)).toContain('/notifications?limit=20&before=n9')

    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    await expect(fetchUnreadNotificationCount()).resolves.toBe(0)
    fetchMock.mockResolvedValueOnce(jsonResponse({ unread: 5 }))
    await expect(fetchUnreadNotificationCount()).resolves.toBe(5)
    expect(urlOf(3)).toContain('/notifications/unread-count')
  })

  it('notification writes send the ids or verb and unwrap the result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    await expect(markNotificationsRead()).resolves.toEqual({ updated: 0, unread: 0 })
    expect(initOf(0)).toMatchObject({ method: 'POST', body: JSON.stringify({ ids: [] }) })

    fetchMock.mockResolvedValueOnce(jsonResponse({ updated: 2, unread: 1 }))
    await expect(markNotificationsRead(['a', 'b'])).resolves.toEqual({ updated: 2, unread: 1 })
    expect(urlOf(1)).toContain('/notifications/read')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await dismissNotification('n/1')
    expect(urlOf(2)).toContain('/notifications/n%2F1')
    expect(initOf(2)).toMatchObject({ method: 'DELETE' })
  })

  it('notification events and channels default to empty and round-trip channel writes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    await expect(fetchNotificationEvents()).resolves.toEqual([])
    fetchMock.mockResolvedValueOnce(jsonResponse({ events: [{ id: 'e1' }] }))
    await expect(fetchNotificationEvents()).resolves.toEqual([{ id: 'e1' }])
    expect(urlOf(0)).toContain('/notification-events')

    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    await expect(fetchNotificationChannels('user')).resolves.toEqual([])
    fetchMock.mockResolvedValueOnce(jsonResponse({ channels: [{ id: 'c1' }] }))
    await expect(fetchNotificationChannels('organization', 'org-7')).resolves.toEqual([
      { id: 'c1' },
    ])
    expect(urlOf(2)).toContain('/notification-channels?scope=user')
    expect(urlOf(3)).toContain('/notification-channels?scope=organization')

    const body = {
      scope: 'user' as const,
      kind: 'email' as const,
      label: 'Ops',
      address: 'ops@example.test',
      rules: [{ event: 'server.offline', minSeverity: 'warning' as const }],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse({ channel: { id: 'c2' } }))
    await expect(createNotificationChannel(body as never)).resolves.toEqual({ id: 'c2' })
    expect(initOf(4)).toMatchObject({ method: 'POST', body: JSON.stringify(body) })

    fetchMock.mockResolvedValueOnce(jsonResponse({ channel: null }))
    await expect(updateNotificationChannel('c/2', { disabled: true })).resolves.toBeNull()
    expect(urlOf(5)).toContain('/notification-channels/c%2F2')
    expect(initOf(5)).toMatchObject({ method: 'PATCH', body: JSON.stringify({ disabled: true }) })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await deleteNotificationChannel('c/2')
    expect(urlOf(6)).toContain('/notification-channels/c%2F2')
    expect(initOf(6)).toMatchObject({ method: 'DELETE' })
  })
})
