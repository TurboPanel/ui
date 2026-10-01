import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Button,
  ButtonRow,
  FormField,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  FIREWALL_INPUT_DEFAULT_OPTIONS,
  FIREWALL_IPV6_OPTIONS,
  firewallErrorMessage,
  firewallPolicyPatch,
  formatSshSources,
  parseSshSources,
} from '@/lib/firewall'
import type { FirewallPolicy } from '@/lib/instance-api'
import { useFirewallPolicy, useSaveFirewallPolicy } from '@/lib/queries/firewall'
import { spacing } from '@/lib/theme'

function PolicyForm({ orgId, policy }: Readonly<{ orgId: string; policy: FirewallPolicy }>) {
  const mutation = useSaveFirewallPolicy(orgId)
  const [inputDefault, setInputDefault] = useState(policy.inputDefault)
  const [ipv6, setIpv6] = useState(policy.ipv6)
  const [ssh, setSsh] = useState(formatSshSources(policy.sshSources))
  const [sshError, setSshError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setError(null)
    setSaved(false)
    const sources = parseSshSources(ssh)
    if (!sources.ok) {
      setSshError(sources.error)
      return
    }
    setSshError(null)
    const patch = firewallPolicyPatch(policy, { inputDefault, ipv6, sshSources: sources.sources })
    if (!patch) return
    try {
      await mutation.mutateAsync(patch)
      setSaved(true)
    } catch (err) {
      setError(firewallErrorMessage(err, 'Failed to save the firewall policy'))
    }
  }

  return (
    <View style={styles.form}>
      <FormField
        label="Default for incoming traffic"
        hint="Block by default keeps only what your deployments publish and your Allow rules open. SSH and the control plane’s own port are always kept open."
      >
        <SegmentedControl
          options={FIREWALL_INPUT_DEFAULT_OPTIONS}
          value={inputDefault}
          disabled={mutation.isPending}
          accessibilityLabel="Default for incoming traffic"
          onChange={setInputDefault}
        />
      </FormField>
      <TextField
        label="Who may use SSH"
        value={ssh}
        placeholder="Anyone"
        hint="Write Anyone, or list addresses and ranges like 203.0.113.0/24."
        error={sshError}
        mono
        multiline
        editable={!mutation.isPending}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(value) => {
          setSaved(false)
          setSsh(value)
        }}
      />
      <FormField label="IPv6">
        <SegmentedControl
          options={FIREWALL_IPV6_OPTIONS}
          value={ipv6}
          disabled={mutation.isPending}
          accessibilityLabel="IPv6"
          onChange={setIpv6}
        />
      </FormField>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <ButtonRow>
        <Button
          label="Save policy"
          busyLabel="Saving…"
          variant="primary"
          size="sm"
          busy={mutation.isPending}
          onPress={() => {
            void save()
          }}
        />
        {saved ? <Text style={panelStyles.muted}>Saved.</Text> : null}
      </ButtonRow>
    </View>
  )
}

/**
 * The organization’s firewall policy. It shapes the preview each server gets;
 * applying a firewall is switched on separately, and Block by default only
 * takes effect once it is. Owners and managers only.
 */
export function FirewallPolicyPanel({ orgId }: Readonly<{ orgId: string }>) {
  const query = useFirewallPolicy(orgId)
  const policy = query.data?.policy

  return (
    <SectionPanel
      title="Policy"
      hint="Defaults for every server in the organization. They shape each server’s preview."
    >
      {query.isLoading ? <LoadingState label="Loading the policy…" /> : null}
      {query.error ? (
        <Text style={panelStyles.error}>
          {firewallErrorMessage(query.error, 'Failed to load the firewall policy')}
        </Text>
      ) : null}
      {policy ? (
        <PolicyForm
          key={`${policy.inputDefault}|${policy.ipv6}|${policy.sshSources.join(',')}`}
          orgId={orgId}
          policy={policy}
        />
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
})
