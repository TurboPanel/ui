import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
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
import { invalidateCertificateLists } from '@/lib/queries/tls'

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
  const queryClient = useQueryClient()
  const pending = useRef<ReadonlySet<string>>(new Set())
  const query = useQuery({
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
  const certificates = query.data?.certificates
  useEffect(() => {
    if (!certificates) return
    const now = new Set(certificates.filter((c) => c.status === 'pending').map((c) => c.id))
    const finished = [...pending.current].some((id) => !now.has(id))
    pending.current = now
    // An order that finished (or was removed) changed its library card too.
    if (finished) void queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).tls })
  }, [certificates, orgId, queryClient])
  return query
}

/** At most this many checks are in flight at once. */
export const ORDER_NUDGE_CONCURRENCY = 3
/** An order whose check failed this many times in a row is left alone. */
export const ORDER_NUDGE_MAX_FAILURES = 3

/** Checks the orders with a small pool; a failure is counted, a success clears the count. */
async function nudge(
  orgId: string,
  ids: readonly string[],
  failures: Map<string, number>,
  queryClient: QueryClient
) {
  const queue = ids.filter((id) => (failures.get(id) ?? 0) < ORDER_NUDGE_MAX_FAILURES)
  const next = async (): Promise<void> => {
    const id = queue.shift()
    if (id === undefined) return
    try {
      await checkDnsCertificate(orgId, id)
      failures.delete(id)
    } catch {
      failures.set(id, (failures.get(id) ?? 0) + 1)
    }
    return next()
  }
  await Promise.all(Array.from({ length: ORDER_NUDGE_CONCURRENCY }, next))
  await invalidateCertificateLists(queryClient, orgId)
}

/**
 * Gives every running order a step at a modest interval while the screen is
 * open, the same call as "Check Now". The server takes each row for one caller
 * at a time and does a few small requests, so this is safe next to the sweep.
 * One round at a time, at most three checks at once; an order that fails three
 * times in a row is dropped until it leaves and re-enters the running list.
 */
export function useAdvanceRunningOrders(orgId: string, runningIds: readonly string[]) {
  const queryClient = useQueryClient()
  const busy = useRef(false)
  const failures = useRef(new Map<string, number>())
  const key = runningIds.join(',')
  useEffect(() => {
    if (key === '' || orgId.length === 0) return
    const ids = key.split(',')
    // An order that left the running list starts fresh if it ever comes back.
    for (const id of failures.current.keys()) if (!ids.includes(id)) failures.current.delete(id)
    const timer = setInterval(() => {
      if (busy.current) return
      busy.current = true
      void nudge(orgId, ids, failures.current, queryClient).finally(() => {
        busy.current = false
      })
    }, ORDER_NUDGE_MS)
    return () => clearInterval(timer)
  }, [orgId, key, queryClient])
}

function useInvalidate(orgId: string) {
  const queryClient = useQueryClient()
  return () => {
    void invalidateCertificateLists(queryClient, orgId)
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
