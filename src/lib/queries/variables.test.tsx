// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateVariable,
  useDeleteVariable,
  useUpdateVariable,
  useVariables,
} from '@/lib/queries/variables'

const {
  fetchVariables,
  createVariable,
  updateVariable,
  deleteVariable,
} = vi.hoisted(() => ({
  fetchVariables: vi.fn(),
  createVariable: vi.fn(),
  updateVariable: vi.fn(),
  deleteVariable: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchVariables,
  createVariable,
  updateVariable,
  deleteVariable,
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('variables query hooks', () => {
  const orgId = 'org-1'
  const filter = { projectId: 'p1' }

  it('useVariables loads scoped variables', async () => {
    fetchVariables.mockResolvedValueOnce({
      variables: [{ id: 'var-1', key: 'PORT', value: '5432' }],
    })

    const { result } = renderHook(
      () => useVariables(orgId, filter),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchVariables).toHaveBeenCalledWith(filter)
    expect(result.current.data?.variables).toHaveLength(1)
  })

  it('useCreateVariable returns ok/value on success', async () => {
    createVariable.mockResolvedValueOnce({ ok: true, id: 'var-2' })

    const { result } = renderHook(() => useCreateVariable(orgId, filter), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ key: 'PORT', value: '8080' }),
    ).resolves.toEqual({ ok: true, value: { ok: true, id: 'var-2' } })
  })

  it('useUpdateVariable and useDeleteVariable proxy mutations', async () => {
    updateVariable.mockResolvedValueOnce({ ok: true })
    deleteVariable.mockResolvedValueOnce({ ok: true })

    const updateHook = renderHook(() => useUpdateVariable(orgId, filter), {
      wrapper: createWrapper(),
    })
    const deleteHook = renderHook(() => useDeleteVariable(orgId, filter), {
      wrapper: createWrapper(),
    })

    await expect(
      updateHook.result.current.run({
        variableId: 'var-1',
        body: { value: '9090' },
      }),
    ).resolves.toMatchObject({ ok: true })
    await expect(
      deleteHook.result.current.run('var-1'),
    ).resolves.toMatchObject({ ok: true })
  })
})
