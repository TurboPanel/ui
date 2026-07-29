import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, type Href } from 'expo-router'
import { adminAreaHref } from '@/lib/admin-navigation'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import { fetchOrganizations, type OrganizationRecord } from '@/lib/instance-api'
import { setActiveOrganizationId, resolvePreferredOrganizationId } from '@/lib/org-context'
import { defaultOrgDashboardHref } from '@/lib/org-navigation'
import { chrome, colors, spacing } from '@/lib/theme'

export default function WelcomeScreen() {
  const { session, signOut } = useAuth()
  const router = useRouter()
  const showAdminLink = isAdminSession(session)
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadOrganizations() {
      try {
        const { organizations: orgs } = await fetchOrganizations()
        if (cancelled) return
        setOrganizations(orgs)
        const preferred = resolvePreferredOrganizationId(orgs)
        if (preferred) {
          setActiveOrganizationId(preferred)
          router.replace(defaultOrgDashboardHref(preferred) as Href)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load organizations')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadOrganizations().catch(() => {
      // Errors are handled inside loadOrganizations.
    })

    return () => {
      cancelled = true
    }
  }, [router])

  let organizationContent
  if (loading) {
    organizationContent = (
      <Text style={styles.detail}>Loading organizations…</Text>
    )
  } else if (error) {
    organizationContent = <Text style={styles.detail}>{error}</Text>
  } else if (organizations.length === 0) {
    organizationContent = (
      <Text style={styles.detail}>
        Your account is not assigned to an organization yet. Contact an
        administrator to get access, or wait for organization onboarding to
        become available.
      </Text>
    )
  } else {
    organizationContent = (
      <View style={styles.orgList}>
        {organizations.map((org) => (
          <Pressable
            key={org.id}
            style={styles.orgButton}
            onPress={() => {
              setActiveOrganizationId(org.id)
              router.replace(defaultOrgDashboardHref(org.id) as Href)
            }}
          >
            <Text style={styles.orgButtonText}>
              {org.displayName?.trim() || org.id}
            </Text>
          </Pressable>
        ))}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <Text style={styles.title}>TurboPanel</Text>
        <Text style={styles.subtitle}>Choose an organization</Text>
        {session?.email ? (
          <Text style={styles.email}>{session.email}</Text>
        ) : null}
        {organizationContent}
        {showAdminLink ? (
          <Pressable
            style={styles.adminButton}
            onPress={() => router.push(adminAreaHref('networking') as Href)}
          >
            <Text style={styles.adminButtonText}>Instance administration</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.button}
          onPress={() => {
            signOut().catch(() => {
              // Sign-out failures are non-blocking on this screen.
            })
          }}
        >
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
    width: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 18,
    color: colors.textMuted,
    textAlign: 'center',
  },
  email: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  detail: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 420,
  },
  orgList: {
    width: '100%',
    maxWidth: 360,
    gap: spacing.sm,
  },
  orgButton: {
    backgroundColor: chrome.accent,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
  },
  orgButtonText: {
    color: chrome.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  adminButton: {
    backgroundColor: chrome.accent,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  adminButtonText: {
    color: chrome.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.bgInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
})
