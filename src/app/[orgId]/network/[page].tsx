import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { networkRedirectHref } from '@/lib/org-navigation'

/** Retired: `/network/<page>` moved to `/servers/<page>`; unknown pages land on Servers. */
export default function NetworkPageRedirect() {
  const { orgId, page } = useLocalSearchParams<{ orgId: string; page: string }>()
  return <Redirect href={networkRedirectHref(orgId ?? '', page) as Href} />
}
