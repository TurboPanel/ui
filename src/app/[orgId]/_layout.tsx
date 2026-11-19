import { Redirect, Stack, useLocalSearchParams, type Href } from 'expo-router'
import { useMemo, type ReactNode } from 'react'
import { OrgScreenScroll } from '@/components/org/org-screen-scroll'
import { AcmeTermsPrompt } from '@/components/org/acme-terms-prompt'
import { OrgShell } from '@/components/org/org-shell'
import { OrgShellSkeleton } from '@/components/org/org-shell-skeleton'
import { useAuth } from '@/lib/auth-context'
import { getActiveOrganizationId, setActiveOrganizationId } from '@/lib/org-context'
import { isOrgTabOverviewRouteName, organizationsHref } from '@/lib/org-navigation'
import { orgMembership, orgRouteGate } from '@/lib/org-route-gate'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import { colors } from '@/lib/theme'

function OrgStackScreenLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <OrgScreenScroll>{children}</OrgScreenScroll>
}

function orgNestedStackScreenOptions({ route }: { route: { name: string } }) {
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
  const { session, needsInstall, isLoading } = useAuth()
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const orgsQuery = useOrganizationsQuery({
    enabled: Boolean(orgId && session),
  })

  const orgAllowed = useMemo(
    () =>
      orgMembership({
        orgId,
        hasSession: Boolean(session),
        isPending: orgsQuery.isPending,
        isError: orgsQuery.isError,
        organizations: orgsQuery.data?.organizations,
      }),
    [orgId, session, orgsQuery.isPending, orgsQuery.isError, orgsQuery.data]
  )
  const gate = orgRouteGate({
    isLoading,
    needsInstall,
    hasSession: Boolean(session),
    orgId,
    orgAllowed,
  })

  // Set the instance API org header before children render so queries never
  // fire with the previous org. Only a confirmed membership sets it; this is a
  // module store, not React state.
  if (gate === 'ready' && orgId && getActiveOrganizationId() !== orgId) {
    setActiveOrganizationId(orgId)
  } else if (orgAllowed === false && getActiveOrganizationId() !== null) {
    setActiveOrganizationId(null)
  }

  // The chrome shows placeholders at once; no organization data renders and no
  // organization request starts until membership is confirmed.
  if (gate === 'pending') return <OrgShellSkeleton />
  if (gate === 'install') return <Redirect href={'/install' as Href} />
  if (gate === 'sign-in') return <Redirect href={'/sign-in' as Href} />
  if (gate === 'organizations' || !orgId) {
    return <Redirect href={organizationsHref() as Href} />
  }

  return (
    <OrgShell orgId={orgId} key={orgId}>
      <Stack screenLayout={OrgStackScreenLayout} screenOptions={orgNestedStackScreenOptions} />
      <AcmeTermsPrompt orgId={orgId} />
    </OrgShell>
  )
}
