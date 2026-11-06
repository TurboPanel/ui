// @vitest-environment happy-dom
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useApplyNotificationPreset,
  useDeleteNotificationPreference,
  useEffectiveNotificationLevels,
  useNotificationPreferencesForOrganizations,
  useNotificationPreferencesQuery,
  useNotificationUnsubscribe,
  usePutNotificationPreference,
  useUpdateNotificationSettings,
} from '@/lib/queries/notification-preferences'

const api = vi.hoisted(() => ({
  fetchNotificationPreferences: vi.fn(),
  fetchEffectiveNotificationLevels: vi.fn(),
  putNotificationPreference: vi.fn(),
  deleteNotificationPreference: vi.fn(),
  applyNotificationPreset: vi.fn(),
  updateNotificationSettings: vi.fn(),
  postNotificationUnsubscribe: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return { ...actual, ...api }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('notification preference hooks', () => {
  it('reads global and per-organization preferences, and refreshes them after a write', async () => {
    api.fetchNotificationPreferences.mockResolvedValue({ rows: [] })
    api.putNotificationPreference.mockResolvedValue({ ok: true, id: 'p-1' })
    const wrapper = createWrapper()
    renderHook(() => useNotificationPreferencesQuery(null), { wrapper })
    renderHook(() => useNotificationPreferencesForOrganizations(['org-1']), { wrapper })
    await waitFor(() => expect(api.fetchNotificationPreferences).toHaveBeenCalledTimes(2))
    expect(api.fetchNotificationPreferences).toHaveBeenCalledWith({ organizationId: null })
    expect(api.fetchNotificationPreferences).toHaveBeenCalledWith({ organizationId: 'org-1' })
    const { result } = renderHook(() => usePutNotificationPreference(), { wrapper })
    await result.current.run({ organizationId: 'org-1', kind: 'inbox', level: 'all' })
    await waitFor(() => expect(api.fetchNotificationPreferences).toHaveBeenCalledTimes(4))
  })

  it('reads effective levels only while enabled', async () => {
    api.fetchEffectiveNotificationLevels.mockResolvedValue({})
    const wrapper = createWrapper()
    const scope = { organizationId: 'org-1', projectId: 'p-1' }
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => useEffectiveNotificationLevels(scope, { enabled: on }),
      { wrapper, initialProps: { on: false } }
    )
    expect(api.fetchEffectiveNotificationLevels).not.toHaveBeenCalled()
    rerender({ on: true })
    await waitFor(() => expect(api.fetchEffectiveNotificationLevels).toHaveBeenCalledWith(scope))
  })

  it('passes each mutation through to its wrapper', async () => {
    api.deleteNotificationPreference.mockResolvedValue(undefined)
    api.applyNotificationPreset.mockResolvedValue(undefined)
    api.updateNotificationSettings.mockResolvedValue({ ok: true, allOrganizations: true })
    api.postNotificationUnsubscribe.mockResolvedValue({ ok: false, reason: 'not_applied' })
    const wrapper = createWrapper()
    const remove = renderHook(() => useDeleteNotificationPreference(), { wrapper }).result
    const preset = renderHook(() => useApplyNotificationPreset(), { wrapper }).result
    const settings = renderHook(() => useUpdateNotificationSettings(), { wrapper }).result
    const unsubscribe = renderHook(() => useNotificationUnsubscribe(), { wrapper }).result
    await remove.current.run('p-1')
    await preset.current.run({ organizationId: null, preset: 'critical' })
    await settings.current.run(true)
    const outcome = await unsubscribe.current.run('tok')
    expect(api.deleteNotificationPreference).toHaveBeenCalledWith('p-1')
    expect(api.applyNotificationPreset).toHaveBeenCalledWith(null, 'critical')
    expect(api.updateNotificationSettings).toHaveBeenCalledWith(true)
    expect(api.postNotificationUnsubscribe).toHaveBeenCalledWith('tok')
    expect(outcome).toEqual({ ok: true, value: { ok: false, reason: 'not_applied' } })
  })
})
