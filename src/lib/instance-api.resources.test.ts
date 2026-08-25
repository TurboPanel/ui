import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  createContainer,
  createHosting,
  createService,
  createTlsCertificate,
  deleteContainer,
  deleteTlsCertificate,
  fetchContainer,
  fetchTlsLibrary,
  fetchVisibleHostings,
  fetchVisibleServices,
  updateContainer,
  updateHosting,
  updateService,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const SERVICE = {
  id: 'svc-1',
  name: 'api',
  description: 'HTTP API',
  environmentId: 'env-1',
  composeServiceName: 'api',
  metadata: { catalog: 'web' },
  options: { healthCheck: { policy: 'warn' as const } },
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

const HOSTING = {
  id: 'host-1',
  name: 'www',
  description: 'public hostname',
  serviceId: 'svc-1',
  tlsId: 'tls-1',
  ipId: 'ip-1',
  metadata: { bindAddress: '203.0.113.10' },
  options: {
    bind: 'public',
    protocol: 'tcp',
    ports: [{ published: 8443, target: 8080 }],
  },
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

const TLS = {
  id: 'tls-1',
  organizationId: 'org-1',
  name: 'edge',
  source: 'upload' as const,
  metadata: {
    dnsNames: ['app.example.com'],
    hasWildcard: false,
    notBefore: '2026-01-01T00:00:00.000Z',
    notAfter: '2027-01-01T00:00:00.000Z',
    fingerprintSha256: 'aa'.repeat(32),
    subject: 'CN=app.example.com',
    issuer: 'CN=Test CA',
    status: 'ready' as const,
  },
  options: {
    prefer: 10,
    autoRenew: false,
    requestedHostnames: ['app.example.com'],
  },
  certificatePem: '-----BEGIN CERTIFICATE-----\n',
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

const CONTAINER = {
  id: 'ctr-1',
  serviceId: 'svc-1',
  environmentId: 'env-1',
  serverId: 'srv-1',
  containerId: 'docker-abc',
  containerName: 'svc-1',
  status: 'running',
  role: 'service' as const,
  composeServiceName: 'api',
  metadata: { image: 'nginx:alpine' },
  options: { restart: 'always' },
  createdAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
}

describe('instance-api resource fetch wrappers', () => {
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

  function nthCall(index: number): { url: string; init: RequestInit } {
    const call = fetchMock.mock.calls[index]
    if (!call) {
      throw new TypeError(`expected fetch call at index ${index}`)
    }
    const init = call[1]
    if (!init || typeof init !== 'object') {
      throw new TypeError('expected fetch RequestInit')
    }
    return { url: String(call[0]), init: init as RequestInit }
  }

  function requestBody(index: number): unknown {
    const { init } = nthCall(index)
    return JSON.parse(String(init.body))
  }

  it('fetchVisibleServices lists services and appends environmentId when set', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ services: [SERVICE] }))
    await expect(fetchVisibleServices()).resolves.toEqual({ services: [SERVICE] })
    const unfiltered = nthCall(0)
    expect(unfiltered.url).toContain('/api/client/v1/services')
    expect(unfiltered.url).not.toContain('environmentId=')
    expect(unfiltered.init.method).toBeUndefined()

    fetchMock.mockResolvedValueOnce(jsonResponse({ services: [SERVICE] }))
    await expect(fetchVisibleServices('env-1')).resolves.toEqual({
      services: [SERVICE],
    })
    const filtered = nthCall(1)
    expect(filtered.url).toContain('/api/client/v1/services')
    expect(filtered.url).toContain('environmentId=env-1')
  })

  it('createService POSTs environmentId plus the supplied body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'svc-2' }))
    await expect(
      createService('env-1', {
        name: 'api',
        description: 'HTTP API',
        metadata: { catalog: 'web' },
        options: { healthCheck: { policy: 'warn' } },
      }),
    ).resolves.toEqual({ ok: true, id: 'svc-2' })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/services')
    expect(init.method).toBe('POST')
    expect(requestBody(0)).toEqual({
      environmentId: 'env-1',
      name: 'api',
      description: 'HTTP API',
      metadata: { catalog: 'web' },
      options: { healthCheck: { policy: 'warn' } },
    })
  })

  it('updateService PATCHes the named fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateService('svc-1', {
        name: 'api-v2',
        options: { build: { disableCache: true } },
        metadata: { catalog: 'web' },
      }),
    ).resolves.toEqual({ ok: true })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/services/svc-1')
    expect(init.method).toBe('PATCH')
    expect(requestBody(0)).toEqual({
      name: 'api-v2',
      options: { build: { disableCache: true } },
      metadata: { catalog: 'web' },
    })
  })

  it('fetchVisibleHostings lists hostings for a serviceId', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ hostings: [HOSTING] }))
    await expect(fetchVisibleHostings('svc-1')).resolves.toEqual({
      hostings: [HOSTING],
    })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/hostings')
    expect(url).toContain('serviceId=svc-1')
    expect(init.method).toBeUndefined()
  })

  it('createHosting POSTs only serviceId when optional fields are omitted', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'host-2' }))
    await expect(createHosting('svc-1')).resolves.toEqual({
      ok: true,
      id: 'host-2',
    })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/hostings')
    expect(init.method).toBe('POST')
    expect(requestBody(0)).toEqual({ serviceId: 'svc-1' })
  })

  it('createHosting serializes optional tls, ip, bind, and port fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'host-3' }))
    await expect(
      createHosting('svc-1', {
        name: 'www',
        description: 'public hostname',
        metadata: { bindAddress: '203.0.113.10' },
        options: {
          bind: 'public',
          protocol: 'tcp',
          ports: [{ published: 8443, target: 8080 }],
        },
        tlsId: 'tls-1',
        ipId: 'ip-1',
      }),
    ).resolves.toEqual({ ok: true, id: 'host-3' })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/hostings')
    expect(init.method).toBe('POST')
    expect(requestBody(0)).toEqual({
      serviceId: 'svc-1',
      name: 'www',
      description: 'public hostname',
      metadata: { bindAddress: '203.0.113.10' },
      options: {
        bind: 'public',
        protocol: 'tcp',
        ports: [{ published: 8443, target: 8080 }],
      },
      tlsId: 'tls-1',
      ipId: 'ip-1',
    })
  })

  it('updateHosting PATCHes tls, ip, bind, and protocol/ports', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateHosting('host-1', {
        name: 'www',
        description: 'public hostname',
        metadata: { bindAddress: '203.0.113.11' },
        options: {
          bind: 'datacenter',
          protocol: 'udp',
          ports: [{ published: 51820, target: 51820 }],
        },
        tlsId: null,
        ipId: null,
      }),
    ).resolves.toEqual({ ok: true })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/hostings/host-1')
    expect(init.method).toBe('PATCH')
    expect(requestBody(0)).toEqual({
      name: 'www',
      description: 'public hostname',
      metadata: { bindAddress: '203.0.113.11' },
      options: {
        bind: 'datacenter',
        protocol: 'udp',
        ports: [{ published: 51820, target: 51820 }],
      },
      tlsId: null,
      ipId: null,
    })
  })

  it('fetchTlsLibrary lists org certificates', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ tls: [TLS] }))
    await expect(fetchTlsLibrary()).resolves.toEqual({ tls: [TLS] })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/tls')
    expect(init.method).toBeUndefined()
  })

  it('createTlsCertificate POSTs upload and lets_encrypt bodies', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'tls-2' }))
    await expect(
      createTlsCertificate({
        source: 'upload',
        name: 'edge',
        certificatePem: '-----BEGIN CERTIFICATE-----\n',
        privateKeyPem: '-----BEGIN PRIVATE KEY-----\n',
        hostnames: ['app.example.com'],
        prefer: 10,
        autoRenew: false,
      }),
    ).resolves.toEqual({ ok: true, id: 'tls-2' })
    const upload = nthCall(0)
    expect(upload.url).toContain('/api/client/v1/tls')
    expect(upload.init.method).toBe('POST')
    expect(requestBody(0)).toEqual({
      source: 'upload',
      name: 'edge',
      certificatePem: '-----BEGIN CERTIFICATE-----\n',
      privateKeyPem: '-----BEGIN PRIVATE KEY-----\n',
      hostnames: ['app.example.com'],
      prefer: 10,
      autoRenew: false,
    })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'tls-3' }))
    await expect(
      createTlsCertificate({
        source: 'lets_encrypt',
        hostnames: ['app.example.com'],
        autoRenew: true,
        challengeType: 'http-01',
      }),
    ).resolves.toEqual({ ok: true, id: 'tls-3' })
    const issued = nthCall(1)
    expect(issued.url).toContain('/api/client/v1/tls')
    expect(issued.init.method).toBe('POST')
    expect(requestBody(1)).toEqual({
      source: 'lets_encrypt',
      hostnames: ['app.example.com'],
      autoRenew: true,
      challengeType: 'http-01',
    })
  })

  it('deleteTlsCertificate DELETEs the certificate id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteTlsCertificate('tls-1')).resolves.toEqual({ ok: true })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/tls/tls-1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('fetchContainer unwraps a single container record', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ container: CONTAINER }))
    await expect(fetchContainer('ctr-1')).resolves.toEqual({
      container: CONTAINER,
    })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/containers/ctr-1')
    expect(init.method).toBeUndefined()
  })

  it('createContainer POSTs allocator identity fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'ctr-2' }))
    await expect(
      createContainer({
        serviceId: 'svc-1',
        serverId: 'srv-1',
        containerId: 'docker-abc',
        containerName: 'svc-1',
        status: 'running',
        composeServiceName: 'api',
        metadata: { image: 'nginx:alpine' },
        options: { restart: 'always' },
      }),
    ).resolves.toEqual({ ok: true, id: 'ctr-2' })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/containers')
    expect(init.method).toBe('POST')
    expect(requestBody(0)).toEqual({
      serviceId: 'svc-1',
      serverId: 'srv-1',
      containerId: 'docker-abc',
      containerName: 'svc-1',
      status: 'running',
      composeServiceName: 'api',
      metadata: { image: 'nginx:alpine' },
      options: { restart: 'always' },
    })
  })

  it('updateContainer PATCHes identity and residual fields', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(
      updateContainer('ctr-1', {
        containerId: 'docker-def',
        containerName: 'svc-1-1',
        status: 'exited',
        composeServiceName: 'api',
        metadata: null,
        options: { restart: 'unless-stopped' },
      }),
    ).resolves.toEqual({ ok: true })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/containers/ctr-1')
    expect(init.method).toBe('PATCH')
    expect(requestBody(0)).toEqual({
      containerId: 'docker-def',
      containerName: 'svc-1-1',
      status: 'exited',
      composeServiceName: 'api',
      metadata: null,
      options: { restart: 'unless-stopped' },
    })
  })

  it('deleteContainer DELETEs the container id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(deleteContainer('ctr-1')).resolves.toEqual({ ok: true })
    const { url, init } = nthCall(0)
    expect(url).toContain('/api/client/v1/containers/ctr-1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })
})
