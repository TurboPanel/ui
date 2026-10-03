// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  FIREWALL_PREVIEW_POLL_MS,
  firewallPreviewRefetchInterval,
  useCreateFirewallRule,
  useDeleteFirewallRule,
  useFirewallPolicy,
  useFirewallRules,
  useFirewallServer,
  useSaveFirewallPolicy,
  useSetFirewallMode,
  useUpdateFirewallRule,
} from '@/lib/queries/firewall'
import type { FirewallServerView } from '@/lib/instance-api'

const {
  fetchFirewallPolicy,
  saveFirewallPolicy,
  fetchFirewallRules,
  createFirewallRule,
  updateFirewallRule,
  deleteFirewallRule,
  fetchFirewallServer,
  saveFirewallServerMode,
} = vi.hoisted(() => ({
  fetchFirewallPolicy: vi.fn(),
  saveFirewallPolicy: vi.fn(),
  fetchFirewallRules: vi.fn(),
  createFirewallRule: vi.fn(),
  updateFirewallRule: vi.fn(),
  deleteFirewallRule: vi.fn(),
  fetchFirewallServer: vi.fn(),
  saveFirewallServerMode: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchFirewallPolicy,
    saveFirewallPolicy,
    fetchFirewallRules,
    createFirewallRule,
    updateFirewallRule,
    deleteFirewallRule,
    fetchFirewallServer,
    saveFirewallServerMode,
  }
})

const orgId = 'org-1'
const serverId = 'srv-1'

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('firewall queries', () => {
  it('useFirewallPolicy and useFirewallRules load for the org', async () => {
    fetchFirewallPolicy.mockResolvedValueOnce({ policy: { inputDefault: 'accept' } })
    fetchFirewallRules.mockResolvedValueOnce({ rules: [] })
    const wrapper = createWrapper()
    const policy = renderHook(() => useFirewallPolicy(orgId), { wrapper })
    const rules = renderHook(() => useFirewallRules(orgId), { wrapper })
    await waitFor(() => expect(policy.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(rules.result.current.isSuccess).toBe(true))
    expect(fetchFirewallPolicy).toHaveBeenCalledWith(orgId)
    expect(fetchFirewallRules).toHaveBeenCalledWith(orgId)
  })

  it('stays idle when disabled or an id is empty', () => {
    const wrapper = createWrapper()
    expect(
      renderHook(() => useFirewallPolicy(orgId, { enabled: false }), { wrapper }).result.current
        .fetchStatus
    ).toBe('idle')
    expect(
      renderHook(() => useFirewallRules('', undefined), { wrapper }).result.current.fetchStatus
    ).toBe('idle')
    expect(
      renderHook(() => useFirewallServer(orgId, ''), { wrapper }).result.current.fetchStatus
    ).toBe('idle')
    expect(fetchFirewallPolicy).not.toHaveBeenCalled()
    expect(fetchFirewallRules).not.toHaveBeenCalled()
    expect(fetchFirewallServer).not.toHaveBeenCalled()
  })

  it('useFirewallServer loads one server view', async () => {
    fetchFirewallServer.mockResolvedValueOnce({ bulwark: { mode: 'observe' }, preview: null })
    const { result } = renderHook(() => useFirewallServer(orgId, serverId), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchFirewallServer).toHaveBeenCalledWith(orgId, serverId)
  })

  it('saving the policy writes the answer into the cache', async () => {
    const client = createAppQueryClient()
    const saved = { policy: { inputDefault: 'drop' } }
    saveFirewallPolicy.mockResolvedValueOnce(saved)
    const { result } = renderHook(() => useSaveFirewallPolicy(orgId), {
      wrapper: createWrapper(client),
    })
    await act(async () => {
      await result.current.mutateAsync({ inputDefault: 'drop' })
    })
    expect(saveFirewallPolicy).toHaveBeenCalledWith(orgId, { inputDefault: 'drop' })
    expect(client.getQueryData(queryKeys.org(orgId).firewall.policy)).toEqual(saved)
  })

  it('creating, updating and deleting a rule each refresh the rule list', async () => {
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    createFirewallRule.mockResolvedValueOnce({ rule: {} })
    updateFirewallRule.mockResolvedValueOnce({ rule: {} })
    deleteFirewallRule.mockResolvedValueOnce({ ok: true })
    const wrapper = createWrapper(client)
    const create = renderHook(() => useCreateFirewallRule(orgId), { wrapper })
    const update = renderHook(() => useUpdateFirewallRule(orgId), { wrapper })
    const remove = renderHook(() => useDeleteFirewallRule(orgId), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({ label: 'Web' } as never)
      await update.result.current.mutateAsync({ ruleId: 'r-1', patch: { isEnabled: false } })
      await remove.result.current.mutateAsync('r-1')
    })
    expect(createFirewallRule).toHaveBeenCalledWith(orgId, { label: 'Web' })
    expect(updateFirewallRule).toHaveBeenCalledWith(orgId, 'r-1', { isEnabled: false })
    expect(deleteFirewallRule).toHaveBeenCalledWith(orgId, 'r-1')
    expect(invalidate).toHaveBeenCalledTimes(3)
    for (const call of invalidate.mock.calls) {
      expect(call[0]).toEqual({ queryKey: queryKeys.org(orgId).firewall.rules })
    }
  })

  it('changing the mode refreshes that server’s view only', async () => {
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    saveFirewallServerMode.mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(() => useSetFirewallMode(orgId, serverId), {
      wrapper: createWrapper(client),
    })
    await act(async () => {
      await result.current.mutateAsync('managed')
    })
    expect(saveFirewallServerMode).toHaveBeenCalledWith(orgId, serverId, 'managed')
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).firewall.server(serverId),
    })
  })
})

describe('firewallPreviewRefetchInterval', () => {
  const view = (status: string | null) =>
    ({ bulwark: {}, preview: status ? { status } : null }) as unknown as FirewallServerView

  it('polls only while a preview is queued', () => {
    expect(firewallPreviewRefetchInterval(view('queued'))).toBe(FIREWALL_PREVIEW_POLL_MS)
    expect(firewallPreviewRefetchInterval(view('previewed'))).toBe(false)
    expect(firewallPreviewRefetchInterval(view('refused'))).toBe(false)
    expect(firewallPreviewRefetchInterval(view(null))).toBe(false)
    expect(firewallPreviewRefetchInterval(undefined)).toBe(false)
  })
})
