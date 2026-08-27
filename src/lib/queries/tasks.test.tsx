// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useCreateTask,
  useDeleteTask,
  useTask,
  useTasks,
  useUpdateTask,
} from '@/lib/queries/tasks'

const {
  fetchTasks,
  fetchTask,
  createTask,
  updateTask,
  deleteTask,
} = vi.hoisted(() => ({
  fetchTasks: vi.fn(),
  fetchTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchTasks,
    fetchTask,
    createTask,
    updateTask,
    deleteTask,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('tasks query hooks', () => {
  const orgId = 'org-1'
  const filter = { serviceId: 'svc-1' }

  it('useTasks loads the scoped list', async () => {
    fetchTasks.mockResolvedValueOnce({
      tasks: [{ id: 'task-1', name: 'nightly', serviceId: 'svc-1' }],
    })

    const { result } = renderHook(() => useTasks(orgId, filter), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchTasks).toHaveBeenCalledWith(filter)
    expect(result.current.data?.tasks).toHaveLength(1)
  })

  it('useTasks stays idle when disabled or org id is empty', () => {
    const disabled = renderHook(
      () => useTasks(orgId, filter, { enabled: false }),
      { wrapper: createWrapper() },
    )
    const empty = renderHook(() => useTasks('', filter), {
      wrapper: createWrapper(),
    })
    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchTasks).not.toHaveBeenCalled()
  })

  it('useTask loads a single row', async () => {
    fetchTask.mockResolvedValueOnce({
      task: { id: 'task-1', name: 'nightly', serviceId: 'svc-1' },
    })

    const { result } = renderHook(() => useTask(orgId, 'task-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchTask).toHaveBeenCalledWith('task-1')
  })

  it('useCreateTask returns ok/value on success', async () => {
    createTask.mockResolvedValueOnce({ ok: true, id: 'task-2' })

    const { result } = renderHook(() => useCreateTask(orgId, filter), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        serviceId: 'svc-1',
        name: 'nightly',
        schedule: '0 2 * * *',
        command: 'backup',
      }),
    ).resolves.toEqual({
      ok: true,
      value: { ok: true, id: 'task-2' },
    })
    expect(createTask).toHaveBeenCalledWith({
      serviceId: 'svc-1',
      name: 'nightly',
      schedule: '0 2 * * *',
      command: 'backup',
    })
  })

  it('useCreateTask returns mutation errors', async () => {
    createTask.mockRejectedValueOnce(new Error('task_name_in_use'))

    const { result } = renderHook(() => useCreateTask(orgId, filter), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        serviceId: 'svc-1',
        name: 'nightly',
        schedule: '0 2 * * *',
        command: 'backup',
      }),
    ).resolves.toEqual({ ok: false, error: 'task_name_in_use' })
  })

  it('useUpdateTask and useDeleteTask proxy mutations', async () => {
    updateTask.mockResolvedValueOnce({ ok: true })
    deleteTask.mockResolvedValueOnce({ ok: true })

    const updateHook = renderHook(() => useUpdateTask(orgId, filter), {
      wrapper: createWrapper(),
    })
    const deleteHook = renderHook(() => useDeleteTask(orgId, filter), {
      wrapper: createWrapper(),
    })

    await expect(
      updateHook.result.current.run({
        taskId: 'task-1',
        body: { isEnabled: false },
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(updateTask).toHaveBeenCalledWith('task-1', { isEnabled: false })
    await expect(
      deleteHook.result.current.run('task-1'),
    ).resolves.toMatchObject({ ok: true })
    expect(deleteTask.mock.calls[0]?.[0]).toBe('task-1')
  })

  it('useUpdateTask and useDeleteTask invalidate the detail query', async () => {
    fetchTask.mockResolvedValue({
      task: { id: 'task-1', name: 'nightly', serviceId: 'svc-1' },
    })
    updateTask.mockResolvedValueOnce({ ok: true })
    deleteTask.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = createWrapper(client)

    const detail = renderHook(() => useTask(orgId, 'task-1'), { wrapper })
    await waitFor(() => {
      expect(detail.result.current.isSuccess).toBe(true)
    })
    const afterLoad = fetchTask.mock.calls.length

    const updateHook = renderHook(() => useUpdateTask(orgId, filter), {
      wrapper,
    })
    await expect(
      updateHook.result.current.run({
        taskId: 'task-1',
        body: { isEnabled: false },
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).tasks.detail('task-1'),
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).tasks.list(filter),
    })
    await waitFor(() => {
      expect(fetchTask.mock.calls.length).toBeGreaterThan(afterLoad)
    })

    const afterUpdate = fetchTask.mock.calls.length
    const deleteHook = renderHook(() => useDeleteTask(orgId, filter), {
      wrapper,
    })
    await expect(deleteHook.result.current.run('task-1')).resolves.toMatchObject({
      ok: true,
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).tasks.detail('task-1'),
    })
    await waitFor(() => {
      expect(fetchTask.mock.calls.length).toBeGreaterThan(afterUpdate)
    })
  })
})
