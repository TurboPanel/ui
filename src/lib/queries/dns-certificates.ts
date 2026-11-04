import { useQuery } from '@tanstack/react-query'
import { fetchDnsCertificates, isForbiddenError } from '@/lib/instance-api'
import { isHttpStatusError } from '@/lib/fetch-error-detail'
import { queryKeys } from '@/lib/query-client'

/**
 * Nothing moves on its own any more: the control plane no longer orders,
 * carries on or renews these certificates, so the list is looked at only
 * now and then.
 */
const REFRESH_MS = 60_000

/**
 * Certificates TurboPanel ordered itself. Owners and managers only: a refusal
 * reads as an empty list so the global 403 handler is not invoked for a role
 * check the screen already shows. Ordering is turned off, so there is no
 * order, check or retry here, and no automatic stepping of open orders.
 */
export function useDnsCertificates(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).dnsCertificates,
    queryFn: async () => {
      try {
        return await fetchDnsCertificates(orgId)
      } catch (err) {
        // A refusal, or a panel too old to have the route, shows no section.
        if (isForbiddenError(err) || isHttpStatusError(err, 404)) return { certificates: [] }
        throw err
      }
    },
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: REFRESH_MS,
  })
}
