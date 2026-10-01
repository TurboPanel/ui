import { StyleSheet, Text, View } from 'react-native'
import { FirewallPolicyPanel } from '@/components/org/firewall/firewall-policy-panel'
import { FirewallRulesPanel } from '@/components/org/firewall/firewall-rules-panel'
import { SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { useCan } from '@/lib/query-client'
import { spacing } from '@/lib/theme'

/**
 * Organization firewall: the policy and the rules operators typed. Together
 * with what deployments publish they decide the firewall each server is sent
 * as a preview; a server’s own Firewall tab shows exactly what it was sent.
 * Owners and managers only; the API refuses everyone else.
 */
export function NetworkFirewallSection({ orgId }: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Firewall</Text>
      <Text style={panelStyles.pageCopy}>
        Each server’s firewall is worked out from the ports your deployments publish plus the rules
        you add here. Open a server’s Firewall tab to see what it was sent and to set its mode.
      </Text>
      {canManage ? (
        <>
          <FirewallPolicyPanel orgId={orgId} />
          <FirewallRulesPanel orgId={orgId} />
        </>
      ) : (
        <SectionPanel title="Firewall">
          <Text style={panelStyles.muted}>
            Only organization owners and managers can see or change the firewall.
          </Text>
        </SectionPanel>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.xl,
  },
})
