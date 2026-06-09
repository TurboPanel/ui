import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { defaultOrgDashboardHref } from '@/lib/org-navigation'

export default function OrganizationOverviewRedirect() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  if (!orgId) {
    return null
  }

  return (
    <Redirect href={defaultOrgDashboardHref(orgId) as Href} />
  )
}
