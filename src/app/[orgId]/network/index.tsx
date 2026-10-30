import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { networkRedirectHref } from '@/lib/org-navigation'

/**
 * Retired: the Network pages live under Servers now. Kept as a redirect so old
 * links and bookmarks still land somewhere useful.
 */
export default function NetworkRedirect() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <Redirect href={networkRedirectHref(orgId ?? '', undefined) as Href} />
}
