import {
    addManagedReplica,
    applyEnvironmentManaged,
    createEnvironmentManaged,
    createManagedBackup,
    createManagedDatabase,
    createManagedUser,
    deleteEnvironmentManaged,
    deleteManagedBackup,
    deleteManagedDatabase,
    deleteManagedUser,
    fetchEnvironmentManaged,
    fetchManagedBackups,
    fetchManagedDatabases,
    fetchManagedLogs,
    fetchManagedStatus,
    fetchManagedUsers,
    fetchOrganizationCa,
    fetchOrganizationManaged,
    isForbiddenError,
    promoteManagedDisasterRecovery,
    promoteManagedMember,
    removeManagedMember,
    restoreManagedBackup,
    rotateManagedRootPassword,
    rotateManagedUserPassword,
    runManagedLifecycle,
    updateEnvironmentManaged,
    updateManagedMember,
} from '@/lib/instance-api'
import type { ManagedMemberRecord } from '@/lib/managed-services'
import { queryKeys, useApiMutation, type ApiMutationResult } from '@/lib/query-client'
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
} from '@tanstack/react-query'

const MANAGED_STATUS_POLL_MS = 5000

function isManagedStatusInFlight(status: string | null | undefined): boolean {
  return status === 'provisioning' || status === 'applying'
}

function invalidateManagedEnvironment(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  environmentId: string
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).managed.environment(environmentId),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).managed.status(environmentId),
    }),
  ])
}

export function useOrganizationManaged(
  orgId: string,
  options?: Readonly<{
    enabled?: boolean
    refetchInterval?: number | false
    staleTime?: number
  }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).managed.orgList,
    queryFn: () => fetchOrganizationManaged(orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime,
  })
}

export function useEnvironmentManaged(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).managed.environment(environmentId),
    queryFn: () => fetchEnvironmentManaged(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
  })
}

export function useManagedStatus(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).managed.status(environmentId),
    queryFn: () => fetchManagedStatus(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!isManagedStatusInFlight(status)) return false
      return MANAGED_STATUS_POLL_MS
    },
  })
}

export function useManagedUsers(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).managed.users(environmentId),
    queryFn: () => fetchManagedUsers(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
  })
}

export function useManagedDatabases(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).managed.databases(environmentId),
    queryFn: () => fetchManagedDatabases(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
  })
}

export function useManagedBackups(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).managed.backups(environmentId),
    queryFn: () => fetchManagedBackups(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
  })
}

/** Disabled by default — callers opt in and refetch explicitly. */
export function useManagedLogs(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean; tail?: number }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).managed.logs(environmentId),
    queryFn: () => fetchManagedLogs(environmentId, options?.tail),
    enabled: (options?.enabled ?? false) && orgId.length > 0 && environmentId.length > 0,
  })
}

type ShowOnceSecretMutation<TData, TVariables> = Omit<
  UseMutationResult<TData, Error, TVariables>,
  'data' | 'mutateAsync'
> & {
  /** Always cleared after success — secrets live only in the caller's local state. */
  data: undefined
  actionError: string | null
  run: (variables: TVariables) => Promise<ApiMutationResult<TData>>
  mutateAsync: (variables: TVariables) => Promise<TData>
}

/**
 * Show-once secret mutations must not leave plaintext in React Query mutation
 * state. Returns the full API payload to the caller, then immediately resets.
 */
function useShowOnceSecretMutation<TData, TVariables = void>(
  mutation: UseMutationResult<TData, Error, TVariables>,
  fallbackError: string
): ShowOnceSecretMutation<TData, TVariables> {
  let actionError: string | null = null
  if (mutation.error && !isForbiddenError(mutation.error)) {
    actionError = mutation.error instanceof Error ? mutation.error.message : fallbackError
  }

  const run = async (variables: TVariables): Promise<ApiMutationResult<TData>> => {
    try {
      const value = await mutation.mutateAsync(variables)
      mutation.reset()
      return { ok: true, value }
    } catch (err) {
      if (isForbiddenError(err)) {
        return { ok: false, error: null }
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : fallbackError,
      }
    }
  }

  const mutateAsync = async (variables: TVariables): Promise<TData> => {
    const value = await mutation.mutateAsync(variables)
    // Clear mutation cache after success so plaintext secrets never linger in
    // React Query Devtools / mutation.state. Errors stay for actionError.
    mutation.reset()
    return value
  }

  return {
    ...mutation,
    data: undefined,
    actionError,
    run,
    mutateAsync,
  }
}

export function useCreateEnvironmentManaged(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (body?: Parameters<typeof createEnvironmentManaged>[1]) =>
      createEnvironmentManaged(environmentId, body),
    onSuccess: () =>
      Promise.all([
        invalidateManagedEnvironment(queryClient, orgId, environmentId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).managed.orgList,
        }),
      ]),
  })
  return useShowOnceSecretMutation(mutation, 'Failed to create managed service')
}

export function useUpdateEnvironmentManaged(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof updateEnvironmentManaged>[1]) =>
      updateEnvironmentManaged(environmentId, body),
    onSuccess: () => invalidateManagedEnvironment(queryClient, orgId, environmentId),
  })
}

export function useApplyEnvironmentManaged(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => applyEnvironmentManaged(environmentId),
    onSuccess: () =>
      Promise.all([
        invalidateManagedEnvironment(queryClient, orgId, environmentId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
}

export function useRunManagedLifecycle(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (action: Parameters<typeof runManagedLifecycle>[1]) =>
      runManagedLifecycle(environmentId, action),
    onSuccess: () =>
      Promise.all([
        invalidateManagedEnvironment(queryClient, orgId, environmentId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
}

export function useDeleteEnvironmentManaged(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => deleteEnvironmentManaged(environmentId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).managed.all,
      }),
  })
}

export function useDeleteEnvironmentManagedMutation(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (environmentId: string) => deleteEnvironmentManaged(environmentId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).managed.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
}

export function useRotateManagedRootPassword(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => rotateManagedRootPassword(environmentId),
    onSuccess: () =>
      Promise.all([
        invalidateManagedEnvironment(queryClient, orgId, environmentId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
  return useShowOnceSecretMutation(mutation, 'Failed to rotate root password')
}

export function useCreateManagedUser(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof createManagedUser>[1]) =>
      createManagedUser(environmentId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).managed.users(environmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
  return useShowOnceSecretMutation(mutation, 'Failed to create managed user')
}

export function useDeleteManagedUser(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (principalId: string) => deleteManagedUser(environmentId, principalId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).managed.users(environmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
}

export function useCreateManagedDatabase(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof createManagedDatabase>[1]) =>
      createManagedDatabase(environmentId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).managed.databases(environmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
}

export function useDeleteManagedDatabase(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (name: string) => deleteManagedDatabase(environmentId, name),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).managed.databases(environmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
}

export function useCreateManagedBackup(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body?: Parameters<typeof createManagedBackup>[1]) =>
      createManagedBackup(environmentId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).managed.backups(environmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
}

export function useDeleteManagedBackup(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (backupId: string) => deleteManagedBackup(environmentId, backupId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).managed.backups(environmentId),
      }),
  })
}

export function useRestoreManagedBackup(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (backupId: string) => restoreManagedBackup(environmentId, backupId),
    onSuccess: () =>
      Promise.all([
        invalidateManagedEnvironment(queryClient, orgId, environmentId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
}

/**
 * Resolve cluster member identity from detail (`id`) or legacy status
 * (`memberId`). Empty / missing ids are dropped so merges never invent ghosts.
 */
function memberIdentityId(member: { id?: string | null; memberId?: string | null }): string | null {
  if (typeof member.id === 'string' && member.id.length > 0) return member.id
  if (typeof member.memberId === 'string' && member.memberId.length > 0) {
    return member.memberId
  }
  return null
}

/**
 * Merge status snapshot members (fresh lag/health) onto detail identity.
 * Prefer `status.members` per member id; fall back to detail for missing rows.
 * No separate members poll — status only refetches while provisioning/applying.
 *
 * Status historically emitted `memberId` instead of `id`. Treating that as a
 * separate keyless row produced a ghost second Primary and a React key warning.
 */
export function mergeManagedMembers(
  detailMembers: readonly ManagedMemberRecord[] | null | undefined,
  statusMembers: readonly unknown[] | null | undefined
): ManagedMemberRecord[] {
  const byId = new Map<string, ManagedMemberRecord>()
  for (const member of detailMembers ?? []) {
    const id = memberIdentityId(member)
    if (!id) continue
    byId.set(id, { ...member, id })
  }
  for (const raw of statusMembers ?? []) {
    if (typeof raw !== 'object' || raw === null) continue
    const statusRow = raw as ManagedMemberRecord & { memberId?: string }
    const id = memberIdentityId(statusRow)
    if (!id) continue
    const prior = byId.get(id)
    byId.set(id, prior ? { ...prior, ...statusRow, id } : { ...statusRow, id })
  }
  return [...byId.values()].sort((a, b) => {
    if (a.role !== b.role) {
      return a.role === 'primary' ? -1 : 1
    }
    return a.ordinal - b.ordinal
  })
}

/**
 * When the cluster row is already terminal-failed, in-flight member labels
 * (`provisioning` / `applying`) are stale — older applies only flipped
 * `managed.status`. Align display so Cluster does not claim work is ongoing.
 */
export function alignMemberStatusesWithCluster(
  members: readonly ManagedMemberRecord[],
  clusterStatus: string | null | undefined
): ManagedMemberRecord[] {
  if (clusterStatus !== 'failed') {
    return [...members]
  }
  return members.map((member) => {
    if (member.status === 'provisioning' || member.status === 'applying') {
      return { ...member, status: 'failed' }
    }
    return member
  })
}

function invalidateManagedMembers(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  environmentId: string
) {
  return Promise.all([
    invalidateManagedEnvironment(queryClient, orgId, environmentId),
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).managed.members(environmentId),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).commands.all,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).managed.orgList,
    }),
  ])
}

export function useAddManagedReplica(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: {
      serverId: string
      replicaClass?: 'failover' | 'read'
      readEligible?: boolean
    }) => addManagedReplica(environmentId, body),
    onSuccess: () => invalidateManagedMembers(queryClient, orgId, environmentId),
  })
}

export function useUpdateManagedMemberReadEligible(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: { memberId: string; readEligible: boolean }) =>
      updateManagedMember(environmentId, input.memberId, {
        readEligible: input.readEligible,
      }),
    onSuccess: () => invalidateManagedMembers(queryClient, orgId, environmentId),
  })
}

export function useUpdateManagedMemberReplicaClass(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: { memberId: string; replicaClass: 'failover' | 'read' }) =>
      updateManagedMember(environmentId, input.memberId, {
        replicaClass: input.replicaClass,
      }),
    onSuccess: () => invalidateManagedMembers(queryClient, orgId, environmentId),
  })
}

export function useRemoveManagedMember(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (memberId: string) => removeManagedMember(environmentId, memberId),
    onSuccess: () => invalidateManagedMembers(queryClient, orgId, environmentId),
  })
}

export function usePromoteManagedMember(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: { memberId: string; force?: boolean }) =>
      promoteManagedMember(environmentId, input.memberId, {
        ...(input.force ? { force: true } : {}),
      }),
    onSuccess: () => invalidateManagedMembers(queryClient, orgId, environmentId),
  })
}

export function usePromoteManagedDisasterRecovery(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (memberId: string) =>
      promoteManagedDisasterRecovery(environmentId, {
        memberId,
        confirm: true,
      }),
    onSuccess: () => invalidateManagedMembers(queryClient, orgId, environmentId),
  })
}

export function useRotateManagedUserPassword(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (principalId: string) => rotateManagedUserPassword(environmentId, principalId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).managed.users(environmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).bindings.all,
        }),
      ]),
  })
  return useShowOnceSecretMutation(mutation, 'Failed to rotate user password')
}

/** Long-lived org CA — no polling. */
export function useOrganizationCa(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).tlsCa,
    queryFn: () => fetchOrganizationCa(),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    staleTime: 60 * 60 * 1000,
  })
}
