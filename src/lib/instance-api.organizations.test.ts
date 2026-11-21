import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteOrganization,
  fetchAdminOrganizations,
  OrganizationDeleteBlockedError,
} from './instance-api'
import { stepUpBroker } from './step-up'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('organization delete and admin list', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the exact name as confirmName on DELETE', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, id: 'o1' }))
    await expect(deleteOrganization('o1', 'Acme & Co')).resolves.toEqual({ ok: true, id: 'o1' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/organizations/o1?confirmName=Acme+%26+Co')
    expect(init.method).toBe('DELETE')
  })

  it('throws a typed error with the count on each 409', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: 'organization_has_servers',
          code: 'organization_has_servers',
          message: 'still servers',
          serverCount: 3,
        },
        409
      )
    )
    const err = await deleteOrganization('o1', 'A').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OrganizationDeleteBlockedError)
    expect(err).toMatchObject({ code: 'organization_has_servers', count: 3 })

    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: 'organization_has_dns_records',
          code: 'organization_has_dns_records',
          dnsRecordCount: 2,
        },
        409
      )
    )
    await expect(deleteOrganization('o1', 'A')).rejects.toMatchObject({
      code: 'organization_has_dns_records',
      count: 2,
    })
  })

  it('asks for step-up on reauth_required and sends the delete again', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: 'reauth_required',
            action: 'organization.delete',
            methods: ['password'],
            windowSeconds: 300,
          },
          403
        )
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, id: 'o1' }))
    const unsubscribe = stepUpBroker.subscribe((challenge) => {
      if (challenge) {
        expect(challenge.action).toBe('organization.delete')
        stepUpBroker.settle(true)
      }
    })
    try {
      await expect(deleteOrganization('o1', 'A')).resolves.toEqual({ ok: true, id: 'o1' })
    } finally {
      unsubscribe()
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reads the admin organization list', async () => {
    const payload = {
      organizations: [
        {
          id: 'o1',
          name: 'Root',
          createdAt: '2026-01-01T00:00:00Z',
          owner: null,
          memberCount: 1,
          serverCount: 0,
          projectCount: 2,
          isRoot: true,
        },
      ],
    }
    fetchMock.mockResolvedValue(jsonResponse(payload))
    await expect(fetchAdminOrganizations()).resolves.toEqual(payload)
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('/api/admin/v1/organizations')
  })
})
