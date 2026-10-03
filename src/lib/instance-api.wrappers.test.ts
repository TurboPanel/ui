import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  cancelUpgradeRun,
  checkUpgradeManifests,
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
  fetchUpgradeRun,
  fetchUpgradeServersPage,
  fetchUpgradeSettings,
  markNotificationsRead,
  requestInstanceUpdate,
  retryUpgradeStep,
  runUpgradePreflight,
  saveUpgradeSettings,
  startPlatformUpgradeRun,
  updateNotificationChannel,
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
    await fetchUpgradeRun('run/1')
    expect(urlOf(0)).toContain('/instance/updates/runs/run%2F1')

    await fetchUpgradeHistory()
    expect(urlOf(1)).toMatch(/\/instance\/updates\/history$/)
    await fetchUpgradeHistory({ offset: 8, limit: 4 })
    expect(urlOf(2)).toContain('/instance/updates/history?offset=8&limit=4')

    await fetchUpgradeServersPage()
    expect(urlOf(3)).toMatch(/\/instance\/updates\/servers$/)
    await fetchUpgradeServersPage({ offset: 0, limit: 25, status: 'needs_attention' })
    expect(urlOf(4)).toContain('/instance/updates/servers?offset=0&limit=25&status=needs_attention')
  })

  it('upgrade settings and run controls use their routes and methods', async () => {
    const settings = {
      autoUpdate: true,
      batch: { mode: 'count', value: 1 },
      maintenanceWindow: { enabled: false },
    }
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true, settings, runId: 'r-1' }))
    )

    await fetchUpgradeSettings()
    expect(urlOf(0)).toContain('/instance/updates/settings')

    await saveUpgradeSettings(settings as never)
    expect(urlOf(1)).toContain('/instance/updates/settings')
    expect(initOf(1)).toMatchObject({ method: 'PUT', body: JSON.stringify(settings) })

    await runUpgradePreflight()
    expect(urlOf(2)).toContain('/instance/updates/preflight')
    expect(initOf(2)).toMatchObject({ method: 'POST' })

    await startPlatformUpgradeRun()
    expect(initOf(3)).toMatchObject({ method: 'POST', body: '{}' })
    await startPlatformUpgradeRun('r-1')
    expect(initOf(4)).toMatchObject({ method: 'POST', body: JSON.stringify({ runId: 'r-1' }) })

    await checkUpgradeManifests()
    expect(urlOf(5)).toContain('/instance/updates/check')
    await retryUpgradeStep('step/9')
    expect(urlOf(6)).toContain('/instance/updates/steps/step%2F9/retry')
    await cancelUpgradeRun('run/2')
    expect(urlOf(7)).toContain('/instance/updates/runs/run%2F2/cancel')
    await requestInstanceUpdate()
    expect(urlOf(8)).toContain('/instance/updates/instance')
    for (const i of [5, 6, 7, 8]) expect(initOf(i)).toMatchObject({ method: 'POST' })
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
