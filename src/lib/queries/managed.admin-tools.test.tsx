// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import { useDeployEnvironmentById } from '@/lib/queries/environments'
import {
  useCreateManagedAdminTool,
  useManagedAdminTools,
  useRemoveManagedAdminTool,
  useResetManagedAdminToolPassword,
  useUpdateManagedAdminTool,
} from '@/lib/queries/managed'

const api = vi.hoisted(() => ({
  fetchManagedAdminTools: vi.fn(),
  createManagedAdminTool: vi.fn(),
  resetManagedAdminToolPassword: vi.fn(),
  updateManagedAdminTool: vi.fn(),
  removeManagedAdminTool: vi.fn(),
  deployEnvironment: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  ...api,
}))

const orgId = 'org-1'
const environmentId = 'env-1'

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('admin tool hooks', () => {
  it('reads the tools and stays idle when disabled', async () => {
    api.fetchManagedAdminTools.mockResolvedValueOnce({ tools: [] })
    const { result } = renderHook(() => useManagedAdminTools(orgId, environmentId), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchManagedAdminTools).toHaveBeenCalledWith(environmentId)
    const idle = renderHook(() => useManagedAdminTools(orgId, environmentId, { enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(idle.result.current.fetchStatus).toBe('idle')
  })

  it('answers null on 404 and 403, and passes other failures through', async () => {
    for (const status of [404, 403]) {
      api.fetchManagedAdminTools.mockReset()
      api.fetchManagedAdminTools.mockRejectedValue(new Error(`HTTP ${status}: refused`))
      const { result } = renderHook(() => useManagedAdminTools(orgId, environmentId), {
        wrapper: createWrapper(),
      })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toBeNull()
    }
    api.fetchManagedAdminTools.mockReset()
    api.fetchManagedAdminTools.mockRejectedValue(new Error('HTTP 500: boom'))
    const client = createAppQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })
    const failing = renderHook(() => useManagedAdminTools(orgId, environmentId), {
      wrapper: createWrapper(client),
    })
    await waitFor(() => expect(failing.result.current.isError).toBe(true))
  })

  it('add keeps no password and refreshes tools, logins and projects', async () => {
    api.createManagedAdminTool.mockResolvedValueOnce({
      ok: true,
      projectId: 'p1',
      environmentId: 'e2',
      loginName: 'adminer_abc123',
      loginPassword: 'once',
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useCreateManagedAdminTool(orgId, environmentId), {
      wrapper: createWrapper(client),
    })
    const body = { tool: 'adminer', hostname: 'db.example.com', access: 'admin' } as const
    await expect(result.current.run(body)).resolves.toMatchObject({ ok: true })
    expect(api.createManagedAdminTool).toHaveBeenCalledWith(environmentId, body)
    expect(result.current.data).toBeUndefined()
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).managed.adminTools(environmentId),
      })
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).managed.users(environmentId),
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.org(orgId).projects.all })
  })

  it('reset keeps no password', async () => {
    api.resetManagedAdminToolPassword.mockResolvedValueOnce({
      ok: true,
      loginName: 'adminer_abc123',
      loginPassword: 'fresh',
    })
    const { result } = renderHook(() => useResetManagedAdminToolPassword(orgId, environmentId), {
      wrapper: createWrapper(),
    })
    await expect(result.current.run('p1')).resolves.toMatchObject({ ok: true })
    expect(api.resetManagedAdminToolPassword).toHaveBeenCalledWith(environmentId, 'p1')
    expect(result.current.data).toBeUndefined()
  })

  it('update and remove call the routes with the project and the typed name', async () => {
    api.updateManagedAdminTool.mockResolvedValueOnce({ ok: true, environmentId: 'e2' })
    api.removeManagedAdminTool.mockResolvedValueOnce({ ok: true })
    const wrapper = createWrapper()
    const update = renderHook(() => useUpdateManagedAdminTool(orgId, environmentId), { wrapper })
    await expect(update.result.current.run('p1')).resolves.toMatchObject({ ok: true })
    expect(api.updateManagedAdminTool).toHaveBeenCalledWith(environmentId, 'p1')
    const remove = renderHook(() => useRemoveManagedAdminTool(orgId, environmentId), { wrapper })
    await expect(
      remove.result.current.run({ projectId: 'p1', confirmName: 'Main Adminer' })
    ).resolves.toMatchObject({ ok: true })
    expect(api.removeManagedAdminTool).toHaveBeenCalledWith(environmentId, 'p1', 'Main Adminer')
  })

  it('deploys the environment it is given and refreshes its deploy history', async () => {
    api.deployEnvironment.mockResolvedValueOnce({ ok: true, commandId: 'c1' })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useDeployEnvironmentById(orgId), {
      wrapper: createWrapper(client),
    })
    await expect(result.current.run('e-tool')).resolves.toMatchObject({ ok: true })
    expect(api.deployEnvironment).toHaveBeenCalledWith('e-tool')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).environments.detail('e-tool'),
      })
    })
  })
})
