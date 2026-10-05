import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import { fetchConfigView } from '@/lib/v4/config-view-client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('config-view client', () => {
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

  it('reads the derived config-view route of one environment', async () => {
    const side = { services: [], variables: [], linuxUsers: [] }
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        environmentId: 'env-1',
        projectId: 'p1',
        followsBase: true,
        base: side,
        effective: side,
        changes: [],
      }),
    )
    await expect(fetchConfigView('env-1')).resolves.toMatchObject({ followsBase: true, changes: [] })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/client/v1/environments/env-1/config-view')
  })

  it('names a saved compose that cannot be read', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'compose_invalid', issues: [{ message: 'bad yaml' }] }, 422))
    await expect(fetchConfigView('env-1')).rejects.toThrow('bad yaml')
  })

})
