import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import { setProjectComposeSource } from './instance-api'

describe('setProjectComposeSource', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('patches the mode and returns the stored source', async () => {
    const body = { ok: true, composeSource: { sourceId: 's', path: 'compose.yaml', mode: 'seed' } }
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    await expect(setProjectComposeSource('p1', 'seed')).resolves.toEqual(body)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/projects/p1/compose-source')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ mode: 'seed' })
  })
})
