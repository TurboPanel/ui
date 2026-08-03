import { useQuery } from '@tanstack/react-query'
import { fetchOrgDefaultEnvironment } from '@/lib/instance-api'

/** Platform fallback when the org has no custom default (or the manage-gated read fails). */
export const PLATFORM_DEFAULT_ENVIRONMENT_NAME = 'Production'

export const orgDefaultEnvironmentQueryKey = (orgId: string) =>
  ['org', orgId, 'default-environment'] as const

/**
 * Resolved org default environment name for auto-provision paths.
 *
 * A manage-gated 403 must not sign the user out — callers fall back to
 * {@link PLATFORM_DEFAULT_ENVIRONMENT_NAME}. Do not wire `useForbiddenRecovery` here.
 */
export function useOrgDefaultEnvironmentName(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  const query = useQuery({
    queryKey: orgDefaultEnvironmentQueryKey(orgId),
    queryFn: () => fetchOrgDefaultEnvironment(orgId),
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
