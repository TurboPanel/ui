import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ComposeSettingsSection } from '@/components/org/compose-settings-section'
import { PhpModePolicyPanel } from '@/components/org/php-mode-policy-panel'
import { OrganizationFormSection } from '@/components/org/organization-form-section'
import { ReauthSettingsSection } from '@/components/org/reauth-settings-section'
import { OrganizationChannelsSection } from '@/components/account/notification-channels-section'
import { AccessOverviewSection } from '@/components/org/access-overview-section'
import { GitSourcesSection } from '@/components/org/git-sources/git-sources-section'
import { PageTabs, type PageTab } from '@/components/org/nav/page-tabs'
import { TlsOverviewSection } from '@/components/org/tls-overview-section'
import { Button, ButtonRow, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  ORG_SETTINGS_TAB_IDS,
  ORG_SETTINGS_TAB_LABELS,
  orgBillingHref,
  orgSettingsTabHref,
  parseOrgSettingsTab,
  type OrgSettingsTabId,
} from '@/lib/org-navigation'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import { spacing } from '@/lib/theme'

/** Hosted only: Billing is not a sidebar area, so the organization's own page links to it. */
function BillingLinkSection({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  return (
    <SectionPanel title="Billing" hint="Licenses per tier, invoices and the payment method">
      <Text style={panelStyles.muted}>
        Each server uses one license. Add, remove or restore licenses on the billing page.
      </Text>
      <ButtonRow>
        <Button
          label="Open billing"
          size="sm"
          onPress={() => router.push(orgBillingHref(orgId) as Href)}
        />
      </ButtonRow>
    </SectionPanel>
  )
}

/** What the General tab holds: the organization record and the owner-only settings. */
function GeneralTab({ orgId }: Readonly<{ orgId: string }>) {
  const { billingEnabled } = useAuth()
  return (
    <View style={styles.tab}>
      <OrganizationFormSection orgId={orgId} />
      {billingEnabled ? <BillingLinkSection orgId={orgId} /> : null}
      <ReauthSettingsSection orgId={orgId} />
      <ComposeSettingsSection orgId={orgId} />
      <PhpModePolicyPanel orgId={orgId} />
    </View>
  )
}

function SettingsTabBody({
  orgId,
  tab,
}: Readonly<{ orgId: string; tab: OrgSettingsTabId }>) {
  switch (tab) {
    case 'members':
      return <AccessOverviewSection orgId={orgId} />
    case 'notifications':
      return <OrganizationChannelsSection orgId={orgId} />
    case 'domains':
      return <TlsOverviewSection orgId={orgId} />
    case 'git':
      return <GitSourcesSection scope="org" orgId={orgId} />
    default:
      return <GeneralTab orgId={orgId} />
  }
}

/**
 * Organization settings: five tabs (General, Members, Notifications, Domains
 * & certificates, Git connections), reached from the organization menu in the
 * header. Each tab hosts the screen that already did the job, so every setting
 * keeps its place and its route (`/access`, `/servers/tls`,
 * `/projects/git-sources`, `/account/notifications`).
 */
export function ManageSection({ orgId }: Readonly<{ orgId: string }>) {
  const orgsQuery = useOrganizationsQuery()
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string | string[] }>()
  const activeTab = parseOrgSettingsTab(tabParam)
  const tabs = useMemo<PageTab[]>(
    () =>
      ORG_SETTINGS_TAB_IDS.map((id) => ({
        id,
        label: ORG_SETTINGS_TAB_LABELS[id],
        href: orgSettingsTabHref(orgId, id),
      })),
    [orgId],
  )

  usePullToRefresh(async () => {
    await orgsQuery.refetch()
  })

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Organization settings</Text>
      <PageTabs
        tabs={tabs}
        activeId={activeTab}
        accessibilityLabel="Organization settings sections"
      />
      <SettingsTabBody orgId={orgId} tab={activeTab} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  tab: {
    width: '100%',
    gap: spacing.lg,
  },
})
