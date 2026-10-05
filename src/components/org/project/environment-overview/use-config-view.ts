import { useQuery } from '@tanstack/react-query'
import { fetchConfigView } from '@/lib/v4/config-view-client'

/** Under the environment's own key prefix, so saving the environment refreshes it. */
export function configViewKey(orgId: string, environmentId: string) {
  return ['org', orgId, 'environment', environmentId, 'config-view'] as const
}

/** The config view of one environment. A refusal (403, 422) is not retried. */
export function useEnvironmentConfigView(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: configViewKey(orgId, environmentId),
    queryFn: () => fetchConfigView(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
    retry: false,
  })
}
