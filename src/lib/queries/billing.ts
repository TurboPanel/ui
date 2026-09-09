import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changeBillingSeats,
  createBillingCheckout,
  createBillingPortalSession,
  downgradeBillingTier,
  fetchBillingCatalog,
  fetchBillingSubscription,
  previewBillingChange,
  upgradeBillingTier,
  type BillingPreviewBody,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

/** The catalogue changes on a release, not a page view. */
export const BILLING_CATALOG_STALE_MS = 10 * 60_000

/**
 * Hosted-only billing state. Every hook here assumes the caller already
 * checked `useAuth().billingEnabled`; on a self-hosted instance the routes
 * 503 `billing_not_configured` and there is nothing to render.
 *
 * Subscription state is webhook-driven (Stripe → control plane), so nothing
 * polls: mutations invalidate the subscription key and the projection is
 * re-read once.
 */
export function useBillingCatalog(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).billing.catalog,
    queryFn: fetchBillingCatalog,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    staleTime: BILLING_CATALOG_STALE_MS,
  })
}

/**
 * Polls only while a checkout return is being confirmed (`CHECKOUT_CONFIRM_POLL_MS`,
 * the caller passes it as `refetchInterval` while in that state) — the same
 * shape as managed status polling while `provisioning`. Every other read is
 * one-shot.
 */
export const CHECKOUT_CONFIRM_POLL_MS = 5000

export function useBillingSubscription(
  orgId: string,
  options?: Readonly<{ enabled?: boolean; refetchInterval?: number | false }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).billing.subscription,
    queryFn: fetchBillingSubscription,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: options?.refetchInterval ?? false,
  })
}

/** First purchase — returns the hosted Checkout URL for the caller to open. */
export function useCreateBillingCheckout(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: { tierId: string; quantity?: number }) => createBillingCheckout(body),
    onSuccess: async () => {
      // The projection only changes once the webhook lands, but a stale
      // "no subscription" view after returning from Checkout is worse than
      // one extra read.
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).billing.subscription })
    },
    fallbackError: 'Failed to start checkout',
  })
}

export function useCreateBillingPortalSession() {
  return useApiMutation({
    mutationFn: () => createBillingPortalSession(),
    fallbackError: 'Failed to open the billing portal',
  })
}

/** Proration quote — read-only against Stripe, so no invalidation. */
export function usePreviewBillingChange() {
  return useApiMutation({
    mutationFn: (body: BillingPreviewBody) => previewBillingChange(body),
    fallbackError: 'Failed to preview the change',
  })
}

async function invalidateBillingAndServers(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).billing.subscription }),
    // Tier placement (`licenseTier`, the assigned tier) rides the servers list and detail rows.
    queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).servers.list }),
    queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).servers.licenses }),
  ])
}

export function useChangeBillingSeats(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: { tierId: string; delta: number; prorationDate?: number }) =>
      changeBillingSeats(body),
    onSuccess: async () => {
      await invalidateBillingAndServers(queryClient, orgId)
    },
    fallbackError: 'Failed to change the number of licenses',
  })
}

/** One license moves up a tier, invoiced now. */
export function useUpgradeBillingTier(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: { fromTierId: string; toTierId: string; prorationDate?: number }) =>
      upgradeBillingTier(body),
    onSuccess: async () => {
      await invalidateBillingAndServers(queryClient, orgId)
    },
    fallbackError: 'Failed to upgrade the license',
  })
}

/** One license moves down a tier at the period end. */
export function useDowngradeBillingTier(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: { fromTierId: string; toTierId: string }) => downgradeBillingTier(body),
    onSuccess: async () => {
      await invalidateBillingAndServers(queryClient, orgId)
    },
    fallbackError: 'Failed to schedule the downgrade',
  })
}
