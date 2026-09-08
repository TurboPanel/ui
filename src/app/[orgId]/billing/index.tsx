import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { BillingSection } from '@/components/org/billing-section'
import { useAuth } from '@/lib/auth-context'
import { defaultOrgDashboardHref } from '@/lib/org-navigation'

/**
 * Hosted-only area. Self-hosted instances report `billingEnabled: false`
 * (every `/billing/*` route would 503), so the sidebar omits the entry and a
 * typed-in URL lands on Overview instead of an error page.
 */
export default function BillingScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const { billingEnabled } = useAuth()

  if (!billingEnabled) {
    return <Redirect href={defaultOrgDashboardHref(orgId ?? '') as Href} />
  }

  return <BillingSection orgId={orgId ?? ''} />
}
