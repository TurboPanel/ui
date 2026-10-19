import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  addEnvironmentShare,
  fetchEnvironmentFolders,
  fetchEnvironmentShares,
  fetchOrgDirectoryDefaults,
  removeEnvironmentShare,
  saveOrgDirectoryDefaults,
} from './instance-api'
import { apiErrorCopy } from './user-error'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('instance-api folder wrappers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    setActiveOrganizationId(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads and saves the organization folder naming', async () => {
    const body = { names: null, effectiveNames: 'slug', locked: false, lockedByFolders: false }
    fetchMock.mockResolvedValueOnce(jsonResponse(body))
    await expect(fetchOrgDirectoryDefaults('org-1')).resolves.toEqual(body)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/client/v1/organizations/org-1/directory-defaults'
    )

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, ...body, names: 'both' }))
    await saveOrgDirectoryDefaults('org-1', { names: 'both', locked: true })
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ names: 'both', locked: true })
  })

  it('lists an environment folders and shares and starts and stops a share', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, total: 0, folders: [] }))
    await fetchEnvironmentFolders('env-1')
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/client/v1/environments/env-1/folders')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, shares: [] }))
    await fetchEnvironmentShares('env-1')
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('/api/client/v1/environments/env-1/shares')

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, id: 'sh-1' }))
    await addEnvironmentShare('env-1', { storageId: 'st-1' })
    const post = fetchMock.mock.calls[2]?.[1] as RequestInit
    expect(post.method).toBe('POST')
    expect(JSON.parse(String(post.body))).toEqual({ storageId: 'st-1' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await removeEnvironmentShare('env-1', 'sh-1')
    expect(String(fetchMock.mock.calls[3]?.[0])).toBe(
      '/api/client/v1/environments/env-1/shares/sh-1'
    )
    expect((fetchMock.mock.calls[3]?.[1] as RequestInit).method).toBe('DELETE')
  })

  it('says each lock in plain words', () => {
    for (const code of [
      'environment_name_locked',
      'environment_has_folders',
      'environment_server_locked',
      'directory_names_locked',
      'service_slug_locked',
      'storage_slug_locked',
      'scope_locked',
      'common_asset_in_use',
    ]) {
      expect(apiErrorCopy(new Error(`HTTP 409: ${code}`))).toEqual(expect.any(String))
    }
  })
})
