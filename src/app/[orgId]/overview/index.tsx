import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { defaultOrgDashboardHref } from '@/lib/org-navigation'

/** Retired route: the organization opens on Projects now. */
export default function OverviewRoute() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <Redirect href={defaultOrgDashboardHref(orgId ?? '') as Href} />
}
