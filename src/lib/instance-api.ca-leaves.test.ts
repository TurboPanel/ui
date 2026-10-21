import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  deleteOrganizationCaLeaf,
  fetchOrganizationCaLeaves,
  markOrganizationCaLeafStale,
  renewOrganizationCaLeaf,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance-api Organization CA leaf wrappers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the certificates that need attention', async () => {
    const body = { leaves: [], dueCount: 0, staleCount: 0, caGeneration: 2, truncated: false }
    fetchMock.mockResolvedValueOnce(jsonResponse(body))
    await expect(fetchOrganizationCaLeaves()).resolves.toEqual(body)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/client/v1/tls/ca/leaves')
  })

  it('renews, marks stale and deletes one certificate by id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, outcome: 'queued', reason: null }))
    await expect(renewOrganizationCaLeaf('leaf 1')).resolves.toMatchObject({ outcome: 'queued' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/client/v1/tls/ca/leaves/leaf%201/renew')
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await markOrganizationCaLeafStale('leaf-1')
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('/api/client/v1/tls/ca/leaves/leaf-1/stale')
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('POST')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await deleteOrganizationCaLeaf('leaf-1')
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe('/api/client/v1/tls/ca/leaves/leaf-1')
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).method).toBe('DELETE')
  })
})
