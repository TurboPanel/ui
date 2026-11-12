import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { orgSettingsTabHref } from '@/lib/org-navigation'

/**
 * Retired: Access is a tab of Organization Settings. Kept as a redirect so old
 * links and bookmarks still land there.
 */
export default function AccessRedirect() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <Redirect href={orgSettingsTabHref(orgId ?? '', 'access') as Href} />
}
