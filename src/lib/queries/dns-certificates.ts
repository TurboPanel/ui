import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchDnsCertificates, isForbiddenError, retryDnsCertificate } from '@/lib/instance-api'
import { isHttpStatusError } from '@/lib/fetch-error-detail'
import { queryKeys, useApiMutation } from '@/lib/query-client'

/**
 * The list is looked at only now and then; a name's own screen refreshes it
 * after a retry.
 */
const REFRESH_MS = 60_000

/**
 * Certificates TurboPanel ordered itself. Owners and managers only: a refusal
 * reads as an empty list so the global 403 handler is not invoked for a role
 * check the screen already shows.
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

/**
 * Try a certificate order that gave up again. A 409 `rate_limited` comes back
 * as `DnsCertificateRateLimitedError` in the result's `cause`, with the time
 * to try again.
 */
export function useRetryDnsCertificate(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (tlsId: string) => retryDnsCertificate(orgId, tlsId),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).dnsCertificates })
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).hostings.all })
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).tls })
    },
    fallbackError: 'Could not try the order again',
  })
}
