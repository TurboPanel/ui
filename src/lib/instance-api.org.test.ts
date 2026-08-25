import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  configureProject,
  fetchOrgDefaultEnvironment,
  fetchOrgDefaultTimezone,
  fetchOrgManagedDefaults,
  fetchOrgServerCapacity,
  fetchServerLabels,
  fetchVisibleTeams,
  saveOrgDefaultEnvironment,
  saveOrgDefaultTimezone,
  saveOrgManagedDefaults,
  saveOrgServerCapacity,
  saveServerLabels,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance-api org wrappers', () => {
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

  it('fetchServerLabels and saveServerLabels proxy server label routes', async () => {
    const labels = [{ key: 'role', value: 'database' }]

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, labels }))
    await expect(fetchServerLabels('srv-1')).resolves.toEqual(labels)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/client/v1/servers/srv-1/labels',
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, labels }))
    await expect(
      saveServerLabels('srv-1', { role: 'database' }),
    ).resolves.toEqual(labels)
    const [, saveInit] = fetchMock.mock.calls[1] ?? []
    expect((saveInit as RequestInit).method).toBe('PUT')
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      '/api/client/v1/servers/srv-1/labels',
    )
    expect(JSON.parse(String((saveInit as RequestInit).body))).toEqual({
      labels: { role: 'database' },
    })
  })

  it('fetchOrgDefaultTimezone and saveOrgDefaultTimezone proxy org timezone routes', async () => {
    const settings = {
      defaultServerTimezone: 'America/Chicago',
      enforceServerTimezone: true,
    }

    fetchMock.mockResolvedValueOnce(jsonResponse(settings))
    await expect(fetchOrgDefaultTimezone('org-1')).resolves.toEqual(settings)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/client/v1/organizations/org-1/default-timezone',
    )

    fetchMock.mockResolvedValueOnce(jsonResponse(settings))
    await expect(
      saveOrgDefaultTimezone('org-1', { enforceServerTimezone: false }),
    ).resolves.toEqual(settings)
    const [, saveInit] = fetchMock.mock.calls[1] ?? []
    expect((saveInit as RequestInit).method).toBe('PUT')
    expect(JSON.parse(String((saveInit as RequestInit).body))).toEqual({
      enforceServerTimezone: false,
    })
  })

  it('fetchOrgServerCapacity and saveOrgServerCapacity proxy org seat routes', async () => {
    const capacity = {
      maxServers: 10,
      serverCount: 3,
      reservedSeatCount: 1,
      usedSeats: 4,
      availableSeats: 6,
    }

    fetchMock.mockResolvedValueOnce(jsonResponse(capacity))
    await expect(fetchOrgServerCapacity('org-1')).resolves.toEqual(capacity)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/client/v1/organizations/org-1/server-capacity',
    )

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, ...capacity, maxServers: null }))
    await expect(saveOrgServerCapacity('org-1', null)).resolves.toMatchObject({
      ok: true,
      maxServers: null,
      availableSeats: 6,
    })
    const [, saveInit] = fetchMock.mock.calls[1] ?? []
    expect((saveInit as RequestInit).method).toBe('PUT')
    expect(JSON.parse(String((saveInit as RequestInit).body))).toEqual({
      maxServers: null,
    })
  })

  it('fetchOrgDefaultEnvironment and saveOrgDefaultEnvironment proxy scaffold routes', async () => {
    const settings = { defaultEnvironmentName: 'Production' }

    fetchMock.mockResolvedValueOnce(jsonResponse(settings))
    await expect(fetchOrgDefaultEnvironment('org-1')).resolves.toEqual(settings)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/client/v1/organizations/org-1/default-environment',
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, defaultEnvironmentName: 'Staging' }),
    )
    await expect(
      saveOrgDefaultEnvironment('org-1', 'Staging'),
    ).resolves.toEqual({ ok: true, defaultEnvironmentName: 'Staging' })
    const [, saveInit] = fetchMock.mock.calls[1] ?? []
    expect((saveInit as RequestInit).method).toBe('PUT')
    expect(JSON.parse(String((saveInit as RequestInit).body))).toEqual({
      defaultEnvironmentName: 'Staging',
    })
  })

  it('fetchOrgManagedDefaults and saveOrgManagedDefaults proxy managed default routes', async () => {
    const defaults = {
      sslMode: 'require' as const,
      effectiveSslMode: 'require' as const,
      ports: { postgres: 15432, mysqlFamily: null },
      effectivePorts: { postgres: 15432, mysqlFamily: 13306 },
    }

    fetchMock.mockResolvedValueOnce(jsonResponse(defaults))
    await expect(fetchOrgManagedDefaults('org-1')).resolves.toEqual(defaults)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/client/v1/organizations/org-1/managed-defaults',
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        ...defaults,
        sslMode: 'verify-full',
        effectiveSslMode: 'verify-full',
      }),
    )
    await expect(
      saveOrgManagedDefaults('org-1', { sslMode: 'verify-full' }),
    ).resolves.toMatchObject({
      ok: true,
      sslMode: 'verify-full',
      effectiveSslMode: 'verify-full',
    })
    const [, saveInit] = fetchMock.mock.calls[1] ?? []
    expect((saveInit as RequestInit).method).toBe('PUT')
    expect(JSON.parse(String((saveInit as RequestInit).body))).toEqual({
      sslMode: 'verify-full',
    })
  })

  it('fetchVisibleTeams proxies the teams list route', async () => {
    const teams = [
      {
        id: 'team-1',
        name: 'Platform',
        organizationId: 'org-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]

    fetchMock.mockResolvedValueOnce(jsonResponse({ teams }))
    await expect(fetchVisibleTeams()).resolves.toEqual({ teams })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/client/v1/teams')
  })

  it('configureProject posts project setup to the configure route', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, alreadyConfigured: false }),
    )
    await expect(
      configureProject('proj-1', {
        type: 'docker-compose',
        code: 'wordpress',
        serverId: 'srv-203-0-113-1',
      }),
    ).resolves.toEqual({ ok: true, alreadyConfigured: false })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('/api/client/v1/projects/proj-1/configure')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      type: 'docker-compose',
      code: 'wordpress',
      serverId: 'srv-203-0-113-1',
    })
  })
})
