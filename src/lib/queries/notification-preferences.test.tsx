// @vitest-environment happy-dom
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useApplyNotificationPreset,
  useDeleteNotificationPreference,
  useDeleteNotificationPreferences,
  useNotificationScopeNames,
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
  fetchVisibleProjects: vi.fn(),
  fetchVisibleEnvironments: vi.fn(),
  fetchOrgServers: vi.fn(),
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
  it('reads the rows for every organization and per organization, and refreshes after a write', async () => {
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
    // The write was inside one organization: only that organization's read runs again.
    await waitFor(() => expect(api.fetchNotificationPreferences).toHaveBeenCalledTimes(3))
    expect(api.fetchNotificationPreferences).toHaveBeenLastCalledWith({ organizationId: 'org-1' })
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
    await remove.current.run({ id: 'p-1', organizationId: 'org-1' })
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

describe('what a preference write refreshes', () => {
  /** Mounts the reads for every organization, two organizations and one scope's levels. */
  async function mountReads(wrapper: ReturnType<typeof createWrapper>) {
    api.fetchNotificationPreferences.mockResolvedValue({ rows: [] })
    api.fetchEffectiveNotificationLevels.mockResolvedValue({})
    renderHook(() => useNotificationPreferencesQuery(null), { wrapper })
    renderHook(() => useNotificationPreferencesForOrganizations(['org-1', 'org-2']), { wrapper })
    renderHook(
      () => useEffectiveNotificationLevels({ organizationId: 'org-1', projectId: 'p-1' }),
      { wrapper }
    )
    await waitFor(() => expect(api.fetchNotificationPreferences).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(api.fetchEffectiveNotificationLevels).toHaveBeenCalledTimes(1))
    api.fetchNotificationPreferences.mockClear()
    api.fetchEffectiveNotificationLevels.mockClear()
  }

  /** Lets every refetch a write started finish, so "not refetched" is a settled fact. */
  async function settle(client: ReturnType<typeof createAppQueryClient>) {
    await waitFor(() => expect(client.isFetching()).toBe(0))
  }

  it('a write inside one organization refreshes that organization only', async () => {
    const client = createAppQueryClient()
    const wrapper = createWrapper(client)
    await mountReads(wrapper)
    api.putNotificationPreference.mockResolvedValue({ ok: true, id: 'p-1' })
    api.deleteNotificationPreference.mockResolvedValue(undefined)
    api.applyNotificationPreset.mockResolvedValue(undefined)

    const put = renderHook(() => usePutNotificationPreference(), { wrapper }).result
    await put.current.run({ organizationId: 'org-1', kind: 'inbox', level: 'all' })
    await settle(client)
    expect(api.fetchNotificationPreferences.mock.calls).toEqual([[{ organizationId: 'org-1' }]])
    expect(api.fetchEffectiveNotificationLevels).toHaveBeenCalledTimes(1)

    api.fetchNotificationPreferences.mockClear()
    const remove = renderHook(() => useDeleteNotificationPreference(), { wrapper }).result
    await remove.current.run({ id: 'row-1', organizationId: 'org-2' })
    await settle(client)
    expect(api.fetchNotificationPreferences.mock.calls).toEqual([[{ organizationId: 'org-2' }]])

    api.fetchNotificationPreferences.mockClear()
    const preset = renderHook(() => useApplyNotificationPreset(), { wrapper }).result
    await preset.current.run({ organizationId: 'org-1', preset: 'recommended' })
    await settle(client)
    expect(api.fetchNotificationPreferences.mock.calls).toEqual([[{ organizationId: 'org-1' }]])
  })

  it('a write for every organization refreshes every read', async () => {
    const client = createAppQueryClient()
    const wrapper = createWrapper(client)
    await mountReads(wrapper)
    api.putNotificationPreference.mockResolvedValue({ ok: true, id: 'p-1' })
    api.updateNotificationSettings.mockResolvedValue({ ok: true, allOrganizations: true })

    const put = renderHook(() => usePutNotificationPreference(), { wrapper }).result
    await put.current.run({ kind: 'inbox', level: 'all' })
    await settle(client)
    expect(api.fetchNotificationPreferences).toHaveBeenCalledTimes(3)
    expect(api.fetchEffectiveNotificationLevels).toHaveBeenCalledTimes(1)

    api.fetchNotificationPreferences.mockClear()
    const settings = renderHook(() => useUpdateNotificationSettings(), { wrapper }).result
    await settings.current.run(true)
    await settle(client)
    expect(api.fetchNotificationPreferences).toHaveBeenCalledTimes(3)
  })

  it('Reset All removes the rows one after another and refreshes once', async () => {
    const client = createAppQueryClient()
    const wrapper = createWrapper(client)
    await mountReads(wrapper)
    api.deleteNotificationPreference.mockResolvedValue(undefined)
    const reset = renderHook(() => useDeleteNotificationPreferences(), { wrapper }).result
    const outcome = await reset.current.run({ ids: ['a', 'b', 'c'], organizationId: 'org-1' })
    await settle(client)
    expect(outcome.ok).toBe(true)
    expect(api.deleteNotificationPreference.mock.calls).toEqual([['a'], ['b'], ['c']])
    expect(api.fetchNotificationPreferences.mock.calls).toEqual([[{ organizationId: 'org-1' }]])
  })

  it('Reset All stops at the first failure, reports it, and still refreshes once', async () => {
    const client = createAppQueryClient()
    const wrapper = createWrapper(client)
    await mountReads(wrapper)
    api.deleteNotificationPreference
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('x failed: HTTP 503'))
    const reset = renderHook(() => useDeleteNotificationPreferences(), { wrapper }).result
    const outcome = await reset.current.run({ ids: ['a', 'b', 'c'], organizationId: 'org-1' })
    await settle(client)
    expect(outcome.ok).toBe(false)
    expect(api.deleteNotificationPreference.mock.calls).toEqual([['a'], ['b']])
    expect(api.fetchNotificationPreferences.mock.calls).toEqual([[{ organizationId: 'org-1' }]])
  })
})

describe('names for the override list', () => {
  it('reads one organization by name, and keeps what it could read', async () => {
    api.fetchVisibleProjects.mockResolvedValue({
      projects: [
        { id: 'p-1', name: 'Checkout' },
        { id: 'p-2', name: null },
      ],
    })
    api.fetchVisibleEnvironments.mockResolvedValue({
      environments: [{ id: 'e-1', name: 'production' }],
    })
    // A list the person may not read leaves its names out; the others stay.
    api.fetchOrgServers.mockRejectedValue(new Error('/servers failed: HTTP 403'))
    const wrapper = createWrapper()
    const { result } = renderHook(() => useNotificationScopeNames('org-1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchVisibleProjects).toHaveBeenCalledWith(undefined, 'org-1')
    expect(api.fetchVisibleEnvironments).toHaveBeenCalledWith(undefined, 'org-1')
    expect(api.fetchOrgServers).toHaveBeenCalledWith('org-1')
    expect([...(result.current.data?.projects ?? [])]).toEqual([['p-1', 'Checkout']])
    expect([...(result.current.data?.environments ?? [])]).toEqual([['e-1', 'production']])
    expect(result.current.data?.servers.size).toBe(0)
  })

  it('reads nothing until an organization needs names', () => {
    const wrapper = createWrapper()
    renderHook(() => useNotificationScopeNames('org-1', { enabled: false }), { wrapper })
    renderHook(() => useNotificationScopeNames(''), { wrapper })
    expect(api.fetchVisibleProjects).not.toHaveBeenCalled()
    expect(queryKeys.notifications.scopeNames('org-1')).toEqual([
      'notifications',
      'scope-names',
      'org-1',
    ])
  })
})
