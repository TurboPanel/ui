import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  createBackupPolicy,
  deleteBackupPolicy,
  fetchBackupPolicies,
  fetchBackupRuns,
  updateBackupPolicy,
} from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const reconcile = { queuedServerIds: ['srv-1'], failedServerIds: [] }

const policy = {
  id: 'pol-1',
  name: 'Daily',
  targetKind: 'managed' as const,
  managedId: 'man-1',
  schedule: '12 3 * * *',
  preset: { preset: 'daily' as const, time: '03:12' },
  timezone: null,
  retentionKeep: 7,
  enabled: true,
  automatic: true,
  nextRunAt: null,
  lastRun: null,
  createdAt: 't',
  updatedAt: 't',
}

describe('instance-api backup policy wrappers', () => {
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
    if (typeof url !== 'string' || !init || typeof init !== 'object') {
      throw new TypeError('expected a fetch call')
    }
    return { url, init: init as RequestInit }
  }

  function lastBody(): unknown {
    const { init } = lastCall()
    if (typeof init.body !== 'string') throw new TypeError('expected a JSON body')
    return JSON.parse(init.body)
  }

  it('lists policies', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ policies: [policy] }))
    await expect(fetchBackupPolicies('env-1')).resolves.toEqual({ policies: [policy] })
    expect(lastCall().url).toContain('/environments/env-1/managed/backup-policies')
    expect(lastCall().init.method).toBeUndefined()
  })

  it('creates a policy with a preset schedule', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ policy, reconcile }, 201))
    await expect(
      createBackupPolicy('env-1', {
        name: 'Daily',
        schedule: { preset: 'daily', time: '03:12' },
        timezone: null,
        retentionKeep: 7,
        enabled: true,
      })
    ).resolves.toEqual({ policy, reconcile })
    expect(lastCall().init.method).toBe('POST')
    expect(lastBody()).toEqual({
      name: 'Daily',
      schedule: { preset: 'daily', time: '03:12' },
      timezone: null,
      retentionKeep: 7,
      enabled: true,
    })
  })

  it('updates a policy by id, encoding it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ policy, reconcile: null }))
    await expect(updateBackupPolicy('env-1', 'pol/1', { name: 'Renamed' })).resolves.toEqual({
      policy,
      reconcile: null,
    })
    expect(lastCall().url).toContain('/managed/backup-policies/pol%2F1')
    expect(lastCall().init.method).toBe('PATCH')
    expect(lastBody()).toEqual({ name: 'Renamed' })
  })

  it('deletes a policy', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, reconcile }))
    await expect(deleteBackupPolicy('env-1', 'pol-1')).resolves.toEqual({ ok: true, reconcile })
    expect(lastCall().url).toContain('/managed/backup-policies/pol-1')
    expect(lastCall().init.method).toBe('DELETE')
  })

  it('lists runs with and without a limit', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ runs: [] }))
    await expect(fetchBackupRuns('env-1', 'pol-1')).resolves.toEqual({ runs: [] })
    expect(lastCall().url).toMatch(/\/backup-policies\/pol-1\/runs$/)

    fetchMock.mockResolvedValueOnce(jsonResponse({ runs: [] }))
    await fetchBackupRuns('env-1', 'pol-1', 50)
    expect(lastCall().url).toMatch(/\/backup-policies\/pol-1\/runs\?limit=50$/)
  })

  it('surfaces the refusal code in the error', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'backup_policy_limit', limit: 20 }, 409)
    )
    await expect(
      createBackupPolicy('env-1', { name: 'X', schedule: '0 1 * * *', retentionKeep: 1 })
    ).rejects.toThrow(/HTTP 409: backup_policy_limit/)
  })
})
