import { Redirect, type Href } from 'expo-router'
import { TiersSection } from '@/components/admin/tiers-section'
import { adminAreaHref } from '@/lib/admin-navigation'
import { useAuth } from '@/lib/auth-context'

/**
 * Hosted-only area. Self-hosted instances report `billingEnabled: false` and
 * mount no `/tiers` routes, so the sidebar omits the entry and a typed-in URL
 * lands on the first admin area instead of an error page.
 */
export default function AdminTiersScreen() {
  const { billingEnabled } = useAuth()

  if (!billingEnabled) {
    return <Redirect href={adminAreaHref('networking') as Href} />
  }

  return <TiersSection />
}
