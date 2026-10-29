import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import {
  checkDnsCertificate,
  fetchDnsCertificates,
  isForbiddenError,
  orderDnsCertificate,
  retryDnsCertificate,
  type OrderDnsCertificateBody,
} from '@/lib/instance-api'
import { isHttpStatusError } from '@/lib/fetch-error-detail'
import { queryKeys, useApiMutation } from '@/lib/query-client'

/** While an order runs the list is looked at again every few seconds. */
const ORDERING_REFRESH_MS = 5_000
const IDLE_REFRESH_MS = 60_000
/**
 * While the screen is open an order that is still running is asked to take its
 * next step this often. The server's own sweep runs only once a minute (every
 * few minutes on a self-hosted panel) and an order needs a wait of about ten
 * seconds between steps, so without this the progress would crawl.
 */
export const ORDER_NUDGE_MS = 15_000

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
        // A refusal, or a panel too old to have the route, shows no section.
        if (isForbiddenError(err) || isHttpStatusError(err, 404)) return { certificates: [] }
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

/**
 * Gives every running order a step at a modest interval while the screen is
 * open, the same call as "Check Now". The server takes each row for one caller
 * at a time and does a few small requests, so this is safe next to the sweep.
 * One round at a time; failures are left to the next round and the list.
 */
export function useAdvanceRunningOrders(orgId: string, runningIds: readonly string[]) {
  const queryClient = useQueryClient()
  const busy = useRef(false)
  const key = runningIds.join(',')
  useEffect(() => {
    if (key === '' || orgId.length === 0) return
    const ids = key.split(',')
    const timer = setInterval(() => {
      if (busy.current) return
      busy.current = true
      void (async () => {
        try {
          for (const id of ids) await checkDnsCertificate(orgId, id).catch(() => undefined)
          await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).dnsCertificates })
        } finally {
          busy.current = false
        }
      })()
    }, ORDER_NUDGE_MS)
    return () => clearInterval(timer)
  }, [orgId, key, queryClient])
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
