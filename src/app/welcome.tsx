import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { authSpinnerColor } from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import {
  resolvePreferredOrganizationId,
  setActiveOrganizationId,
} from '@/lib/org-context'
import {
  defaultOrgDashboardHref,
  organizationsHref,
  replaceOrganization,
} from '@/lib/org-navigation'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import { colors } from '@/lib/theme'

/**
 * Signed-in home: last/only org → Overview; otherwise the organization switcher.
 * `/organizations` is the explicit picker and does not auto-leave.
 */
export default function WelcomeScreen() {
  const router = useRouter()
  const { controlPlaneRuntime } = useAuth()
  const orgsQuery = useOrganizationsQuery()

  useEffect(() => {
    if (!orgsQuery.data) {
      return
    }
    const preferred = resolvePreferredOrganizationId(
      orgsQuery.data.organizations,
    )
    if (preferred) {
      setActiveOrganizationId(preferred)
      replaceOrganization(router, defaultOrgDashboardHref(preferred) as Href)
      return
    }
    router.replace(organizationsHref() as Href)
  }, [orgsQuery.data, router])

  return (
    <View style={styles.loading}>
      <ActivityIndicator
        size="large"
        color={authSpinnerColor(controlPlaneRuntime)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
