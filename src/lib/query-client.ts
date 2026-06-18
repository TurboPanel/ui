import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { checkPermission, fetchInstallStatus, isForbiddenError } from '@/lib/instance-api'
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
      void handleUnauthorized()
    }
  }, [error, handleUnauthorized])
}

/**
 * Client-side display hint for whether the current user likely has a permission
 * on a resource. This is **not** a security boundary — the API enforces authz.
 */
export function useCan(
  resourceId: string | null,
  permissionKey: string,
): boolean {
  const query = useQuery({
    queryKey: visibilityQueryKeys.can(resourceId ?? '', permissionKey),
    queryFn: async () => {
      const result = await checkPermission(resourceId!, permissionKey)
      return result.allowed
    },
    enabled: resourceId !== null,
    staleTime: 30_000,
  })

  useForbiddenRecovery(query.error)

  if (resourceId === null || query.isLoading) {
    return false
  }

  return query.data ?? false
}
