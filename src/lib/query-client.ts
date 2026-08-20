import {
  MutationCache,
  QueryCache,
  QueryClient,
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query'
import {
  canQueryControlPlane,
  useControlPlaneStore,
} from '@/lib/control-plane-accounts'
import {
  checkPermission,
  fetchInstallStatus,
  isForbiddenError,
  resolveResourceId,
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
  if (forbiddenRecoveryInFlight) {
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
  | { ok: false; error: string | null }

/**
 * Thin `useMutation` wrapper that folds the `{ ok, error }` messaging shape
 * formerly produced by `withGuardedAction`. Forbidden errors are routed by the
 * global QueryClient caches — callers just render `isPending` / `error`.
 */
export function useApiMutation<TData, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, Error, TVariables, TContext> &
    Readonly<{ fallbackError?: string }>,
): UseMutationResult<TData, Error, TVariables, TContext> & {
  actionError: string | null
  run: (variables: TVariables) => Promise<ApiMutationResult<TData>>
} {
  const { fallbackError = 'Request failed', ...mutationOptions } = options
  const mutation = useMutation(mutationOptions)

  let actionError: string | null = null
  if (mutation.error && !isForbiddenError(mutation.error)) {
    actionError =
      mutation.error instanceof Error
        ? mutation.error.message
        : fallbackError
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
          return { ok: false, error: null }
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : fallbackError,
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
 * Client-side display hint for whether the current user likely has a permission
 * on a resource. This is **not** a security boundary — the API enforces authz.
 */
export function useCan(
  entityType: string | null,
  entityId: string,
  permissionKey: PermissionKey,
): boolean {
  const resourceQuery = useQuery({
    queryKey: queryKeys.auth.resourceId(entityType ?? '', entityId),
    queryFn: () =>
      resolveResourceId(
        entityType as Parameters<typeof resolveResourceId>[0],
        entityId,
      ),
    enabled: entityType !== null && entityId.length > 0,
    staleTime: 60_000,
  })

  const resourceId = resourceQuery.data?.resourceId ?? ''

  const canQuery = useQuery({
    queryKey: queryKeys.auth.can(resourceId, permissionKey),
    queryFn: async () => {
      const result = await checkPermission(resourceId, permissionKey)
      return result.allowed
    },
    enabled: resourceId.length > 0,
    staleTime: 30_000,
  })

  if (entityType === null || resourceQuery.isLoading || canQuery.isLoading) {
    return false
  }

  return canQuery.data ?? false
}
