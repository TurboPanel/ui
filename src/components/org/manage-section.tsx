import { useRouter, type Href } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { ComposeSettingsSection } from '@/components/org/compose-settings-section'
import { PhpModePolicyPanel } from '@/components/org/php-mode-policy-panel'
import { OrganizationFormSection } from '@/components/org/organization-form-section'
import { ReauthSettingsSection } from '@/components/org/reauth-settings-section'
import { Button, ButtonRow, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { useAuth } from '@/lib/auth-context'
import { orgBillingHref } from '@/lib/org-navigation'
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

/** Org Manage — organization record (view / rename), billing (hosted), the owner-only security setting, and the owner-only compose opt-ins. */
export function ManageSection({ orgId }: Readonly<{ orgId: string }>) {
  const orgsQuery = useOrganizationsQuery()
  const { billingEnabled } = useAuth()

  usePullToRefresh(async () => {
    await orgsQuery.refetch()
  })

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Manage Organization</Text>
      <OrganizationFormSection orgId={orgId} />
      {billingEnabled ? <BillingLinkSection orgId={orgId} /> : null}
      <ReauthSettingsSection orgId={orgId} />
      <ComposeSettingsSection orgId={orgId} />
      <PhpModePolicyPanel orgId={orgId} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
})
