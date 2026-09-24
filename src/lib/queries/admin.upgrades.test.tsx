// @vitest-environment happy-dom
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '../query-client'
import {
  useCancelUpgradeRun,
  useCheckUpgradeManifests,
  useRetryUpgradeStep,
  useRunUpgradePreflight,
  useSaveUpgradeSettings,
  useStartPlatformUpgrade,
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
} from './admin'

const api = vi.hoisted(() => ({
  fetchUpgradeActiveRun: vi.fn(),
  fetchUpgradeRun: vi.fn(),
  fetchUpgradeHistory: vi.fn(),
  fetchUpgradeServersPage: vi.fn(),
  fetchUpgradeSettings: vi.fn(),
  saveUpgradeSettings: vi.fn(),
  runUpgradePreflight: vi.fn(),
  startPlatformUpgradeRun: vi.fn(),
  checkUpgradeManifests: vi.fn(),
  retryUpgradeStep: vi.fn(),
  cancelUpgradeRun: vi.fn(),
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
      settings: {
        autoUpdate: false,
        batch: { mode: 'percent', value: 100 },
        maintenanceWindow: {
          enabled: false,
          startMinute: 0,
          durationMinutes: 60,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
        },
      },
    })
    api.fetchUpgradeHistory.mockResolvedValue({ ok: true, runs: [], total: 0 })
    api.fetchUpgradeServersPage.mockResolvedValue({ ok: true, servers: [], total: 0 })

    const wrapper = createWrapper()
    const active = renderHook(() => useUpgradeActiveRun(), { wrapper })
    const settings = renderHook(() => useUpgradeSettings(), { wrapper })
    const history = renderHook(() => useUpgradeHistory({ offset: 0, limit: 10 }), { wrapper })
    const fleet = renderHook(
      () => useUpgradeServersPage({ offset: 0, limit: 50, status: '' }),
      { wrapper },
    )

    await waitFor(() => {
      expect(active.result.current.isSuccess).toBe(true)
      expect(settings.result.current.isSuccess).toBe(true)
      expect(history.result.current.isSuccess).toBe(true)
      expect(fleet.result.current.isSuccess).toBe(true)
    })
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
    const fleet = renderHook(
      () => useUpgradeServersPage({ offset: 0, limit: 5, status: 'done' }),
      { wrapper },
    )

    await waitFor(() => {
      expect(active.result.current.data).toEqual({ ok: true, run: null })
      expect(settings.result.current.data).toBeNull()
      expect(history.result.current.data).toEqual({ ok: true, runs: [], total: 0 })
      expect(fleet.result.current.data).toEqual({ ok: true, servers: [], total: 0 })
    })
  })

  it('runs preflight, starts a platform upgrade, and mutates settings', async () => {
    const client = createAppQueryClient()
    const wrapper = createWrapper(client)
    api.runUpgradePreflight.mockResolvedValue({ ok: true, checks: [] })
    api.startPlatformUpgradeRun.mockResolvedValue({ ok: true, runId: 'run-9' })
    api.fetchUpgradeRun.mockResolvedValue({
      ok: true,
      run: { id: 'run-9', status: 'succeeded' },
    })
    const savedSettings = {
      autoUpdate: true,
      batch: { mode: 'count' as const, value: 3 },
      maintenanceWindow: {
        enabled: false,
        startMinute: 120,
        durationMinutes: 30,
        weekdays: [1, 2, 3],
      },
    }
    api.saveUpgradeSettings.mockResolvedValue({
      ok: true,
      settings: savedSettings,
    })
    api.checkUpgradeManifests.mockResolvedValue({ ok: true })
    api.retryUpgradeStep.mockResolvedValue({ ok: true })
    api.cancelUpgradeRun.mockResolvedValue({ ok: true })

    const preflight = renderHook(() => useRunUpgradePreflight(), { wrapper })
    const start = renderHook(() => useStartPlatformUpgrade(), { wrapper })
    const save = renderHook(() => useSaveUpgradeSettings(), { wrapper })
    const check = renderHook(() => useCheckUpgradeManifests(), { wrapper })
    const retry = renderHook(() => useRetryUpgradeStep(), { wrapper })
    const cancel = renderHook(() => useCancelUpgradeRun(), { wrapper })

    await expect(preflight.result.current.run(undefined)).resolves.toMatchObject({ ok: true })
    await expect(start.result.current.run(undefined)).resolves.toMatchObject({
      ok: true,
      value: { kind: 'applied' },
    })
    await expect(save.result.current.run(savedSettings)).resolves.toMatchObject({ ok: true })
    await expect(check.result.current.run(undefined)).resolves.toMatchObject({ ok: true })
    await expect(retry.result.current.run('step-1')).resolves.toMatchObject({ ok: true })
    await expect(cancel.result.current.run('run-9')).resolves.toMatchObject({ ok: true })
    expect(api.saveUpgradeSettings).toHaveBeenCalledWith(savedSettings)
  })
})
