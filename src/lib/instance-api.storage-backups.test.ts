import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  createStorageCopyBackup,
  deleteStorageCopyBackup,
  fetchStorageCopyBackups,
  restoreStorageCopyBackup,
} from './instance-api'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const queued = { ok: true, backupId: 'bk_1', commandId: 'cmd-1', serverId: 'srv-1' }
const base = '/storage/st-1/copies/cp-1/backups'

describe('instance-api storage copy backup wrappers', () => {
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

  function lastCall(): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? []
    return { url: String(url), init: (init ?? {}) as RequestInit }
  }

  it('lists the archives of a copy', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ backups: [] }))
    await expect(fetchStorageCopyBackups('st-1', 'cp-1')).resolves.toEqual({ backups: [] })
    expect(lastCall().url).toContain(base)
  })

  it('backs up now with POST', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(queued))
    await expect(createStorageCopyBackup('st-1', 'cp-1')).resolves.toEqual(queued)
    expect(lastCall().url).toContain(base)
    expect(lastCall().init.method).toBe('POST')
  })

  it('deletes one archive with an encoded id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(queued))
    await deleteStorageCopyBackup('st-1', 'cp-1', 'bk/1')
    expect(lastCall().url).toContain(`${base}/bk%2F1`)
    expect(lastCall().init.method).toBe('DELETE')
  })

  it('restores one archive with POST', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(queued))
    await restoreStorageCopyBackup('st-1', 'cp-1', 'bk_1')
    expect(lastCall().url).toContain(`${base}/bk_1/restore`)
    expect(lastCall().init.method).toBe('POST')
  })
})
