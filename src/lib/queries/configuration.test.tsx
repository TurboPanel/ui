// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import { useSaveBaseVariables, useSaveConfiguration } from '@/lib/queries/configuration'
import { goBackEdit, linuxUserEdit, removeVariableEdit, variableEdit } from '@/lib/v4/config-edits'
import { buildConfigViewModel } from '@/lib/v4/config-view-model'
import { stagingView } from '@/lib/v4/config-view-model.fixtures'

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
          services: {
            web: { command: 'x', 'x-turbopanel': { serviceKind: 'node', principal: 'website' } },
          },
        }),
      },
    },
  })
  api.fetchEnvironment.mockResolvedValue({ environment: { id: 'e1', options: null } })
  api.fetchVariables.mockResolvedValue({ variables: [] })
  for (const name of [
    'updateProject',
    'updateEnvironment',
    'createVariable',
    'updateVariable',
    'deleteVariable',
  ]) {
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
    const { result } = renderHook(() => useSaveConfiguration('o1', 'p1', 'e1'), {
      wrapper: wrapper(client),
    })
    api.fetchEnvironment.mockResolvedValue({
      environment: {
        id: 'e1',
        options: { compose: compose({ services: { web: { command: 'npm run staging' } } }) },
      },
    })
    const change = buildConfigViewModel({ envName: 'Staging', view: stagingView() }).changes.find(
      (item) => item.key === 'svc:web:command'
    )
    if (change === undefined) throw new Error('fixture lost the command change')
    const back = goBackEdit(change, { type: 'field', serviceName: 'web', path: ['command'] })
    const own = variableEdit({
      name: 'MODE',
      value: 'x',
      secret: false,
      forBuild: false,
      forRuntime: true,
      was: '',
    })
    const run = await result.current.run([back, own])
    expect(run).toMatchObject({ ok: true, value: { error: null, saved: 2, remaining: [] } })
    expect(api.updateEnvironment).toHaveBeenCalled()
    expect(api.updateProject).not.toHaveBeenCalled()
    expect(api.createVariable).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: 'e1', key: 'MODE', value: 'x' })
    )
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(8))
    const predicate = invalidate.mock.calls[0][0]?.predicate
    const org = queryKeys.org('o1')
    expect(predicate?.({ queryKey: org.environments.configView('other') } as never)).toBe(true)
    expect(predicate?.({ queryKey: org.environments.detail('other') } as never)).toBe(false)
  })

  it('saves the environment’s own change and sets its own variable without touching the Base', async () => {
    serverState()
    api.fetchVariables.mockImplementation((filter: Record<string, string>) =>
      Promise.resolve({
        variables:
          'environmentId' in filter
            ? [
                {
                  id: 'v-env',
                  key: 'A',
                  value: '2',
                  isSecret: false,
                  forBuild: false,
                  forRuntime: true,
                  bindingId: null,
                },
              ]
            : [
                {
                  id: 'v-proj',
                  key: 'A',
                  value: '1',
                  isSecret: false,
                  forBuild: false,
                  forRuntime: true,
                  bindingId: null,
                },
              ],
      })
    )
    const { result } = renderHook(() => useSaveConfiguration('o1', 'p1', 'e1'), {
      wrapper: wrapper(),
    })
    const user = linuxUserEdit({ serviceName: 'web', user: 'staging-web', was: 'website' })
    const edit = variableEdit({
      name: 'A',
      value: '3',
      secret: false,
      forBuild: false,
      forRuntime: true,
      was: '2',
    })
    await result.current.run([user, edit])
    expect(api.updateEnvironment).toHaveBeenCalledWith('e1', {
      options: { compose: expect.anything() },
    })
    expect(api.updateProject).not.toHaveBeenCalled()
    expect(api.updateVariable).toHaveBeenCalledWith('v-env', { value: '3' })
    expect(api.updateVariable).not.toHaveBeenCalledWith('v-proj', expect.anything())
    expect(api.deleteVariable).not.toHaveBeenCalled()
  })

  it('reports a load failure as unsaved, not as a thrown error', async () => {
    serverState()
    api.fetchProject.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useSaveConfiguration('o1', 'p1', 'e1'), {
      wrapper: wrapper(),
    })
    const user = linuxUserEdit({ serviceName: 'web', user: 'x', was: '' })
    const run = await result.current.run([user])
    expect(run).toMatchObject({
      ok: true,
      value: { error: 'offline', saved: 0, remaining: [user] },
    })
  })
})

describe('useSaveBaseVariables', () => {
  it('writes the project’s variables only and never reads or writes a compose', async () => {
    serverState()
    api.fetchVariables.mockResolvedValue({
      variables: [
        {
          id: 'v-old',
          key: 'OLD',
          value: '1',
          isSecret: false,
          forBuild: false,
          forRuntime: true,
          bindingId: null,
        },
      ],
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSaveBaseVariables('o1', 'p1'), {
      wrapper: wrapper(client),
    })
    const add = variableEdit({
      name: 'NEW',
      value: 'x',
      secret: false,
      forBuild: true,
      forRuntime: true,
      was: 'Not set',
    })
    const remove = removeVariableEdit({ name: 'OLD', was: '1', inBase: false })
    const run = await result.current.run([add, remove])
    expect(run).toMatchObject({ ok: true, value: { error: null, saved: 2, remaining: [] } })
    expect(api.fetchVariables).toHaveBeenCalledWith({ projectId: 'p1' })
    expect(api.createVariable).toHaveBeenCalledWith({
      projectId: 'p1',
      key: 'NEW',
      value: 'x',
      isSecret: false,
      forBuild: true,
      forRuntime: true,
    })
    expect(api.deleteVariable).toHaveBeenCalledWith('v-old')
    expect(api.fetchProject).not.toHaveBeenCalled()
    expect(api.fetchEnvironment).not.toHaveBeenCalled()
    expect(api.updateEnvironment).not.toHaveBeenCalled()
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4))
  })
})
