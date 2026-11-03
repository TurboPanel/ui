// @vitest-environment happy-dom
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '../query-client'
import {
  useCheckForUpdates,
  useDevelopmentUpdates,
  usePushDevelopmentDaemon,
  usePauseUpdates,
  useResumeUpdates,
  useSaveUpgradeSettings,
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeRunServers,
  useUpgradeServersPage,
  useUpgradeSettings,
  useUpdateNow,
} from './admin'

const api = vi.hoisted(() => ({
  fetchUpgradeActiveRun: vi.fn(),
  fetchUpgradeHistory: vi.fn(),
  fetchUpgradeRunServers: vi.fn(),
  fetchUpgradeServersPage: vi.fn(),
  fetchUpgradeSettings: vi.fn(),
  saveUpgradeSettings: vi.fn(),
  checkForUpdates: vi.fn(),
  pauseUpdates: vi.fn(),
  resumeUpdates: vi.fn(),
  startUpdateNow: vi.fn(),
  fetchDevelopmentUpdates: vi.fn(),
  pushDevelopmentDaemon: vi.fn(),
}))

vi.mock('../instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../instance-api')>()
  return { ...actual, ...api }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const missingUpgrade = new Error('HTTP 404: not found')

describe('managed upgrade admin queries', () => {
  it('loads active run, settings, history, and fleet pages', async () => {
    api.fetchUpgradeActiveRun.mockResolvedValue({
      ok: true,
      run: { id: 'run-1', status: 'running' },
    })
    api.fetchUpgradeSettings.mockResolvedValue({
      ok: true,
      settings: { batch: { mode: 'percent', value: 100 } },
    })
    api.fetchUpgradeHistory.mockResolvedValue({ ok: true, runs: [], total: 0 })
    api.fetchUpgradeServersPage.mockResolvedValue({ ok: true, servers: [], total: 0 })

    const wrapper = createWrapper()
    const active = renderHook(() => useUpgradeActiveRun(), { wrapper })
    const settings = renderHook(() => useUpgradeSettings(), { wrapper })
    const history = renderHook(() => useUpgradeHistory({ offset: 0, limit: 10 }), { wrapper })
    const fleet = renderHook(() => useUpgradeServersPage({ offset: 0, limit: 50, status: '' }), {
      wrapper,
    })

    await waitFor(() => {
      expect(active.result.current.isSuccess).toBe(true)
      expect(settings.result.current.isSuccess).toBe(true)
      expect(history.result.current.isSuccess).toBe(true)
      expect(fleet.result.current.isSuccess).toBe(true)
    })
  })

  it('passes history filters and run server queries through to the control plane', async () => {
    api.fetchUpgradeHistory.mockResolvedValue({ ok: true, runs: [], total: 0 })
    api.fetchUpgradeRunServers.mockResolvedValue({
      ok: true,
      run: { id: 'run-1', status: 'succeeded' },
      units: ['daemon'],
      statusCounts: { all: 0 },
      organizations: [],
      servers: [],
      total: 0,
    })
    const wrapper = createWrapper()
    const history = renderHook(
      () =>
        useUpgradeHistory({
          offset: 25,
          limit: 25,
          status: 'failed',
          trigger: 'manual',
        }),
      { wrapper }
    )
    const servers = renderHook(
      () =>
        useUpgradeRunServers('run-1', {
          offset: 0,
          limit: 50,
          sort: 'status',
          q: 'web',
        }),
      { wrapper }
    )
    const idle = renderHook(() => useUpgradeRunServers('', { limit: 1 }), {
      wrapper,
    })

    await waitFor(() => {
      expect(history.result.current.isSuccess).toBe(true)
      expect(servers.result.current.isSuccess).toBe(true)
    })
    expect(api.fetchUpgradeHistory).toHaveBeenCalledWith({
      offset: 25,
      limit: 25,
      status: 'failed',
      trigger: 'manual',
    })
    expect(api.fetchUpgradeRunServers).toHaveBeenCalledTimes(1)
    expect(api.fetchUpgradeRunServers).toHaveBeenCalledWith('run-1', {
      offset: 0,
      limit: 50,
      sort: 'status',
      q: 'web',
    })
    expect(idle.result.current.fetchStatus).toBe('idle')
  })

  it('treats a missing upgrade API as empty state', async () => {
    api.fetchUpgradeActiveRun.mockRejectedValue(missingUpgrade)
    api.fetchUpgradeSettings.mockRejectedValue(missingUpgrade)
    api.fetchUpgradeHistory.mockRejectedValue(missingUpgrade)
    api.fetchUpgradeServersPage.mockRejectedValue(missingUpgrade)

    const wrapper = createWrapper()
    const active = renderHook(() => useUpgradeActiveRun(), { wrapper })
    const settings = renderHook(() => useUpgradeSettings(), { wrapper })
    const history = renderHook(() => useUpgradeHistory({ offset: 0, limit: 5 }), { wrapper })
    const fleet = renderHook(() => useUpgradeServersPage({ offset: 0, limit: 5, status: 'done' }), {
      wrapper,
    })

    await waitFor(() => {
      expect(active.result.current.data).toEqual({ ok: true, run: null })
      expect(settings.result.current.data).toBeNull()
      expect(history.result.current.data).toEqual({ ok: true, runs: [], total: 0 })
      expect(fleet.result.current.data).toEqual({ ok: true, servers: [], total: 0 })
    })
  })

  it('saves the group size', async () => {
    const wrapper = createWrapper()
    const savedSettings = { batch: { mode: 'count' as const, value: 3 } }
    api.saveUpgradeSettings.mockResolvedValue({ ok: true, settings: savedSettings })
    const save = renderHook(() => useSaveUpgradeSettings(), { wrapper })
    await expect(save.result.current.run(savedSettings)).resolves.toMatchObject({ ok: true })
    expect(api.saveUpgradeSettings).toHaveBeenCalledWith(savedSettings)
  })

  it('pause and resume read the update status again', async () => {
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = createWrapper(client)
    api.pauseUpdates.mockResolvedValue({
      ok: true,
      updatesPaused: true,
      pausedAt: '2026-10-27T10:00:00.000Z',
      pausedBy: { userId: 'u1', email: 'ops@example.com', name: 'Ops' },
    })
    api.resumeUpdates.mockResolvedValue({
      ok: true,
      updatesPaused: false,
      pausedAt: null,
      pausedBy: null,
    })

    const pause = renderHook(() => usePauseUpdates(), { wrapper })
    const resume = renderHook(() => useResumeUpdates(), { wrapper })

    await expect(pause.result.current.run(undefined)).resolves.toMatchObject({
      ok: true,
      value: { updatesPaused: true },
    })
    expect(api.pauseUpdates).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: queryKeys.admin.instanceUpdates })

    invalidate.mockClear()
    await expect(resume.result.current.run(undefined)).resolves.toMatchObject({
      ok: true,
      value: { updatesPaused: false },
    })
    expect(api.resumeUpdates).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: queryKeys.admin.instanceUpdates })
  })

  it('Update Now reads the update status and run again, started or refused', async () => {
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    api.startUpdateNow.mockResolvedValueOnce({ ok: true, runId: 'run-7' })
    const now = renderHook(() => useUpdateNow(), { wrapper: createWrapper(client) })
    await expect(now.result.current.run(undefined)).resolves.toEqual({
      ok: true,
      value: { ok: true, runId: 'run-7' },
    })
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: queryKeys.admin.instanceUpdates })

    invalidate.mockClear()
    // A refusal (an update already going) still refreshes, so the run shows.
    api.startUpdateNow.mockRejectedValueOnce(new Error('HTTP 409: run_active'))
    await expect(now.result.current.run(undefined)).resolves.toMatchObject({ ok: false })
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: queryKeys.admin.instanceUpdates })
  })

  it('says a refused pause and reads nothing again', async () => {
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    api.pauseUpdates.mockRejectedValueOnce(new Error('HTTP 500: broken'))
    const pause = renderHook(() => usePauseUpdates(), { wrapper: createWrapper(client) })
    await expect(pause.result.current.run(undefined)).resolves.toMatchObject({ ok: false })
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('Check Now writes the fresh status into the cache, then reads it again', async () => {
    api.pauseUpdates.mockClear()
    api.resumeUpdates.mockClear()
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const fresh = { ok: true, channel: 'release', automatic: true, updateWaiting: true }
    api.checkForUpdates.mockResolvedValue(fresh)
    const check = renderHook(() => useCheckForUpdates('abc'), { wrapper: createWrapper(client) })
    await expect(check.result.current.run(undefined)).resolves.toMatchObject({ ok: true })
    expect(api.checkForUpdates).toHaveBeenCalledWith('abc')
    expect(client.getQueryData(queryKeys.admin.instanceUpdates)).toEqual(fresh)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.admin.instanceUpdates })
    expect(api.pauseUpdates).not.toHaveBeenCalled()
    expect(api.resumeUpdates).not.toHaveBeenCalled()
  })
})

describe('development build-and-push queries', () => {
  const view = (job: { id: string; state: string } | null) => ({
    ok: true,
    daemonBuild: { built: null, sourceFingerprint: 'fp', sourceChanged: true },
    servers: [],
    job,
    pendingDaemonChanges: true,
  })

  it('reads nothing until enabled', () => {
    const wrapper = createWrapper()
    const idle = renderHook(() => useDevelopmentUpdates({ enabled: false }), { wrapper })
    expect(idle.result.current.fetchStatus).toBe('idle')
    expect(api.fetchDevelopmentUpdates).not.toHaveBeenCalled()
  })

  it('reads the update status again once a running job finishes', async () => {
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    api.fetchDevelopmentUpdates.mockReset()
    api.fetchDevelopmentUpdates.mockResolvedValueOnce(view({ id: 'j1', state: 'pushing' }))
    api.fetchDevelopmentUpdates.mockResolvedValue(view({ id: 'j1', state: 'done' }))
    const hook = renderHook(() => useDevelopmentUpdates(), { wrapper: createWrapper(client) })
    await waitFor(() => {
      expect(hook.result.current.data?.job?.state).toBe('pushing')
    })
    expect(invalidate).not.toHaveBeenCalled()
    await hook.result.current.refetch()
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.admin.instanceUpdates })
    })
  })

  it('a push puts the started job into the cache, and a refusal leaves it alone', async () => {
    const client = createAppQueryClient()
    client.setQueryData(queryKeys.admin.developmentUpdates, view(null))
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
    const job = { id: 'j2', state: 'building' }
    api.pushDevelopmentDaemon.mockResolvedValueOnce({ ok: true, job })
    const push = renderHook(() => usePushDevelopmentDaemon(), { wrapper: createWrapper(client) })
    await expect(push.result.current.run(undefined)).resolves.toMatchObject({ ok: true })
    expect(api.pushDevelopmentDaemon).toHaveBeenCalledWith({})
    expect(client.getQueryData(queryKeys.admin.developmentUpdates)).toMatchObject({ job })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.admin.developmentUpdates })

    client.setQueryData(queryKeys.admin.developmentUpdates, null)
    api.pushDevelopmentDaemon.mockResolvedValueOnce({ ok: false, error: 'job_running' })
    await expect(push.result.current.run({ force: true })).resolves.toMatchObject({
      ok: true,
      value: { ok: false },
    })
    expect(api.pushDevelopmentDaemon).toHaveBeenLastCalledWith({ force: true })
    expect(client.getQueryData(queryKeys.admin.developmentUpdates)).toBeNull()
  })
})
