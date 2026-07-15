import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  checkPermission,
  fetchInstallStatus,
  isForbiddenError,
  resolveResourceId,
  type PermissionKey,
} from '@/lib/instance-api'
import { useAuth } from '@/lib/auth-context'
import {
  authQueryKeys,
  visibilityQueryKeys,
} from '@/lib/visibility-queries'

export { authQueryKeys } from '@/lib/visibility-queries'
export {
  getAccessManagementPermissionKey,
  isVisibilityQuery,
  visibilityQueryKeys,
} from '@/lib/visibility-queries'

export function useAuthStatus() {
  return useQuery({
    queryKey: authQueryKeys.authStatus,
    queryFn: fetchInstallStatus,
    staleTime: 30_000,
  })
}

/** On 403, refresh session and invalidate visibility queries without clearing auth first. */
export function useForbiddenRecovery(error: unknown) {
  const { handleUnauthorized } = useAuth()

  useEffect(() => {
    if (error && isForbiddenError(error)) {
      handleUnauthorized().catch(() => {
        // Recovery is best-effort; the caller already observed the 403.
      })
    }
  }, [error, handleUnauthorized])
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
    queryKey: ['resource-id', entityType ?? '', entityId],
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
    queryKey: visibilityQueryKeys.can(resourceId, permissionKey),
    queryFn: async () => {
      const result = await checkPermission(resourceId, permissionKey)
      return result.allowed
    },
    enabled: resourceId.length > 0,
    staleTime: 30_000,
  })

  useForbiddenRecovery(resourceQuery.error ?? canQuery.error)

  if (entityType === null || resourceQuery.isLoading || canQuery.isLoading) {
    return false
  }

  return canQuery.data ?? false
}
