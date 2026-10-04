import {
  createBackupPolicy,
  deleteBackupPolicy,
  fetchBackupPolicies,
  fetchBackupRuns,
  updateBackupPolicy,
  type BackupPolicyTarget,
  type CreateBackupPolicyBody,
  type UpdateBackupPolicyBody,
} from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'

function policiesKey(orgId: string, target: BackupPolicyTarget) {
  const keys = queryKeys.org(orgId)
  return typeof target === 'string'
    ? keys.managed.backupPolicies(target)
    : keys.storage.copyBackupPolicies(target.copyId)
}

function runsKey(orgId: string, target: BackupPolicyTarget, policyId: string) {
  const keys = queryKeys.org(orgId)
  return typeof target === 'string'
    ? keys.managed.backupRuns(target, policyId)
    : keys.storage.copyBackupRuns(target.copyId, policyId)
}

function targetReady(target: BackupPolicyTarget): boolean {
  return typeof target === 'string'
    ? target.length > 0
    : target.storageId.length > 0 && target.copyId.length > 0
}

/**
 * Scheduled backup policies for an environment's managed engine, or for one
 * storage copy (pass `{ storageId, copyId }` instead of the environment id). No timer:
 * `nextRunAt` / `lastRun` change only when the host reports a run, and every
 * mutation below invalidates this list (it sits under the managed environment
 * key, so `invalidateEnvironmentManagedQueries` refreshes it too).
 */
export function useBackupPolicies(
  orgId: string,
  target: BackupPolicyTarget,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: policiesKey(orgId, target),
    queryFn: () => fetchBackupPolicies(target),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && targetReady(target),
  })
}

/** One policy's run history, newest first; opt-in so it loads only when the history is opened. */
export function useBackupRuns(
  orgId: string,
  target: BackupPolicyTarget,
  policyId: string | null,
  options?: Readonly<{ enabled?: boolean; limit?: number }>
) {
  const id = policyId ?? ''
  return useQuery({
    queryKey: runsKey(orgId, target, id),
    queryFn: () => fetchBackupRuns(target, id, options?.limit),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && targetReady(target) && id.length > 0,
  })
}

function useInvalidateBackupPolicies(orgId: string, target: BackupPolicyTarget) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: policiesKey(orgId, target) })
}

export function useCreateBackupPolicy(orgId: string, target: BackupPolicyTarget) {
  const invalidate = useInvalidateBackupPolicies(orgId, target)
  return useApiMutation({
    mutationFn: (body: CreateBackupPolicyBody) => createBackupPolicy(target, body),
    onSuccess: invalidate,
  })
}

export function useUpdateBackupPolicy(orgId: string, target: BackupPolicyTarget) {
  const invalidate = useInvalidateBackupPolicies(orgId, target)
  return useApiMutation({
    mutationFn: ({
      policyId,
      body,
    }: Readonly<{ policyId: string; body: UpdateBackupPolicyBody }>) =>
      updateBackupPolicy(target, policyId, body),
    onSuccess: invalidate,
  })
}

export function useDeleteBackupPolicy(orgId: string, target: BackupPolicyTarget) {
  const invalidate = useInvalidateBackupPolicies(orgId, target)
  return useApiMutation({
    mutationFn: (policyId: string) => deleteBackupPolicy(target, policyId),
    onSuccess: invalidate,
  })
}
