import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { orgProjectSettingsHref } from '@/lib/org-navigation'

/**
 * Retired: project defaults live in Organization Settings › Project Settings.
 * Kept as a redirect so old links and bookmarks still land there.
 */
export default function ProjectSettingsRedirect() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <Redirect href={orgProjectSettingsHref(orgId ?? '') as Href} />
}
