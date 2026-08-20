import { useRouter, type Href } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { CreateOrganizationModal } from '@/components/create-organization-modal'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderUserAccountControl } from '@/components/header-account-controls'
import { PlusIcon } from '@/components/icons/nav-icons'
import { OrganizationSwitcherList } from '@/components/org/organization-switcher-list'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { adminAreaHref } from '@/lib/admin-navigation'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import { getActiveOrganizationId, setActiveOrganizationId } from '@/lib/org-context'
import {
  defaultOrgDashboardHref,
  orgManageHref,
  replaceOrganization,
} from '@/lib/org-navigation'
import { shouldShowOrgSwitcherSearch } from '@/lib/organization-switcher'
import { useCreateOrganization, useOrganizationsQuery } from '@/lib/queries/auth'
import { chrome, colors, spacing } from '@/lib/theme'

/**
 * Full-page organization switcher (`/organizations`).
 * Selecting an org opens its Overview.
 */
export function OrganizationSwitcherScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { session, signOut } = useAuth()
  const orgsQuery = useOrganizationsQuery()
  const createOrganization = useCreateOrganization()
  const organizations = orgsQuery.data?.organizations ?? []
  const currentOrgId = getActiveOrganizationId()
  const showAdminLink = isAdminSession(session)
  const userLabel = session?.email
  const isNative = Platform.OS !== 'web'

  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  let error = ''
  if (orgsQuery.error instanceof Error) {
    error = orgsQuery.error.message
  } else if (orgsQuery.error) {
    error = 'Failed to load organizations'
  }

  const openOrg = (nextOrgId: string, href: Href) => {
    setActiveOrganizationId(nextOrgId)
    replaceOrganization(router, href)
  }

  const handleSelect = (nextOrgId: string) => {
    openOrg(nextOrgId, defaultOrgDashboardHref(nextOrgId) as Href)
  }

  const handleManage = (nextOrgId: string) => {
    openOrg(nextOrgId, orgManageHref(nextOrgId) as Href)
  }

  const handleCreate = async (name: string) => {
    const result = await createOrganization.run({ name })
    if (!result.ok) {
      return { ok: false, error: result.error ?? 'Could not create organization.' }
    }
    const nextOrgId = result.value?.id
    if (!nextOrgId) {
      return { ok: false, error: 'Could not create organization.' }
    }
    openOrg(nextOrgId, defaultOrgDashboardHref(nextOrgId) as Href)
    return { ok: true }
  }

  const showSearch = shouldShowOrgSwitcherSearch(organizations.length, true)

  let body
  if (orgsQuery.isLoading) {
    body = <Text style={styles.detail}>Loading organizations…</Text>
  } else if (error) {
    body = <Text style={styles.detail}>{error}</Text>
  } else if (organizations.length === 0) {
    body = (
      <Text style={styles.detail}>
        Your account is not assigned to an organization yet. Create one to get
        started, or ask an administrator for access.
      </Text>
    )
  } else {
    body = (
      <OrganizationSwitcherList
        organizations={organizations}
        query={query}
        onQueryChange={setQuery}
        currentOrgId={currentOrgId}
        onSelect={handleSelect}
        onManage={handleManage}
        showSearch={showSearch}
        density="page"
        style={styles.list}
      />
    )
  }

  return (
    <View style={styles.safe}>
      <GlassSurface
        style={[
          styles.topBar,
          isNative ? { paddingTop: insets.top } : null,
        ]}
        intensity="strong"
        rim="bottom"
      >
        <TurboPanelLogo size={28} />
        <View style={styles.topBarSpacer} />
        {session && userLabel ? (
          <HeaderUserAccountControl email={userLabel} onSignOut={signOut} />
        ) : null}
      </GlassSurface>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={orgPanelStyles.pageTitle}>Organizations</Text>
            <Text style={styles.subtitle}>
              Switch organizations or create a new one. Opening an organization
              takes you to Overview.
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              orgPanelStyles.toolbarBtnPrimary,
              styles.newBtn,
              pressed && styles.pressed,
              webPointer,
            ]}
            onPress={() => setCreateOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Create organization"
          >
            <PlusIcon size={14} color={chrome.accent} />
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>New</Text>
          </Pressable>
        </View>

        {body}

        {showAdminLink ? (
          <Pressable
            style={({ pressed }) => [
              styles.adminLink,
              pressed && styles.pressed,
              webPointer,
            ]}
            onPress={() => router.push(adminAreaHref('networking') as Href)}
            accessibilityRole="link"
            accessibilityLabel="Instance administration"
          >
            <Text style={styles.adminLinkText}>Instance administration</Text>
          </Pressable>
        ) : null}
      </KeyboardAvoidingView>

      <CreateOrganizationModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    borderRadius: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
    zIndex: 5,
  },
  topBarSpacer: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  newBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
  },
  list: {
    flex: 1,
  },
  detail: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  adminLink: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  adminLinkText: {
    color: colors.textChip,
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
})
