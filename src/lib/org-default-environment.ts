import { useQuery } from '@tanstack/react-query'
import {
  fetchOrgDefaultEnvironment,
  isForbiddenError,
} from '@/lib/instance-api'
import { queryKeys } from '@/lib/query-keys'

/** Platform fallback when the org has no custom default (or the manage-gated read fails). */
export const PLATFORM_DEFAULT_ENVIRONMENT_NAME = 'Production'

/**
 * Resolved org default environment name for auto-provision paths.
 *
 * A manage-gated 403 must not sign the user out — the queryFn catches forbidden
 * errors and returns a null name so the global QueryClient onError handler is
 * not invoked.
 */
export function useOrgDefaultEnvironmentName(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  const query = useQuery({
    queryKey: queryKeys.org(orgId).settings.defaultEnvironment,
    queryFn: async () => {
      try {
        return await fetchOrgDefaultEnvironment(orgId)
      } catch (err) {
        if (isForbiddenError(err)) {
          return { defaultEnvironmentName: null }
        }
        throw err
      }
    },
    retry: false,
    enabled: options?.enabled ?? Boolean(orgId),
  })

  return {
    defaultEnvironmentName:
      query.data?.defaultEnvironmentName?.trim() ||
      PLATFORM_DEFAULT_ENVIRONMENT_NAME,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
