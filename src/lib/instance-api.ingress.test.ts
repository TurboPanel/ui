import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  addIngressAccount,
  applyHostnameIngress,
  fetchHostnameIngressStatus,
  fetchIngressAccounts,
  fetchIngressCapabilities,
  fetchInstanceTunnelStatus,
  fetchPanelDnsCertificate,
  orderPanelDnsCertificate,
  preflightHostnameIngress,
  recheckIngressAccount,
  refreshInstanceTunnelStatus,
  removeHostnameIngress,
  removeIngressAccount,
  setEdgeGate,
  updateHostnameIngress,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('connection mode, account and DNS-01 wrappers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function calls(): [string, string | undefined, unknown][] {
    return fetchMock.mock.calls.map(([url, init]) => [
      String(url).replace(/^.*\/api\/admin\/v1/, ''),
      (init as RequestInit | undefined)?.method,
      (init as RequestInit | undefined)?.body,
    ])
  }

  it('sends each request to its path with its method and body', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
    await fetchIngressCapabilities()
    await setEdgeGate(true)
    await updateHostnameIngress('h 1', { mode: 'cloudflare-tunnel', ingressId: 'a1' })
    await preflightHostnameIngress('h1')
    await applyHostnameIngress('h1', { replaceExisting: true })
    await fetchHostnameIngressStatus('h1')
    await removeHostnameIngress('h1')
    await fetchIngressAccounts()
    await addIngressAccount({ provider: 'cloudflare', label: 'Main', token: 'fake-token' })
    await recheckIngressAccount('a1')
    await removeIngressAccount('a1')
    await fetchPanelDnsCertificate('h1')
    await orderPanelDnsCertificate('h1', false)
    await orderPanelDnsCertificate('h1', true)
    await fetchInstanceTunnelStatus()
    await refreshInstanceTunnelStatus()
    expect(calls()).toEqual([
      ['/instance/ingress/capabilities', undefined, undefined],
      ['/instance/ingress/gate', 'PUT', '{"confirmed":true}'],
      [
        '/instance/ingress/hostnames/h%201',
        'PATCH',
        '{"mode":"cloudflare-tunnel","ingressId":"a1"}',
      ],
      ['/instance/ingress/hostnames/h1/preflight', 'POST', undefined],
      ['/instance/ingress/hostnames/h1/apply', 'POST', '{"replaceExisting":true}'],
      ['/instance/ingress/hostnames/h1/status', undefined, undefined],
      ['/instance/ingress/hostnames/h1/remove', 'POST', undefined],
      ['/instance/ingress/accounts', undefined, undefined],
      [
        '/instance/ingress/accounts',
        'POST',
        '{"provider":"cloudflare","label":"Main","token":"fake-token"}',
      ],
      ['/instance/ingress/accounts/a1/recheck', 'POST', undefined],
      ['/instance/ingress/accounts/a1', 'DELETE', undefined],
      ['/instance/acme-dns/hostnames/h1', undefined, undefined],
      ['/instance/acme-dns/hostnames/h1/order', 'POST', undefined],
      ['/instance/acme-dns/hostnames/h1/retry', 'POST', undefined],
      ['/instance/ingress/tunnel', undefined, undefined],
      ['/instance/ingress/tunnel/refresh', 'POST', undefined],
    ])
  })

  it('hands back the body of an expected refusal', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, cause: 'dns-conflict', detail: 'A record exists' }, 422)
    )
    await expect(applyHostnameIngress('h1')).resolves.toEqual({
      ok: false,
      cause: 'dns-conflict',
      detail: 'A record exists',
    })
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'in-use', hostnames: ['cp.example.com'] }, 409)
    )
    await expect(removeIngressAccount('a1')).resolves.toEqual({
      ok: false,
      error: 'in-use',
      hostnames: ['cp.example.com'],
    })
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'Disconnect this hostname before changing its mode or account.' }, 409)
    )
    await expect(updateHostnameIngress('h1', { mode: 'direct' })).resolves.toEqual({
      error: 'Disconnect this hostname before changing its mode or account.',
    })
  })

  it('throws on a refusal it does not expect', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
    await expect(applyHostnameIngress('h1')).rejects.toThrow(/apply failed: HTTP 500/)
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 422 }))
    await expect(
      addIngressAccount({ provider: 'cloudflare', label: 'x', token: 'y' })
    ).rejects.toThrow(/HTTP 422/)
  })
})
