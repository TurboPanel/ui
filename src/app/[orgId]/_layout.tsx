import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { OrgShell } from '@/components/org/org-shell'
import { authSpinnerColor } from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import { fetchOrganizations } from '@/lib/instance-api'
import { setActiveOrganizationId } from '@/lib/org-context'
import { colors } from '@/lib/theme'

export default function OrganizationLayout() {
  const { session, needsInstall, isLoading, controlPlaneRuntime } = useAuth()
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  const [orgAllowed, setOrgAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    if (!orgId || !session) {
      setOrgAllowed(null)
      return
    }

    let cancelled = false

    async function loadOrganizations() {
      try {
        const { organizations } = await fetchOrganizations()
        if (cancelled) return
        const allowed = organizations.some((org) => org.id === orgId)
        setOrgAllowed(allowed)
        if (allowed) {
          setActiveOrganizationId(orgId)
        }
      } catch {
        if (!cancelled) {
          setOrgAllowed(false)
        }
      }
    }

    loadOrganizations()

    return () => {
      cancelled = true
    }
  }, [orgId, session])

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
    if (orgAllowed === false) {
      setActiveOrganizationId(null)
    }
    return <Redirect href={'/welcome' as Href} />
  }

  return <OrgShell orgId={orgId} />
}
