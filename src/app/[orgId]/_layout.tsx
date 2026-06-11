import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { View } from 'react-native'
import { OrgShell } from '@/components/org/org-shell'
import { dashboardHref, useAuth } from '@/lib/auth-context'
import { colors } from '@/lib/theme'

export default function OrganizationLayout() {
  const { session, needsInstall, isLoading } = useAuth()
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  }

  if (needsInstall) {
    return <Redirect href={'/install' as Href} />
  }

  if (!session?.organizationId) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  if (session.organizationId && orgId !== session.organizationId) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  if (!orgId) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  return <OrgShell orgId={orgId} />
}
