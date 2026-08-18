import { Redirect, Stack, useLocalSearchParams, type Href } from 'expo-router'
import { useMemo, type ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { OrgScreenScroll } from '@/components/org/org-screen-scroll'
import { OrgShell } from '@/components/org/org-shell'
import { authSpinnerColor } from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import {
  getActiveOrganizationId,
  setActiveOrganizationId,
} from '@/lib/org-context'
import {
  isOrgTabOverviewRouteName,
  organizationsHref,
} from '@/lib/org-navigation'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import { colors } from '@/lib/theme'

function OrgStackScreenLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <OrgScreenScroll>{children}</OrgScreenScroll>
}

function orgNestedStackScreenOptions({
  route,
}: {
  route: { name: string }
}) {
  const tabOverview = isOrgTabOverviewRouteName(route.name)
  if (tabOverview) {
    return {
      headerShown: false,
      animation: 'none' as const,
      gestureEnabled: false,
      contentStyle: { backgroundColor: colors.bg },
    }
  }
  return {
    headerShown: false,
    contentStyle: { backgroundColor: colors.bg },
  }
}

export default function OrganizationLayout() {
  const { session, needsInstall, isLoading, controlPlaneRuntime } = useAuth()
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const orgsQuery = useOrganizationsQuery({
    enabled: Boolean(orgId && session),
  })

  const orgAllowed = useMemo(() => {
    if (!orgId || !session) return null
    if (orgsQuery.isPending) return null
    if (orgsQuery.isError || !orgsQuery.data) return false
    return orgsQuery.data.organizations.some((org) => org.id === orgId)
  }, [orgId, session, orgsQuery.isPending, orgsQuery.isError, orgsQuery.data])

  // Set the instance API org header before children render so queries never
  // fire with the previous org. This is a module store, not React state.
  if (orgAllowed === true && orgId && getActiveOrganizationId() !== orgId) {
    setActiveOrganizationId(orgId)
  } else if (orgAllowed === false && getActiveOrganizationId() !== null) {
    setActiveOrganizationId(null)
  }

  if (isLoading || (session && orgId && orgAllowed === null)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator
          size="large"
          color={authSpinnerColor(controlPlaneRuntime)}
        />
      </View>
    )
  }

  if (needsInstall) {
    return <Redirect href={'/install' as Href} />
  }

  if (!session) {
    return <Redirect href={'/sign-in' as Href} />
  }

  if (!orgId || orgAllowed === false) {
    return <Redirect href={organizationsHref() as Href} />
  }

  return (
    <OrgShell orgId={orgId} key={orgId}>
      <Stack
        screenLayout={OrgStackScreenLayout}
        screenOptions={orgNestedStackScreenOptions}
      />
    </OrgShell>
  )
}
