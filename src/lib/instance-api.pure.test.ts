import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId, ORG_ID_HEADER } from '@/lib/org-context'
import {
  DATABASE_NOT_FOUND_ERROR,
  DeployHealthCheckMissingError,
  DeployResourceLimitExceededError,
  DEV_SYNC_WEB_AVAILABLE,
  FABRIC_RECONCILE_FAILED_ERROR,
  FABRIC_RECONCILE_PENDING_ERROR,
  completeInstall,
  createLicense,
  deleteServer,
  deployEnvironment,
  downloadOrganizationCaPem,
  fetchBindings,
  fetchDatacenter,
  fetchHealth,
  fetchInstallStatus,
  hasLiveBillingSubscription,
  fetchOrgFabric,
  fetchOrgServers,
  fetchServer,
  fetchServerMetricsCapabilities,
  fetchServerMetricsConnection,
  fetchServerMetricsEvents,
  fetchServerMetricsLiveSettings,
  fetchServerMetricsSeries,
  fetchSession,
  formatEntityMetricId,
  formatServerDeleteBlockedError,
  IP_IN_USE_ERROR,
  isForbiddenError,
  MetricsBackendUnavailableError,
  PROJECT_HAS_RUNNING_SERVICES_ERROR,
  saveServerMetricsLiveSettings,
  saveServerHardwareProfile,
  ServerCapacityExceededError,
  ServerDeleteBlockedError,
  signIn,
  startServerMetricsLive,
  stopServerMetricsLive,
  toRelayRecord,
  type FabricRelayWireRow,
  type OrgServerRecord,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status })
}

describe('error code constants', () => {
  it('exports stable API error codes used by panels', () => {
    expect(FABRIC_RECONCILE_FAILED_ERROR).toBe('fabric_reconcile_failed')
    expect(FABRIC_RECONCILE_PENDING_ERROR).toBe('fabric_reconcile_pending')
    expect(IP_IN_USE_ERROR).toBe('ip_in_use')
    expect(PROJECT_HAS_RUNNING_SERVICES_ERROR).toBe('project_has_running_services')
    expect(DATABASE_NOT_FOUND_ERROR).toBe('database_not_found')
  })

  it('marks web client as without developer sync-dev', () => {
    expect(DEV_SYNC_WEB_AVAILABLE).toBe(false)
  })
})

describe('formatEntityMetricId', () => {
  it('formats host-singleton scopes as bare canonical names, no entity id', () => {
    expect(formatEntityMetricId({ scope: 'host.cpu', field: 'busyPercent' })).toBe(
      'host.cpu.busyPercent'
    )
    expect(formatEntityMetricId({ scope: 'host.memory', field: 'usedBytes' })).toBe(
      'host.memory.usedBytes'
    )
  })

  it('formats per-entity scopes as alias:entityId.field', () => {
    expect(
      formatEntityMetricId({
        scope: 'network',
        entityId: 'eth0',
        field: 'receiveBytesPerSecond',
      })
    ).toBe('network:eth0.receiveBytesPerSecond')
    expect(formatEntityMetricId({ scope: 'ingress', entityId: 'caddy-1', field: 'requests' })).toBe(
      'ingress:caddy-1.requests'
    )
  })

  it('uses the short "hardware" alias for the hardwareSignal scope', () => {
    expect(
      formatEntityMetricId({ scope: 'hardwareSignal', entityId: 'psu1', field: 'value' })
    ).toBe('hardware:psu1.value')
  })

  it('throws when a per-entity scope is missing its entityId', () => {
    expect(() => formatEntityMetricId({ scope: 'gpu', field: 'utilizationPercent' })).toThrow()
  })

  it('formats the v6 managed host-wide scopes as bare canonical names', () => {
    expect(formatEntityMetricId({ scope: 'router', field: 'backendsUp' })).toBe('router.backendsUp')
    expect(formatEntityMetricId({ scope: 'storage', field: 'hostingUsedBytes' })).toBe(
      'storage.hostingUsedBytes'
    )
    expect(formatEntityMetricId({ scope: 'dockerUsage', field: 'layersBytes' })).toBe(
      'dockerUsage.layersBytes'
    )
    expect(() =>
      formatEntityMetricId({ scope: 'storage', entityId: 'nope', field: 'hostingUsedBytes' })
    ).toThrow(TypeError)
  })

  it('throws when a host-singleton scope is given an entityId', () => {
    expect(() =>
      formatEntityMetricId({ scope: 'host.cpu', entityId: 'nope', field: 'busyPercent' })
    ).toThrow()
  })

  it('formats both diagnostics halves as bare canonical names, no entity id', () => {
    expect(formatEntityMetricId({ scope: 'diagnostics', field: 'averageFrequencyMHz' })).toBe(
      'diagnostics.averageFrequencyMHz'
    )
    expect(formatEntityMetricId({ scope: 'diagnostics', field: 'memoryFreeBytes' })).toBe(
      'diagnostics.memoryFreeBytes'
    )
    expect(() =>
      formatEntityMetricId({ scope: 'diagnostics', entityId: 'nope', field: 'averageFrequencyMHz' })
    ).toThrow()
  })

})

describe('toRelayRecord', () => {
  function wireRow(patch: Partial<FabricRelayWireRow> = {}): FabricRelayWireRow {
    return {
      serverId: 'srv-1',
      address: '10.250.0.1',
      role: 'member',
      keepalive: 25,
      endpointAddress: null,
      publicKey: 'pk',
      prefix: '10.192.0.0/16',
      ...patch,
    }
  }

  it('prefers top-level handshake/transfer over observed', () => {
    const record = toRelayRecord(
      wireRow({
        lastHandshakeAt: '2026-01-02T00:00:00.000Z',
        transferRxBytes: 10,
        transferTxBytes: 20,
        observed: {
          lastHandshakeAt: '2026-01-01T00:00:00.000Z',
          transferRx: 1,
          transferTx: 2,
        },
      })
    )
    expect(record.lastHandshakeAt).toBe('2026-01-02T00:00:00.000Z')
    expect(record.transferRxBytes).toBe(10)
    expect(record.transferTxBytes).toBe(20)
  })

  it('falls back to observed handshake and transfer when top-level omitted', () => {
    const record = toRelayRecord(
      wireRow({
        observed: {
          lastHandshakeAt: '2026-01-03T00:00:00.000Z',
          transferRx: 100,
          transferTx: 200,
        },
      })
    )
    expect(record.lastHandshakeAt).toBe('2026-01-03T00:00:00.000Z')
    expect(record.transferRxBytes).toBe(100)
    expect(record.transferTxBytes).toBe(200)
  })

  it('omits transfer fields when neither source provides them', () => {
    const record = toRelayRecord(wireRow({ observed: null }))
    expect(record.transferRxBytes).toBeUndefined()
    expect(record.transferTxBytes).toBeUndefined()
    expect(record.lastHandshakeAt).toBeNull()
    expect(record.hasPresharedKey).toBe(false)
  })

  it('maps fabric relay wire fields onto RelayRecord', () => {
    const record = toRelayRecord(
      wireRow({
        advertisedCidrs: ['10.0.0.0/24'],
        resolvedAdvertisedCidrs: ['10.0.0.0/24'],
        resolvedEndpoint: '203.0.113.10:51820',
        segments: [{ name: 'seg-a', subnet: '10.10.0.0/24' }],
        paths: [
          {
            peerServerId: 'srv-2',
            selected: 'direct_lan',
            endpoint: '192.0.2.5:51820',
            latencyMs: 12,
            degraded: false,
          },
        ],
        allowRelay: false,
        effectiveAllowRelay: false,
        preferredGatewayIds: ['srv-9'],
        gatewayEligible: true,
      })
    )
    expect(record.advertisedCidrs).toEqual(['10.0.0.0/24'])
    expect(record.resolvedAdvertisedCidrs).toEqual(['10.0.0.0/24'])
    expect(record.resolvedEndpoint).toBe('203.0.113.10:51820')
    expect(record.segments).toEqual([{ name: 'seg-a', subnet: '10.10.0.0/24' }])
    expect(record.paths).toHaveLength(1)
    expect(record.allowRelay).toBe(false)
    expect(record.effectiveAllowRelay).toBe(false)
    expect(record.preferredGatewayIds).toEqual(['srv-9'])
    expect(record.gatewayEligible).toBe(true)
  })
})

describe('formatServerDeleteBlockedError', () => {
  it('formats singular and plural network/container blockers', () => {
    expect(
      formatServerDeleteBlockedError(
        new ServerDeleteBlockedError('blocked', [
          { kind: 'network', count: 1 },
          { kind: 'container', count: 1 },
        ])
      )
    ).toBe(
      'Remove 1 network on this server before deleting it. Remove 1 container on this server before deleting it.'
    )
    expect(
      formatServerDeleteBlockedError(
        new ServerDeleteBlockedError('blocked', [
          { kind: 'network', count: 3 },
          { kind: 'container', count: 2 },
        ])
      )
    ).toBe(
      'Remove 3 networks on this server before deleting it. Remove 2 containers on this server before deleting it.'
    )
  })

  it('falls back to the error message when blockers are empty', () => {
    expect(
      formatServerDeleteBlockedError(new ServerDeleteBlockedError('Cannot delete this server', []))
    ).toBe('Cannot delete this server')
  })

  it('uses Error.message or a default for non-blocker failures', () => {
    expect(formatServerDeleteBlockedError(new Error('boom'))).toBe('boom')
    expect(formatServerDeleteBlockedError('not-an-error')).toBe('Failed to delete server')
  })
})

describe('error classes', () => {
  it('ServerCapacityExceededError formats with and without a max', () => {
    const unlimited = new ServerCapacityExceededError(null, 5)
    expect(unlimited.code).toBe('server_capacity_exceeded')
    expect(unlimited.message).toBe('Server capacity exceeded')
    expect(unlimited.maxServers).toBeNull()
    expect(unlimited.usedSeats).toBe(5)

    const capped = new ServerCapacityExceededError(10, 10)
    expect(capped.message).toBe('Server limit reached (10 of 10)')
  })

  it('DeployHealthCheckMissingError and DeployResourceLimitExceededError carry payload', () => {
    const health = new DeployHealthCheckMissingError(true, ['web', 'api'])
    expect(health.code).toBe('health_check_missing')
    expect(health.required).toBe(true)
    expect(health.services).toEqual(['web', 'api'])

    const limit = new DeployResourceLimitExceededError([
      {
        scope: 'organization',
        field: 'cpu',
        limit: 4,
        requested: 8,
      },
    ])
    expect(limit.code).toBe('resource_limit_exceeded')
    expect(limit.violations).toHaveLength(1)
  })

  it('MetricsBackendUnavailableError defaults message from backend kind', () => {
    const err = new MetricsBackendUnavailableError('duckdb')
    expect(err.code).toBe('metrics_backend_unavailable')
    expect(err.backend).toBe('duckdb')
    expect(err.message).toContain('duckdb')

    const custom = new MetricsBackendUnavailableError('analytics-engine', 'custom unavailable')
    expect(custom.message).toBe('custom unavailable')
  })
})

describe('fetch wrappers (mocked fetch)', () => {
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

  it('fetchSession returns null on 401', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401))
    await expect(fetchSession()).resolves.toBeNull()
  })

  it('fetchSession normalizes session fields and optional needsInstall', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        userId: 'u1',
        email: 'ops@example.com',
        role: 'superadmin',
        needsInstall: false,
      })
    )
    await expect(fetchSession()).resolves.toEqual({
      userId: 'u1',
      email: 'ops@example.com',
      role: 'superadmin',
      needsInstall: false,
    })
  })

  it('fetchSession throws with body error detail when non-401 failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'session_unavailable' }, 503))
    await expect(fetchSession()).rejects.toThrow(
      '/api/client/v1/authn/session failed: session_unavailable'
    )
  })

  it('fetchSession keeps HTTP status when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('gateway timeout', 504))
    await expect(fetchSession()).rejects.toThrow('/api/client/v1/authn/session failed: HTTP 504')
  })

  it('fetchSession and signIn coerce missing identity fields to null', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(fetchSession()).resolves.toEqual({
      userId: null,
      email: null,
      role: null,
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, needsInstall: true }))
    await expect(signIn('ops@example.com', 'secret')).resolves.toEqual({
      userId: null,
      email: null,
      role: null,
      needsInstall: true,
    })
  })

  it('completeInstall coerces missing session fields and always clears needsInstall', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, organizationId: 'org-1' }))
    await expect(
      completeInstall({
        username: 'root',
        password: 'pw',
        superadminEmail: 'admin@example.com',
        superadminPassword: 'admin-pw',
      }),
    ).resolves.toEqual({
      userId: null,
      email: null,
      role: null,
      needsInstall: false,
      organizationId: 'org-1',
    })
  })

  it('re-exports isForbiddenError from the shared fetch-error helper', () => {
    expect(isForbiddenError(new Error('GET /x failed: HTTP 403'))).toBe(true)
    expect(isForbiddenError(new Error('GET /x failed: HTTP 500'))).toBe(false)
    expect(isForbiddenError('HTTP 403')).toBe(false)
  })

  it('fetchSession omits needsInstall when the body does not send it', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        userId: 'u1',
        email: 'ops@example.com',
        role: 'admin',
      })
    )
    await expect(fetchSession()).resolves.toEqual({
      userId: 'u1',
      email: 'ops@example.com',
      role: 'admin',
    })
  })

  it('fetchInstallStatus maps runtime and install flags', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        runtime: 'deno',
        needsInstall: true,
        isSignupEnabled: true,
        isSignupEmailVerificationEnabled: true,
      })
    )
    await expect(fetchInstallStatus()).resolves.toEqual({
      billingEnabled: false,
      runtime: 'deno',
      needsInstall: true,
      isInstallMode: true,
      isSignupEnabled: true,
      isSignupEmailVerificationEnabled: true,
    })
  })

  it('fetchInstallStatus passes billingEnabled through only when the instance says true', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, runtime: 'workers', isSignupEnabled: true, billingEnabled: true })
    )
    await expect(fetchInstallStatus()).resolves.toMatchObject({ billingEnabled: true })
    // Anything but a literal `true` (older instance, string, absent) is off.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, runtime: 'workers', isSignupEnabled: true, billingEnabled: 'yes' })
    )
    await expect(fetchInstallStatus()).resolves.toMatchObject({ billingEnabled: false })
  })

  it('fetchInstallStatus derives isInstallMode from needsInstall when omitted', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        runtime: 'workers',
        needsInstall: false,
        isSignupEnabled: true,
      }),
    )
    await expect(fetchInstallStatus()).resolves.toEqual({
      billingEnabled: false,
      runtime: 'workers',
      needsInstall: false,
      isInstallMode: false,
      isSignupEnabled: true,
    })
  })

  it('fetchInstallStatus defaults signup off and omits unknown runtime', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        runtime: 'other',
      })
    )
    await expect(fetchInstallStatus()).resolves.toEqual({
      billingEnabled: false,
      isSignupEnabled: false,
    })
  })

  it('fetchHealth proxies /api/health', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(fetchHealth()).resolves.toEqual({ ok: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/health')
  })

  it('fetchOrgServers / fetchServer fill missing host-default fields', async () => {
    const sparse = {
      id: 'srv-1',
      name: 'Huey',
      organizationId: 'org-1',
      licenseId: null,
      options: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      connected: true,
      hostname: 'huey',
      remoteAddress: null,
      lastInboundAt: null,
      connectedAt: null,
      statusChangedAt: null,
      geo: null,
      os: null,
      osDisplay: null,
      osLogo: null,
      resources: null,
      ips: null,
      timeSync: null,
      docker: null,
      timezone: null,
      timezoneSource: null,
    } as unknown as OrgServerRecord

    fetchMock.mockResolvedValueOnce(jsonResponse({ servers: [sparse] }))
    const list = await fetchOrgServers()
    expect(list.servers[0]?.datacenters).toEqual([])
    expect(list.servers[0]?.sshPort).toBe(22)
    expect(list.servers[0]?.sshPortSource).toBeNull()
    expect(list.servers[0]?.ntpDefaults).toBeNull()
    expect(list.servers[0]?.ntpDefaultsSource).toBeNull()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        server: {
          ...sparse,
          orgDefaultTimezone: null,
          enforceServerTimezone: false,
          datacenterDefaultTimezone: null,
          datacenterEnforceServerTimezone: false,
          colocatedWithInstance: false,
        },
      })
    )
    const detail = await fetchServer('srv-1')
    expect(detail.sshPort).toBe(22)
    expect(detail.datacenters).toEqual([])
  })

  it('fetchOrgFabric normalizes allowRelay false on the fabric record', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        enabled: false,
        relays: [],
      })
    )
    const settings = await fetchOrgFabric('org-1')
    expect(settings.enabled).toBe(false)
    expect(settings.fabric).toBeUndefined()
    expect(settings.relays).toEqual([])
  })

  it('fetchOrgFabric maps relays through toRelayRecord and allowRelay', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        enabled: true,
        fabric: {
          id: 'fab-1',
          cidr: '10.192.0.0/16',
          allowRelay: true,
        },
        relays: [
          {
            serverId: 'srv-1',
            address: '10.250.0.1',
            role: 'gateway',
            keepalive: null,
            endpointAddress: null,
            publicKey: null,
            prefix: '10.192.0.0/16',
            hasPresharedKey: true,
          },
        ],
      })
    )
    const settings = await fetchOrgFabric('org-1')
    expect(settings.enabled).toBe(true)
    expect(settings.fabric?.allowRelay).toBe(true)
    expect(settings.relays).toHaveLength(1)
    expect(settings.relays[0]?.hasPresharedKey).toBe(true)
  })

  it('fetchOrgFabric treats a missing relays array as empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ enabled: true }))
    const settings = await fetchOrgFabric('org-1')
    expect(settings.enabled).toBe(true)
    expect(settings.relays).toEqual([])
  })

  it('fetchOrgFabric keeps allowRelay false when the fabric record disables relay', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        enabled: true,
        fabric: {
          id: 'fab-1',
          cidr: '10.192.0.0/16',
          allowRelay: false,
        },
        relays: [],
      })
    )
    const settings = await fetchOrgFabric('org-1')
    expect(settings.fabric?.allowRelay).toBe(false)
  })

  it('fetchDatacenter normalizes missing cidrs/subnets and member pin ids', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        datacenter: {
          id: 'dc-1',
          name: 'Home',
          description: null,
          organizationId: 'org-1',
          options: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        members: [
          {
            serverId: 'srv-1',
            address: '192.0.2.10',
          },
        ],
      })
    )
    const body = await fetchDatacenter('dc-1')
    expect(body.datacenter.privateCidrs).toEqual([])
    expect(body.datacenter.subnets).toEqual([])
    expect(body.members[0]).toEqual({
      serverId: 'srv-1',
      address: '192.0.2.10',
      ipId: 'srv-1:192.0.2.10',
      networkId: null,
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        datacenter: {
          id: 'dc-2',
          name: 'Empty',
          description: null,
          organizationId: 'org-1',
          options: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          privateCidrs: ['203.0.113.0/24'],
          subnets: [],
        },
      }),
    )
    const empty = await fetchDatacenter('dc-2')
    expect(empty.members).toEqual([])
    expect(empty.datacenter.privateCidrs).toEqual(['203.0.113.0/24'])
  })

  it('createLicense returns minted key material on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        licenseId: 'lic-1',
        licenseToken: 'tok',
        installCommand: 'curl -fsSL turbopanel.sh | sh',
      })
    )
    await expect(createLicense('Huey', ' https://panel.example.com ')).resolves.toEqual({
      licenseId: 'lic-1',
      licenseToken: 'tok',
      installCommand: 'curl -fsSL turbopanel.sh | sh',
    })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      name: 'Huey',
      installBaseUrl: 'https://panel.example.com',
    })
  })

  it('createLicense throws ServerCapacityExceededError on 409 capacity', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'server_capacity_exceeded',
          maxServers: 3,
          usedSeats: 3,
        },
        409
      )
    )
    try {
      await createLicense('Huey')
      throw new TypeError('expected createLicense to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ServerCapacityExceededError)
      if (!(err instanceof ServerCapacityExceededError)) {
        throw new TypeError('expected ServerCapacityExceededError')
      }
      expect(err.maxServers).toBe(3)
      expect(err.usedSeats).toBe(3)
    }
  })

  it('createLicense treats missing capacity fields as unlimited with zero seats', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'server_capacity_exceeded' }, 409))
    try {
      await createLicense()
      throw new TypeError('expected createLicense to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ServerCapacityExceededError)
      if (!(err instanceof ServerCapacityExceededError)) {
        throw new TypeError('expected ServerCapacityExceededError')
      }
      expect(err.maxServers).toBeNull()
      expect(err.usedSeats).toBe(0)
    }
  })

  it('createLicense attaches the active organization header', async () => {
    setActiveOrganizationId('org-lic')
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        licenseId: 'lic-1',
        licenseToken: 'tok',
        installCommand: 'curl | sh',
      }),
    )
    await createLicense()
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).headers).toMatchObject({
      [ORG_ID_HEADER]: 'org-lic',
    })
  })

  it('createLicense maps generic and non-JSON failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, 403))
    await expect(createLicense()).rejects.toThrow(
      '/api/client/v1/licenses failed: HTTP 403: forbidden'
    )

    fetchMock.mockResolvedValueOnce(textResponse('bad gateway', 502))
    await expect(createLicense()).rejects.toThrow('/api/client/v1/licenses failed: HTTP 502')
  })

  it('deleteServer throws ServerDeleteBlockedError on 409 blockers', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          code: 'server_has_blockers',
          error: 'Cannot delete',
          blockers: [{ kind: 'container', count: 2 }],
        },
        409
      )
    )
    try {
      await deleteServer('srv-1')
      throw new TypeError('expected deleteServer to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ServerDeleteBlockedError)
      if (!(err instanceof ServerDeleteBlockedError)) {
        throw new TypeError('expected ServerDeleteBlockedError')
      }
      expect(formatServerDeleteBlockedError(err)).toBe(
        'Remove 2 containers on this server before deleting it.'
      )
    }
  })

  it('deleteServer succeeds and forwards an explicit organization header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, serverId: 'srv-1' }))
    await expect(deleteServer('srv-1', 'org-del')).resolves.toEqual({
      ok: true,
      serverId: 'srv-1',
    })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).method).toBe('DELETE')
    expect((init as RequestInit).headers).toMatchObject({
      [ORG_ID_HEADER]: 'org-del',
    })
  })

  it('deleteServer keeps HTTP status when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('nope', 500))
    await expect(deleteServer('srv-1')).rejects.toThrow(
      '/api/client/v1/servers/srv-1 failed: HTTP 500',
    )
  })

  it('deleteServer throws a generic Error for other failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, 403))
    await expect(deleteServer('srv-1')).rejects.toThrow(
      '/api/client/v1/servers/srv-1 failed: forbidden'
    )
  })

  it('deployEnvironment maps health_check_missing and resource_limit_exceeded', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'health_check_missing',
          required: true,
          services: ['web'],
        },
        409
      )
    )
    await expect(deployEnvironment('env-1')).rejects.toBeInstanceOf(DeployHealthCheckMissingError)

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'resource_limit_exceeded',
          violations: [
            {
              scope: 'server',
              field: 'memory',
              limit: 1024,
              requested: 2048,
            },
          ],
        },
        409
      )
    )
    await expect(deployEnvironment('env-1')).rejects.toBeInstanceOf(
      DeployResourceLimitExceededError
    )
  })

  it('deployEnvironment surfaces fabric_reconcile_failed from non-409 failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'fabric_reconcile_failed' }, 422))
    await expect(deployEnvironment('env-1')).rejects.toThrow(/fabric_reconcile_failed/)
  })

  it('deployEnvironment surfaces fabric_reconcile_pending from 409', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'fabric_reconcile_pending' }, 409))
    await expect(deployEnvironment('env-1')).rejects.toThrow(/fabric_reconcile_pending/)
  })

  it('deployEnvironment succeeds and attaches the org header', async () => {
    const { setActiveOrganizationId, ORG_ID_HEADER } = await import('@/lib/org-context')
    setActiveOrganizationId('org-deploy')
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, commandId: 'cmd-1', status: 'queued' })
    )
    await expect(deployEnvironment('env-1', { noCache: true })).resolves.toEqual({
      ok: true,
      commandId: 'cmd-1',
      status: 'queued',
    })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).headers).toMatchObject({
      [ORG_ID_HEADER]: 'org-deploy',
    })
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ noCache: true })
    setActiveOrganizationId(null)
  })

  it('deployEnvironment falls through unknown 409 bodies to a generic failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'something_else' }, 409))
    await expect(deployEnvironment('env-1')).rejects.toThrow(/environments\/env-1\/deploy failed/)
  })

  it('deployEnvironment maps non-JSON deploy failures', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('boom', 500))
    await expect(deployEnvironment('env-1')).rejects.toThrow(
      /environments\/env-1\/deploy failed: HTTP 500/
    )
  })

  it('deployEnvironment ignores non-JSON 409 bodies and still fails generically', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('conflict', 409))
    await expect(deployEnvironment('env-1')).rejects.toThrow(/environments\/env-1\/deploy failed/)
  })

  it('fetchServerMetricsSeries returns the series payload on success', async () => {
    const series = {
      ok: true,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-01T01:00:00.000Z',
      series: [],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(series))
    await expect(
      fetchServerMetricsSeries('srv-1', {
        fromIso: '2026-01-01T00:00:00.000Z',
        toIso: '2026-01-01T01:00:00.000Z',
        metrics: ['host.cpu.userPercent'],
        resolution: 60,
        maxPoints: 60,
      }),
    ).resolves.toEqual(series)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/metrics/series')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('metrics=host.cpu.userPercent')
  })

  it('fetchServerMetricsEvents and fetchServerMetricsConnection hit their paths', async () => {
    const range = {
      fromIso: '2026-01-01T00:00:00.000Z',
      toIso: '2026-01-01T01:00:00.000Z',
    }
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, events: [] }))
    await expect(fetchServerMetricsEvents('srv-1', range, 'org-metrics')).resolves.toEqual({
      ok: true,
      events: [],
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/metrics/events')
    const [, eventsInit] = fetchMock.mock.calls[0] ?? []
    expect((eventsInit as RequestInit).headers).toMatchObject({
      [ORG_ID_HEADER]: 'org-metrics',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, samples: [] }))
    await expect(fetchServerMetricsConnection('srv-1', range)).resolves.toEqual({
      ok: true,
      samples: [],
    })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/metrics/connection')
  })

  it('fetchServerMetricsSeries throws MetricsBackendUnavailableError on 503', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'metrics_backend_unavailable',
          backend: 'duckdb',
        },
        503
      )
    )
    try {
      await fetchServerMetricsSeries('srv-1', {
        fromIso: '2026-01-01T00:00:00.000Z',
        toIso: '2026-01-01T01:00:00.000Z',
        metrics: ['host.cpu.userPercent'],
        resolution: 60,
        maxPoints: 60,
      })
      throw new TypeError('expected metrics series to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(MetricsBackendUnavailableError)
      if (!(err instanceof MetricsBackendUnavailableError)) {
        throw new TypeError('expected MetricsBackendUnavailableError')
      }
      expect(err.backend).toBe('duckdb')
    }
  })

  it('fetchServerMetricsSeries maps non-JSON 503 and generic failures', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('unavailable', 503))
    await expect(
      fetchServerMetricsSeries(
        'srv-1',
        {
          fromIso: '2026-01-01T00:00:00.000Z',
          toIso: '2026-01-01T01:00:00.000Z',
        },
        'org-explicit'
      )
    ).rejects.toThrow(/metrics\/series\?.*failed: HTTP 503/)

    fetchMock.mockResolvedValueOnce(textResponse('nope', 500))
    await expect(
      fetchServerMetricsSeries('srv-1', {
        fromIso: '2026-01-01T00:00:00.000Z',
        toIso: '2026-01-01T01:00:00.000Z',
      })
    ).rejects.toThrow(/metrics\/series\?.*failed: HTTP 500/)

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, 403))
    await expect(
      fetchServerMetricsSeries('srv-1', {
        fromIso: '2026-01-01T00:00:00.000Z',
        toIso: '2026-01-01T01:00:00.000Z',
      })
    ).rejects.toThrow(/metrics\/series\?.*failed: HTTP 403: forbidden/)
  })

  it('startServerMetricsLive returns the lease and maps 409 outcomes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        leaseId: 'lease-1',
        intervalSeconds: 10,
        expiresAt: '2026-01-01T01:00:00.000Z',
      })
    )
    await expect(startServerMetricsLive('srv-1')).resolves.toEqual({
      kind: 'started',
      leaseId: 'lease-1',
      intervalSeconds: 10,
      expiresAt: '2026-01-01T01:00:00.000Z',
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/servers/srv-1/metrics/live')

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'live_metrics_disabled' }, 409))
    await expect(startServerMetricsLive('srv-1')).resolves.toEqual({
      kind: 'disabled',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'server_offline' }, 409))
    await expect(startServerMetricsLive('srv-1')).resolves.toEqual({
      kind: 'offline',
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'other_conflict' }, 409))
    await expect(startServerMetricsLive('srv-1')).rejects.toThrow(
      /metrics\/live failed: HTTP 409: other_conflict/,
    )

    fetchMock.mockResolvedValueOnce(textResponse('down', 503))
    await expect(startServerMetricsLive('srv-1')).rejects.toThrow(/metrics\/live failed: HTTP 503/)
  })

  it('startServerMetricsLive attaches an explicit organization header', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        leaseId: 'lease-org',
        intervalSeconds: 10,
        expiresAt: '2026-01-01T01:00:00.000Z',
      }),
    )
    await expect(startServerMetricsLive('srv-1', undefined, 'org-live')).resolves.toMatchObject({
      kind: 'started',
      leaseId: 'lease-org',
    })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).headers).toMatchObject({
      [ORG_ID_HEADER]: 'org-live',
    })
  })

  it('startServerMetricsLive renews when a leaseId is passed', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        leaseId: 'lease-9',
        intervalSeconds: 10,
        expiresAt: '2026-01-01T02:00:00.000Z',
      })
    )
    await expect(startServerMetricsLive('srv-1', 'lease-9')).resolves.toMatchObject({
      kind: 'started',
      leaseId: 'lease-9',
    })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).body).toBe(JSON.stringify({ leaseId: 'lease-9' }))
  })

  it('stopServerMetricsLive posts the leaseId as a DELETE body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(stopServerMetricsLive('srv-1', 'lease-1')).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toContain('/servers/srv-1/metrics/live')
    expect((init as RequestInit).method).toBe('DELETE')
    expect((init as RequestInit).body).toBe(JSON.stringify({ leaseId: 'lease-1' }))
  })

  it('fetchServerMetricsCapabilities maps ok, offline, and failure', async () => {
    const capabilities = {
      sensors: {
        cpuTemperature: [
          {
            chip: 'k10temp',
            label: 'Tctl',
            path: '/sys/class/hwmon/hwmon2/temp1_input',
            reading: { value: 52.25, unit: 'celsius' },
          },
        ],
        cpuPower: [],
        cpuFan: [],
        gpuFan: [],
        boardTemperature: [],
        ambient1Temperature: [],
        ambient2Temperature: [],
        disk1Temperature: [],
        disk2Temperature: [],
        systemFan1: [],
        systemFan2: [],
        gpuDevices: [],
      },
      storageMounts: {
        system: { path: '/', totalBytes: 100, availableBytes: 40 },
        hosting: { probedPath: null, result: null, reason: 'path_not_found' },
        docker: { probedPath: null, result: null, reason: 'docker_absent' },
        candidates: [],
      },
      networkInterfaces: [{ name: 'eth0', classification: 'uplink' }],
      process: { probedPath: '/proc' },
    }
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, capabilities }))
    await expect(fetchServerMetricsCapabilities('srv-1')).resolves.toEqual({
      kind: 'ok',
      capabilities,
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/servers/srv-1/metrics/capabilities')

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'server_offline' }, 409))
    await expect(fetchServerMetricsCapabilities('srv-1')).resolves.toEqual({ kind: 'offline' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'other_conflict' }, 409))
    await expect(fetchServerMetricsCapabilities('srv-1')).rejects.toThrow(
      /metrics\/capabilities failed: HTTP 409: other_conflict/,
    )

    fetchMock.mockResolvedValueOnce(textResponse('gone', 503))
    await expect(fetchServerMetricsCapabilities('srv-1')).rejects.toThrow(
      /metrics\/capabilities failed: HTTP 503/
    )
  })

  it('fetchServerMetricsCapabilities attaches an explicit organization header', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        capabilities: {
          sensors: {
            cpuTemperature: [],
            cpuPower: [],
            cpuFan: [],
            gpuFan: [],
            boardTemperature: [],
            ambient1Temperature: [],
            ambient2Temperature: [],
            disk1Temperature: [],
            disk2Temperature: [],
            systemFan1: [],
            systemFan2: [],
            gpuDevices: [],
          },
          storageMounts: {
            system: { path: '/', totalBytes: 1, availableBytes: 1 },
            hosting: { probedPath: null, result: null, reason: 'path_not_found' },
            docker: { probedPath: null, result: null, reason: 'docker_absent' },
            candidates: [],
          },
          networkInterfaces: [],
          process: { probedPath: '/proc' },
        },
      }),
    )
    await fetchServerMetricsCapabilities('srv-1', 'org-cap')
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).headers).toMatchObject({
      [ORG_ID_HEADER]: 'org-cap',
    })
  })

  it('saveServerHardwareProfile PUTs the patch body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        profile: {
          cpuTemperature: { chip: 'k10temp', label: 'Tctl' },
          generation: 1,
        },
        pushed: true,
      })
    )
    await expect(
      saveServerHardwareProfile('srv-1', {
        cpuTemperature: { chip: 'k10temp', label: 'Tctl' },
        gpuDevice: null,
      })
    ).resolves.toMatchObject({ ok: true, pushed: true })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toContain('/servers/srv-1/metrics/hardware-profile')
    expect((init as RequestInit).method).toBe('PUT')
  })

  it('server metrics live settings round-trip through the admin surface', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ maxMinutes: 60 }))
    await expect(fetchServerMetricsLiveSettings()).resolves.toEqual({
      maxMinutes: 60,
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/settings/server-metrics-live')

    fetchMock.mockResolvedValueOnce(jsonResponse({ maxMinutes: 0 }))
    await expect(saveServerMetricsLiveSettings(0)).resolves.toEqual({
      maxMinutes: 0,
    })
    const [, init] = fetchMock.mock.calls[1] ?? []
    expect((init as RequestInit).method).toBe('PUT')
    expect((init as RequestInit).body).toBe(JSON.stringify({ maxMinutes: 0 }))

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'maxMinutes must be 0 or an integer between 5 and 240' }, 400)
    )
    await expect(saveServerMetricsLiveSettings(3)).rejects.toThrow(/server-metrics-live failed/)
  })

  it('apiFetch appends a distinct human message beside the error code', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'compose_invalid',
          message: 'image tag is missing',
        },
        422,
      ),
    )
    await expect(fetchHealth()).rejects.toThrow(
      '/api/health failed: HTTP 422: compose_invalid — image tag is missing',
    )
  })

  it('apiFetch compose_invalid joins issue messages', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'compose_invalid',
          issues: [{ message: 'services.web missing image' }, { message: '' }],
        },
        400
      )
    )
    await expect(fetchHealth()).rejects.toThrow('/api/health failed: services.web missing image')
  })

  it('apiFetch keeps status detail when error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('nope', 502))
    await expect(fetchHealth()).rejects.toThrow('/api/health failed: HTTP 502')
  })

  it('fetchBindings builds query params for each filter shape', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ bindings: [] }))
    await fetchBindings({ serviceId: 'svc-1' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('serviceId=svc-1')

    fetchMock.mockResolvedValueOnce(jsonResponse({ bindings: [] }))
    await fetchBindings({ environmentId: 'env-1' })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('environmentId=env-1')

    fetchMock.mockResolvedValueOnce(jsonResponse({ bindings: [] }))
    await fetchBindings({ managedEnvironmentId: 'env-managed' })
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('managedEnvironmentId=env-managed')
  })

  it('downloadOrganizationCaPem returns PEM text and maps JSON errors', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n', {
        status: 200,
        headers: { 'content-type': 'application/x-pem-file' },
      })
    )
    await expect(downloadOrganizationCaPem()).resolves.toContain('BEGIN CERTIFICATE')

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, 403))
    await expect(downloadOrganizationCaPem()).rejects.toThrow(
      '/api/client/v1/tls/ca/download failed: HTTP 403: forbidden'
    )

    fetchMock.mockResolvedValueOnce(textResponse('bad gateway', 502))
    await expect(downloadOrganizationCaPem()).rejects.toThrow(
      '/api/client/v1/tls/ca/download failed: HTTP 502'
    )
  })
})

describe('hasLiveBillingSubscription', () => {
  const summary = (status: string | null) => ({
    payer: null,
    subscription: status
      ? { status, currentPeriodEnd: null, pastDueSince: null, graceExpiresAt: null, scheduleAttached: false }
      : null,
    tiers: [],
    pendingChanges: [],
  })

  it('mirrors the control plane: ended is canceled / incomplete_expired only', () => {
    expect(hasLiveBillingSubscription(summary('active'))).toBe(true)
    expect(hasLiveBillingSubscription(summary('past_due'))).toBe(true)
    expect(hasLiveBillingSubscription(summary('unpaid'))).toBe(true)
    expect(hasLiveBillingSubscription(summary('canceled'))).toBe(false)
    expect(hasLiveBillingSubscription(summary('incomplete_expired'))).toBe(false)
    expect(hasLiveBillingSubscription(summary(null))).toBe(false)
    expect(hasLiveBillingSubscription(null)).toBe(false)
    expect(hasLiveBillingSubscription(undefined)).toBe(false)
  })
})
