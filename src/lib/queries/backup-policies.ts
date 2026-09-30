import {
  createBackupPolicy,
  deleteBackupPolicy,
  fetchBackupPolicies,
  fetchBackupRuns,
  updateBackupPolicy,
  type CreateBackupPolicyBody,
  type UpdateBackupPolicyBody,
} from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'

/**
 * Scheduled backup policies for an environment's managed engine. No timer:
 * `nextRunAt` / `lastRun` change only when the host reports a run, and every
 * mutation below invalidates this list (it sits under the managed environment
 * key, so `invalidateEnvironmentManagedQueries` refreshes it too).
 */
export function useBackupPolicies(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).managed.backupPolicies(environmentId),
    queryFn: () => fetchBackupPolicies(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
  })
}

/** One policy's run history, newest first; opt-in so it loads only when the history is opened. */
export function useBackupRuns(
  orgId: string,
  environmentId: string,
  policyId: string | null,
  options?: Readonly<{ enabled?: boolean; limit?: number }>
) {
  const id = policyId ?? ''
  return useQuery({
    queryKey: queryKeys.org(orgId).managed.backupRuns(environmentId, id),
    queryFn: () => fetchBackupRuns(environmentId, id, options?.limit),
    enabled:
      (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0 && id.length > 0,
  })
}

function useInvalidateBackupPolicies(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).managed.backupPolicies(environmentId),
    })
}

export function useCreateBackupPolicy(orgId: string, environmentId: string) {
  const invalidate = useInvalidateBackupPolicies(orgId, environmentId)
  return useApiMutation({
    mutationFn: (body: CreateBackupPolicyBody) => createBackupPolicy(environmentId, body),
    onSuccess: invalidate,
  })
}

export function useUpdateBackupPolicy(orgId: string, environmentId: string) {
  const invalidate = useInvalidateBackupPolicies(orgId, environmentId)
  return useApiMutation({
    mutationFn: ({ policyId, body }: Readonly<{ policyId: string; body: UpdateBackupPolicyBody }>) =>
      updateBackupPolicy(environmentId, policyId, body),
    onSuccess: invalidate,
  })
}

export function useDeleteBackupPolicy(orgId: string, environmentId: string) {
  const invalidate = useInvalidateBackupPolicies(orgId, environmentId)
  return useApiMutation({
    mutationFn: (policyId: string) => deleteBackupPolicy(environmentId, policyId),
    onSuccess: invalidate,
  })
}
