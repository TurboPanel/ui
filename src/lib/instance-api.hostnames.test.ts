import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId, ORG_ID_HEADER } from '@/lib/org-context'
import {
  attachInstanceCertificate,
  fetchInstanceAcmeSettings,
  fetchInstanceCertificates,
  fetchInstanceDaemon,
  fetchInstanceHostnames,
  fetchInstanceUpdates,
  fetchPlatformCa,
  fetchTrustedProxies,
  InstanceHostnameValidationError,
  reconcilePlatformCaTrust,
  requestColocatedDaemonUpdate,
  requestInstanceUpdate,
  saveInstanceAcmeSettings,
  saveInstanceHostnames,
  setInstanceTunnelToken,
  uploadInstanceCertificate,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance hostname and update fetch wrappers', () => {
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

  it('reads and writes the instance access and update endpoints', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
    await fetchInstanceHostnames()
    await fetchInstanceCertificates()
    await uploadInstanceCertificate({
      label: 'edge',
      certPem: 'cert',
      keyPem: 'key',
    })
    await attachInstanceCertificate('cert-1', ['panel.example.com'])
    await fetchInstanceAcmeSettings()
    await saveInstanceAcmeSettings({ contactEmail: 'ops@example.com' })
    await fetchInstanceDaemon()
    await fetchInstanceUpdates()
    await requestInstanceUpdate()
    await requestColocatedDaemonUpdate()
    await fetchPlatformCa()
    await reconcilePlatformCaTrust()
    await fetchTrustedProxies()
    await setInstanceTunnelToken('')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('saveInstanceHostnames sends the org header and names refused entries', async () => {
    setActiveOrganizationId('org-1')
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, hostnames: [] }))
    await saveInstanceHostnames([])
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).headers).toMatchObject({
      [ORG_ID_HEADER]: 'org-1',
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'bad host', invalid: ['*.example.com', 1] },
        422,
      ),
    )
    await expect(saveInstanceHostnames([])).rejects.toBeInstanceOf(
      InstanceHostnameValidationError,
    )

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 500))
    await expect(saveInstanceHostnames([])).rejects.toThrow('HTTP 500')

    fetchMock.mockResolvedValueOnce(
      new Response('not-json', { status: 502 }),
    )
    await expect(saveInstanceHostnames([])).rejects.toThrow('HTTP 502')
  })
})
