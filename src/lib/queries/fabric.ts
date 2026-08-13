import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchOrgFabric,
  isHttpStatusError,
  saveOrgFabric,
} from '@/lib/instance-api'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { useApiMutation, queryKeys } from '@/lib/query-client'

function isFabricUnavailableError(error: unknown): boolean {
  return isHttpStatusError(error, 404) || isHttpStatusError(error, 503)
}

export function useOrgFabric(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).settings.fabric,
    queryFn: () => fetchOrgFabric(orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    retry: (failureCount, error) => {
      if (isFabricUnavailableError(error)) return false
      return failureCount < 2
    },
  })
}

export function isOrgFabricUnavailable(error: unknown): boolean {
  return isFabricUnavailableError(error)
}

export function useSaveOrgFabric(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (enabled: boolean) => saveOrgFabric(orgId, enabled),
    onSuccess: async (data) => {
      queryClient.setQueryData(queryKeys.org(orgId).settings.fabric, data)
    },
    fallbackError: `Failed to update ${TURBOFABRIC_PRODUCT_NAME}`,
  })
}
