import {
  MutationCache,
  QueryCache,
  QueryClient,
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query'
import { canQueryControlPlane, useControlPlaneStore } from '@/lib/control-plane-accounts'
import {
  checkPermission,
  fetchInstallStatus,
  isForbiddenError,
  resolveResourceId,
  type AccessScopeKind,
  type PermissionKey,
} from '@/lib/instance-api'
import { queryKeys } from '@/lib/query-keys'

export {
  ACCESS_MANAGEMENT_PERMISSION,
  getAccessManagementPermissionKey,
  isVisibilityQuery,
  queryKeys,
} from '@/lib/query-keys'

type ForbiddenHandler = (error: unknown) => void | Promise<void>

let forbiddenHandler: ForbiddenHandler | null = null
/** Coalesce overlapping 403 recoveries into a single in-flight promise. */
let forbiddenRecoveryInFlight: Promise<void> | null = null

/**
 * Register the app-wide 403 handler (typically `AuthProvider.handleUnauthorized`).
 * Called from an effect inside `AuthProvider` so the QueryClient (which wraps
 * Auth) can still route forbidden errors without a circular provider dependency.
 */
export function setForbiddenHandler(handler: ForbiddenHandler | null): void {
  forbiddenHandler = handler
}

async function routeForbiddenError(error: unknown): Promise<void> {
  if (!isForbiddenError(error) || !forbiddenHandler) return
  if (forbiddenRecoveryInFlight !== null) {
    await forbiddenRecoveryInFlight
    return
  }
  const run = (async () => {
    try {
      await forbiddenHandler(error)
    } catch {
      // Recovery is best-effort; the caller already observed the 403.
    }
  })()
  forbiddenRecoveryInFlight = run
  try {
    await run
  } finally {
    if (forbiddenRecoveryInFlight === run) {
      forbiddenRecoveryInFlight = null
    }
  }
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        void routeForbiddenError(error)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        void routeForbiddenError(error)
      },
    }),
    defaultOptions: {
      queries: {
        retry: 2,
        staleTime: 5 * 60 * 1000,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export type ApiMutationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: string | null
      /** The thrown value, for callers that need a typed refusal's fields rather than its message. */
      cause?: unknown
    }

/**
 * Thin `useMutation` wrapper that folds the `{ ok, error }` messaging shape
 * formerly produced by `withGuardedAction`. Forbidden errors are routed by the
 * global QueryClient caches — callers just render `isPending` / `error`.
 */
export function useApiMutation<TData, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, Error, TVariables, TContext> &
    Readonly<{ fallbackError?: string }>
): UseMutationResult<TData, Error, TVariables, TContext> & {
  actionError: string | null
  run: (variables: TVariables) => Promise<ApiMutationResult<TData>>
} {
  const { fallbackError = 'Request failed', ...mutationOptions } = options
  const mutation = useMutation(mutationOptions)

  let actionError: string | null = null
  if (mutation.error && !isForbiddenError(mutation.error)) {
    actionError = mutation.error instanceof Error ? mutation.error.message : fallbackError
  }

  return {
    ...mutation,
    actionError,
    run: async (variables: TVariables): Promise<ApiMutationResult<TData>> => {
      try {
        const value = await mutation.mutateAsync(variables)
        return { ok: true, value }
      } catch (err) {
        if (isForbiddenError(err)) {
          return { ok: false, error: null, cause: err }
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : fallbackError,
          cause: err,
        }
      }
    },
  }
}

export function useAuthStatus() {
  useControlPlaneStore()
  return useQuery({
    queryKey: queryKeys.auth.status,
    queryFn: fetchInstallStatus,
    staleTime: 30_000,
    retry: false,
    enabled: canQueryControlPlane(),
  })
}

/**
 * Kinds `GET /access/resource-id` resolves (the grant-management scopes). Every
 * other entity — a server, a managed cluster — is checked by its own UUID,
 * which `GET /access/check` takes as the resource id directly.
 */
function needsResourceIdLookup(entityType: string): boolean {
  return entityType === 'organization' || entityType === 'team'
}

/**
 * Client-side display hint for whether the current user likely has a permission
 * on a resource. This is **not** a security boundary — the API enforces authz.
 */
export function useCanState(
  entityType: string | null,
  entityId: string,
  permissionKey: PermissionKey
): Readonly<{ allowed: boolean; loading: boolean }> {
  const lookup = entityType !== null && needsResourceIdLookup(entityType)
  const resourceQuery = useQuery({
    queryKey: queryKeys.auth.resourceId(entityType ?? '', entityId),
    queryFn: () => resolveResourceId(entityType as AccessScopeKind, entityId),
    enabled: lookup && entityId.length > 0,
    staleTime: 60_000,
  })

  let resourceId = ''
  if (lookup) resourceId = resourceQuery.data?.resourceId ?? ''
  else if (entityType !== null) resourceId = entityId

  const canQuery = useQuery({
    queryKey: queryKeys.auth.can(resourceId, permissionKey),
    queryFn: async () => {
      const result = await checkPermission(resourceId, permissionKey)
      return result.allowed
    },
    enabled: resourceId.length > 0,
    staleTime: 30_000,
  })

  if (entityType === null) return { allowed: false, loading: false }
  if (resourceQuery.isLoading || canQuery.isLoading) return { allowed: false, loading: true }
  return { allowed: canQuery.data ?? false, loading: false }
}

/** Whether the signed-in person holds the permission; false while the answer is loading. */
export function useCan(
  entityType: string | null,
  entityId: string,
  permissionKey: PermissionKey
): boolean {
  return useCanState(entityType, entityId, permissionKey).allowed
}
