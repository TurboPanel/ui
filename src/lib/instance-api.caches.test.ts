import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  createEnvironmentCache,
  deleteEnvironmentCache,
  fetchEnvironmentCaches,
  updateEnvironmentCache,
} from './instance-api'
import { apiErrorSentence } from './user-error'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance-api project cache calls', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined]
    return { url: String(url), method: init?.method ?? 'GET', body: init?.body }
  }

  it('lists the caches of an environment', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, caches: [] }))
    await expect(fetchEnvironmentCaches('env-1')).resolves.toEqual({ ok: true, caches: [] })
    expect(lastCall().url).toContain('/api/client/v1/environments/env-1/caches')
    expect(lastCall().method).toBe('GET')
  })

  it('adds a cache with a POST body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, cache: null, applied: true }, 201))
    await createEnvironmentCache('env-1', { name: 'sessions', principalId: 'p-1' })
    expect(lastCall().url).toContain('/environments/env-1/caches')
    expect(lastCall().method).toBe('POST')
    expect(JSON.parse(String(lastCall().body))).toEqual({ name: 'sessions', principalId: 'p-1' })
  })

  it('changes a cache under its environment', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, cache: null, applied: false }))
    await updateEnvironmentCache('env-1', 'c-1', { maxMemoryMb: 128 })
    expect(lastCall().url).toContain('/environments/env-1/caches/c-1')
    expect(lastCall().method).toBe('PATCH')
    expect(JSON.parse(String(lastCall().body))).toEqual({ maxMemoryMb: 128 })
  })

  it('deletes with the data by default and keeps it on request', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true, removed: 'host' })))
    await deleteEnvironmentCache('env-1', 'c-1')
    expect(lastCall().url.endsWith('/environments/env-1/caches/c-1')).toBe(true)
    expect(lastCall().method).toBe('DELETE')
    await deleteEnvironmentCache('env-1', 'c-1', { deleteData: false })
    expect(lastCall().url.endsWith('/caches/c-1?deleteData=false')).toBe(true)
    await deleteEnvironmentCache('env-1', 'c-1', { deleteData: true })
    expect(lastCall().url.endsWith('/caches/c-1')).toBe(true)
  })

  it('keeps the control plane sentence of a refusal', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: 'daemon_update_needed',
          message: 'Update the daemon on this server to use project caches',
        },
        409
      )
    )
    const error = await createEnvironmentCache('env-1', { name: 'a', principalId: 'p' }).catch(
      (err: unknown) => err
    )
    expect(apiErrorSentence((error as Error).message)).toBe(
      'Update the daemon on this server to use project caches'
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Encryption unavailable' }, 503))
    const missingKeys = await createEnvironmentCache('env-1', {
      name: 'a',
      principalId: 'p',
    }).catch((err: unknown) => err)
    expect(apiErrorSentence((missingKeys as Error).message)).toBe('Encryption unavailable')
  })
})
