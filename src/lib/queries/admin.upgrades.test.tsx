// @vitest-environment happy-dom
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '../query-client'
import {
  usePauseUpdates,
  useResumeUpdates,
  useSaveUpgradeSettings,
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeRunServers,
  useUpgradeServersPage,
  useUpgradeSettings,
} from './admin'

const api = vi.hoisted(() => ({
  fetchUpgradeActiveRun: vi.fn(),
  fetchUpgradeHistory: vi.fn(),
  fetchUpgradeRunServers: vi.fn(),
  fetchUpgradeServersPage: vi.fn(),
  fetchUpgradeSettings: vi.fn(),
  saveUpgradeSettings: vi.fn(),
  pauseUpdates: vi.fn(),
  resumeUpdates: vi.fn(),
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

  it('says a refused pause and reads nothing again', async () => {
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    api.pauseUpdates.mockRejectedValueOnce(new Error('HTTP 500: broken'))
    const pause = renderHook(() => usePauseUpdates(), { wrapper: createWrapper(client) })
    await expect(pause.result.current.run(undefined)).resolves.toMatchObject({ ok: false })
    expect(invalidate).not.toHaveBeenCalled()
  })
})
