import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { managedListRedirectHref } from '@/lib/org-navigation'

/** Retired route: managed databases are listed on Projects with the Managed databases filter. */
export default function ManagedOverviewRoute() {
  const params = useLocalSearchParams<Record<string, string | string[]>>()
  const orgId = typeof params.orgId === 'string' ? params.orgId : ''
  return <Redirect href={managedListRedirectHref(orgId, params) as Href} />
}
