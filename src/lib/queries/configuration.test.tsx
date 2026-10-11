// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import { useSaveConfiguration } from '@/lib/queries/configuration'
import { linuxUserEdit, variableEdit } from '@/lib/v4/config-edits'

const api = vi.hoisted(() => ({
  fetchProject: vi.fn(),
  fetchEnvironment: vi.fn(),
  fetchVariables: vi.fn(),
  updateProject: vi.fn(),
  updateEnvironment: vi.fn(),
  createVariable: vi.fn(),
  updateVariable: vi.fn(),
  deleteVariable: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  ...api,
}))

const compose = (data: Record<string, unknown>) => ({
  version: 1,
  data,
  presentation: { keyOrder: Object.keys(data), comments: {} },
})

function wrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function serverState() {
  api.fetchProject.mockResolvedValue({
    project: {
      id: 'p1',
      options: {
        containerNaming: 'custom',
        defaultServerId: 's1',
        compose: compose({
          services: { web: { command: 'x', 'x-turbopanel': { serviceKind: 'node', principal: 'website' } } },
        }),
      },
    },
  })
  api.fetchEnvironment.mockResolvedValue({ environment: { id: 'e1', options: null } })
  api.fetchVariables.mockResolvedValue({ variables: [] })
  for (const name of ['updateProject', 'updateEnvironment', 'createVariable', 'updateVariable', 'deleteVariable']) {
    api[name as keyof typeof api].mockResolvedValue({ ok: true })
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useSaveConfiguration', () => {
  it('loads fresh data, saves in order, and keeps the project’s other options', async () => {
    serverState()
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSaveConfiguration('o1', 'p1', 'e1'), { wrapper: wrapper(client) })
    const base = linuxUserEdit({ serviceName: 'web', user: 'shared', was: 'website', scope: 'base' })
    const own = variableEdit({ name: 'MODE', value: 'x', secret: false, forBuild: false, forRuntime: true, was: '', scope: 'environment' })
    const run = await result.current.run([base, own])
    expect(run).toMatchObject({ ok: true, value: { error: null, saved: 2, remaining: [] } })
    expect(api.updateProject).toHaveBeenCalledWith('p1', {
      options: expect.objectContaining({ containerNaming: 'custom', defaultServerId: 's1' }),
    })
    expect(api.createVariable).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: 'e1', key: 'MODE', value: 'x' })
    )
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(8))
    const predicate = invalidate.mock.calls[0][0]?.predicate
    const org = queryKeys.org('o1')
    expect(predicate?.({ queryKey: org.environments.configView('other') } as never)).toBe(true)
    expect(predicate?.({ queryKey: org.environments.detail('other') } as never)).toBe(false)
  })

  it('saves the environment’s own change and the other variable calls', async () => {
    serverState()
    api.fetchVariables.mockImplementation((filter: Record<string, string>) =>
      Promise.resolve({
        variables:
          'environmentId' in filter
            ? [{ id: 'v-env', key: 'A', value: '2', isSecret: false, forBuild: false, forRuntime: true, bindingId: null }]
            : [{ id: 'v-proj', key: 'A', value: '1', isSecret: false, forBuild: false, forRuntime: true, bindingId: null }],
      })
    )
    const { result } = renderHook(() => useSaveConfiguration('o1', 'p1', 'e1'), { wrapper: wrapper() })
    const user = linuxUserEdit({ serviceName: 'web', user: 'staging-web', was: 'website', scope: 'environment' })
    const edit = variableEdit({ name: 'A', value: '3', secret: false, forBuild: false, forRuntime: true, was: '2', scope: 'base' })
    await result.current.run([user, edit])
    expect(api.updateEnvironment).toHaveBeenCalledWith('e1', { options: { compose: expect.anything() } })
    expect(api.updateVariable).toHaveBeenCalledWith('v-proj', { value: '3' })
    expect(api.deleteVariable).toHaveBeenCalledWith('v-env')
  })

  it('reports a load failure as unsaved, not as a thrown error', async () => {
    serverState()
    api.fetchProject.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useSaveConfiguration('o1', 'p1', 'e1'), { wrapper: wrapper() })
    const user = linuxUserEdit({ serviceName: 'web', user: 'x', was: '', scope: 'environment' })
    const run = await result.current.run([user])
    expect(run).toMatchObject({ ok: true, value: { error: 'offline', saved: 0, remaining: [user] } })
  })
})
