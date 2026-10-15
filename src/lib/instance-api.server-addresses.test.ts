import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORG_ID_HEADER, setActiveOrganizationId } from '@/lib/org-context'
import {
  fetchServerAddresses,
  isForbiddenError,
  isHttpStatusError,
  saveServerAddresses,
  ServerAddressesSaveError,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const view = { externalAccess: true, linuxHostname: 'omega', addressNeeded: false, addresses: [] }

describe('server addresses API', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId('org-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setActiveOrganizationId(null)
  })

  it('reads the addresses, and a missing route stays a recognisable 404', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(view))
    await expect(fetchServerAddresses('srv-1')).resolves.toEqual(view)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/client/v1/servers/srv-1/addresses')

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404))
    const err = await fetchServerAddresses('srv-1').catch((e: unknown) => e)
    expect(isHttpStatusError(err, 404)).toBe(true)
  })

  it('sends the replace-all body with the organization header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, reconcile: 'queued', ...view }))
    const result = await saveServerAddresses('srv-1', [{ scope: 'public', hostname: 'omega.example.com' }])
    expect(result.certificateUpdatePending).toBe(false)
    expect(result.certificateUpdateReason).toBeNull()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({
      addresses: [{ scope: 'public', hostname: 'omega.example.com' }],
    })
    expect((init.headers as Record<string, string>)[ORG_ID_HEADER]).toBe('org-1')
  })

  it('treats a 502 that carries the saved view as saved, certificate update pending', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'ingress_reconcile_failed', message: 'Saved, but…', ...view }, 502),
    )
    const result = await saveServerAddresses('srv-1', [])
    expect(result.certificateUpdatePending).toBe(true)
    expect(result.certificateUpdateReason).toBeNull()
    expect(result.addresses).toEqual([])

    for (const reason of ['enqueue_failed', 'prepare_failed'] as const) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: 'ingress_reconcile_failed', reason, message: 'Saved, but…', ...view }, 502),
      )
      await expect(saveServerAddresses('srv-1', [])).resolves.toMatchObject({
        certificateUpdatePending: true,
        certificateUpdateReason: reason,
        certificateUpdateMessage: 'Saved, but…',
      })
    }
  })

  it('throws when the server is not ready to take the change (422, nothing saved)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'daemon_key_unavailable' }, 422))
    const err = (await saveServerAddresses('srv-1', []).catch((e: unknown) => e)) as ServerAddressesSaveError
    expect(err).toBeInstanceOf(ServerAddressesSaveError)
    expect(err.status).toBe(422)
    expect(err.code).toBe('daemon_key_unavailable')
    expect(err.serverMessage).toBeNull()
  })

  it('throws the refusal code and index on a 400', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'address_v4_invalid', message: 'Enter…', index: 1 }, 400),
    )
    const err = await saveServerAddresses('srv-1', []).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ServerAddressesSaveError)
    const refused = err as ServerAddressesSaveError
    expect(refused.status).toBe(400)
    expect(refused.code).toBe('address_v4_invalid')
    expect(refused.index).toBe(1)
    expect(refused.serverMessage).toBe('Enter…')
    expect(refused.message).toContain('HTTP 400: address_v4_invalid')
  })

  it('keeps a 403 recognisable for the sign-out seam and survives a non-JSON body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, 403))
    expect(isForbiddenError(await saveServerAddresses('srv-1', []).catch((e: unknown) => e))).toBe(true)

    fetchMock.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
    const err = (await saveServerAddresses('srv-1', []).catch((e: unknown) => e)) as ServerAddressesSaveError
    expect(err.status).toBe(502)
    expect(err.code).toBeNull()
    expect(err.index).toBeNull()
  })
})
