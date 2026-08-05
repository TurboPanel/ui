import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { OrgShell } from '@/components/org/org-shell'
import { authSpinnerColor } from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import { setActiveOrganizationId } from '@/lib/org-context'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import { colors } from '@/lib/theme'

export default function OrganizationLayout() {
  const { session, needsInstall, isLoading, controlPlaneRuntime } = useAuth()
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const [readyOrgId, setReadyOrgId] = useState<string | null>(null)
  const orgsQuery = useOrganizationsQuery({
    enabled: Boolean(orgId && session),
  })

  const orgAllowed = useMemo(() => {
    if (!orgId || !session) return null
    if (orgsQuery.isPending) return null
    if (orgsQuery.isError || !orgsQuery.data) return false
    return orgsQuery.data.organizations.some((org) => org.id === orgId)
  }, [orgId, session, orgsQuery.isPending, orgsQuery.isError, orgsQuery.data])

  // Ready only after setActiveOrganizationId has run for this route's orgId.
  // Comparing against orgId (not a boolean) resets readiness synchronously when
  // the route changes — before child queries can mount with a stale header.
  const orgReady = readyOrgId === orgId

  useEffect(() => {
    if (orgAllowed === true && orgId) {
      setActiveOrganizationId(orgId)
      setReadyOrgId(orgId)
    }
  }, [orgAllowed, orgId])

  useEffect(() => {
    if (orgAllowed === false) {
      setActiveOrganizationId(null)
    }
  }, [orgAllowed])

  if (isLoading || (session && orgId && (orgAllowed === null || !orgReady))) {
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
    return <Redirect href={'/welcome' as Href} />
  }

  return <OrgShell orgId={orgId} />
}
