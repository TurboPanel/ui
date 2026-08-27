import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTask,
  deleteTask,
  fetchTask,
  fetchTasks,
  updateTask,
  type TaskListFilter,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function useTasks(
  orgId: string,
  filter: TaskListFilter,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).tasks.list(filter),
    queryFn: () => fetchTasks(filter),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useTask(
  orgId: string,
  taskId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).tasks.detail(taskId),
    queryFn: () => fetchTask(taskId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && taskId.length > 0,
  })
}

export function useCreateTask(orgId: string, filter: TaskListFilter) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof createTask>[0]) => createTask(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).tasks.list(filter),
      })
    },
  })
}

export function useUpdateTask(orgId: string, filter: TaskListFilter) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      taskId,
      body,
    }: {
      taskId: string
      body: Parameters<typeof updateTask>[1]
    }) => updateTask(taskId, body),
    onSuccess: async (_data, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).tasks.list(filter),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).tasks.detail(vars.taskId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).tasks.all,
        }),
      ])
    },
  })
}

export function useDeleteTask(orgId: string, filter: TaskListFilter) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteTask,
    onSuccess: async (_data, taskId) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).tasks.list(filter),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).tasks.detail(taskId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).tasks.all,
        }),
      ])
    },
  })
}

export type { TaskListFilter }
