// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InstanceHostnameRecord } from '@/lib/instance-api'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useAddIngressAccount,
  useApplyHostnameIngress,
  useHostnameIngressStatus,
  useIngressAccounts,
  useIngressCapabilities,
  useOrderPanelDnsCertificate,
  usePanelDnsCertificate,
  usePreflightHostnameIngress,
  useRecheckIngressAccount,
  useRemoveHostnameIngress,
  useRemoveIngressAccount,
  useSetEdgeGate,
  useUpdateHostnameIngress,
} from './ingress'

const api = vi.hoisted(() => ({
  addIngressAccount: vi.fn(),
  applyHostnameIngress: vi.fn(),
  fetchHostnameIngressStatus: vi.fn(),
  fetchIngressAccounts: vi.fn(),
  fetchIngressCapabilities: vi.fn(),
  fetchPanelDnsCertificate: vi.fn(),
  orderPanelDnsCertificate: vi.fn(),
  preflightHostnameIngress: vi.fn(),
  recheckIngressAccount: vi.fn(),
  removeHostnameIngress: vi.fn(),
  removeIngressAccount: vi.fn(),
  setEdgeGate: vi.fn(),
  updateHostnameIngress: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  ...api,
}))

function setup() {
  const client = createAppQueryClient()
  client.setDefaultOptions({ queries: { retry: false } })
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

function intervalOf(client: ReturnType<typeof createAppQueryClient>, key: readonly unknown[]) {
  const query = client.getQueryCache().find({ queryKey: key })
  const interval = (query?.options as { refetchInterval?: unknown }).refetchInterval
  return typeof interval === 'function' ? interval(query) : interval
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('ingress queries', () => {
  it('reads nothing while disabled', () => {
    const { wrapper } = setup()
    renderHook(
      () => {
        useIngressCapabilities({ enabled: false })
        useIngressAccounts({ enabled: false })
        useHostnameIngressStatus('h1', { enabled: false })
        usePanelDnsCertificate(null)
      },
      { wrapper }
    )
    expect(api.fetchIngressCapabilities).not.toHaveBeenCalled()
    expect(api.fetchIngressAccounts).not.toHaveBeenCalled()
    expect(api.fetchHostnameIngressStatus).not.toHaveBeenCalled()
    expect(api.fetchPanelDnsCertificate).not.toHaveBeenCalled()
  })

  it('polls status and DNS-01 state by phase and stage', async () => {
    api.fetchIngressCapabilities.mockResolvedValue({ ok: true, modes: [], gate: null })
    api.fetchIngressAccounts.mockResolvedValue({ ok: true, accounts: [] })
    api.fetchHostnameIngressStatus.mockResolvedValue({ phase: 'applying' })
    api.fetchPanelDnsCertificate.mockResolvedValue({ ok: true, stage: 'waiting-dns' })
    const { client, wrapper } = setup()
    const { result } = renderHook(
      () => ({
        capabilities: useIngressCapabilities(),
        accounts: useIngressAccounts(),
        status: useHostnameIngressStatus('h1'),
        dns: usePanelDnsCertificate('h1'),
      }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.dns.data).toBeTruthy())
    await waitFor(() => expect(result.current.status.data).toBeTruthy())
    expect(api.fetchHostnameIngressStatus).toHaveBeenCalledWith('h1')
    expect(api.fetchPanelDnsCertificate).toHaveBeenCalledWith('h1')
    expect(intervalOf(client, queryKeys.admin.hostnameIngressStatus('h1'))).toBe(15_000)
    expect(intervalOf(client, queryKeys.admin.panelDnsCertificate('h1'))).toBe(10_000)
  })

  it('writes a changed hostname into the list without a refetch', async () => {
    const before = { id: 'h1', host: 'a.example.com', mode: 'direct' } as InstanceHostnameRecord
    const other = { id: 'h2', host: 'b.example.com', mode: 'direct' } as InstanceHostnameRecord
    const after = { ...before, mode: 'cloudflare-tunnel' as const }
    api.updateHostnameIngress.mockResolvedValue({ ok: true, hostname: after })
    const { client, wrapper } = setup()
    client.setQueryData(queryKeys.admin.instanceHostnames, { ok: true, hostnames: [before, other] })
    const { result } = renderHook(() => useUpdateHostnameIngress(), { wrapper })
    await act(async () => {
      await result.current.run({ id: 'h1', patch: { mode: 'cloudflare-tunnel' } })
    })
    expect(api.updateHostnameIngress).toHaveBeenCalledWith('h1', { mode: 'cloudflare-tunnel' })
    expect(
      client.getQueryData<{ hostnames: InstanceHostnameRecord[] }>(
        queryKeys.admin.instanceHostnames
      )?.hostnames
    ).toEqual([after, other])
  })

  it('leaves the list alone when the change is refused', async () => {
    api.updateHostnameIngress.mockResolvedValue({ ok: false, error: 'Disconnect first.' })
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useUpdateHostnameIngress(), { wrapper })
    await act(async () => {
      await result.current.run({ id: 'h1', patch: { mode: 'direct' } })
    })
    expect(client.getQueryData(queryKeys.admin.instanceHostnames)).toBeUndefined()
  })

  it('runs every mutation and refreshes what it changed', async () => {
    for (const fn of Object.values(api)) fn.mockResolvedValue({ ok: true })
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(
      () => ({
        gate: useSetEdgeGate(),
        preflight: usePreflightHostnameIngress(),
        apply: useApplyHostnameIngress(),
        remove: useRemoveHostnameIngress(),
        add: useAddIngressAccount(),
        recheck: useRecheckIngressAccount(),
        removeAccount: useRemoveIngressAccount(),
        order: useOrderPanelDnsCertificate(),
      }),
      { wrapper }
    )
    await act(async () => {
      await result.current.gate.run(true)
      await result.current.preflight.run('h1')
      await result.current.apply.run({ id: 'h1', replaceExisting: true })
      await result.current.remove.run('h1')
      await result.current.add.run({ provider: 'cloudflare', label: 'Main', token: 'fake-token' })
      await result.current.recheck.run('a1')
      await result.current.removeAccount.run('a1')
      await result.current.order.run({ id: 'h1', retry: true })
    })
    expect(api.applyHostnameIngress).toHaveBeenCalledWith('h1', { replaceExisting: true })
    expect(api.orderPanelDnsCertificate).toHaveBeenCalledWith('h1', true)
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    expect(keys).toEqual(
      expect.arrayContaining([
        queryKeys.admin.ingressCapabilities,
        queryKeys.admin.hostnameIngressStatus('h1'),
        queryKeys.admin.ingressAccounts,
        queryKeys.admin.panelDnsCertificate('h1'),
      ])
    )
  })
})
