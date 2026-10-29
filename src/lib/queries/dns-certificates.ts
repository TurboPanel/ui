import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  checkDnsCertificate,
  fetchDnsCertificates,
  isForbiddenError,
  orderDnsCertificate,
  retryDnsCertificate,
  type OrderDnsCertificateBody,
} from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'

/** While an order runs the list is looked at again every few seconds. */
const ORDERING_REFRESH_MS = 5_000
const IDLE_REFRESH_MS = 60_000

/**
 * Certificates TurboPanel orders itself. Owners and managers only: a refusal
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
        if (isForbiddenError(err)) return { certificates: [] }
        throw err
      }
    },
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: (query) =>
      query.state.data?.certificates.some((c) => c.status === 'pending')
        ? ORDERING_REFRESH_MS
        : IDLE_REFRESH_MS,
  })
}

function useInvalidate(orgId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).dnsCertificates })
    // The same rows show in the certificate library.
    void queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).tls })
  }
}

export function useOrderDnsCertificate(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useApiMutation({
    mutationFn: (body: OrderDnsCertificateBody) => orderDnsCertificate(orgId, body),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to order the certificate',
  })
}

export function useCheckDnsCertificate(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useApiMutation({
    mutationFn: (id: string) => checkDnsCertificate(orgId, id),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to check the order',
  })
}

export function useRetryDnsCertificate(orgId: string) {
  const invalidate = useInvalidate(orgId)
  return useApiMutation({
    mutationFn: (id: string) => retryDnsCertificate(orgId, id),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to try the order again',
  })
}
