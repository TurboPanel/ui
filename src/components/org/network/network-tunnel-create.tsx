import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, FormField, SectionPanel, Select, TextField } from '@/components/ui'
import type { DatacenterRecord, OrgServerRecord, TunnelCarrier } from '@/lib/instance-api'
import { useCreateTunnel } from '@/lib/queries/tunnel-routes'
import { spacing } from '@/lib/theme'
import { tunnelErrorMessage } from '@/lib/tunnels'
import {
  EMPTY_PLACEMENT_DRAFT,
  placementBody,
  TUNNEL_NAME_MAX,
  tunnelCapableCarriers,
  type PlacementDraft,
} from '@/lib/tunnel-runs'
import { NetworkTunnelPlacement } from './network-tunnel-placement'

/** "Create a Tunnel": the Cloudflare account, a name, and where it runs. */
export function NetworkTunnelCreate({
  orgId,
  carriers,
  servers,
  datacenters,
}: Readonly<{
  orgId: string
  carriers: readonly TunnelCarrier[]
  servers: readonly OrgServerRecord[]
  datacenters: readonly DatacenterRecord[]
}>) {
  const capable = tunnelCapableCarriers(carriers)
  const [carrierId, setCarrierId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState<PlacementDraft>(EMPTY_PLACEMENT_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const create = useCreateTunnel(orgId)

  // A lone capable account is the only choice, so it needs no picking.
  const chosenCarrier = carrierId ?? (capable.length === 1 ? (capable[0]?.id ?? null) : null)
  const body = placementBody(draft, servers)
  const trimmed = name.trim()
  const canSend = !create.isPending && chosenCarrier !== null && trimmed.length > 0 && body.ok

  async function send() {
    if (!chosenCarrier || !body.ok) return
    setError(null)
    setDone(null)
    const result = await create.run({ ...body.body, carrierId: chosenCarrier, name: trimmed })
    if (result.ok) {
      const warnings = result.value.tunnel.warnings
      setDone(
        warnings.length > 0
          ? `Created ${trimmed}. ${warnings.join(' ')}`
          : `Created ${trimmed}. Add a hostname to it below.`
      )
      setName('')
      setDraft(EMPTY_PLACEMENT_DRAFT)
      return
    }
    setError(tunnelErrorMessage(result.cause, 'Failed to create the tunnel'))
  }

  if (capable.length === 0) {
    return (
      <SectionPanel title="Create a Tunnel" hint="Needs a Cloudflare account first">
        <Text style={panelStyles.muted}>
          Connect a Cloudflare account with an API Token that can manage tunnels, under Cloudflare
          Accounts. Then you can create a tunnel here.
        </Text>
      </SectionPanel>
    )
  }

  return (
    <SectionPanel title="Create a Tunnel" hint="Reach a site without opening a port">
      <Text style={panelStyles.muted}>
        A tunnel connects Cloudflare to your servers. Visitors reach your site through Cloudflare,
        and the server never has to accept connections from the internet for that name.
      </Text>
      {error ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {done ? <Text style={panelStyles.muted}>{done}</Text> : null}
      <View style={styles.form}>
        {capable.length > 1 ? (
          <FormField label="Cloudflare Account">
            <Select
              value={chosenCarrier}
              options={capable.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Choose an account"
              disabled={create.isPending}
              accessibilityLabel="Cloudflare account for the tunnel"
              onChange={setCarrierId}
            />
          </FormField>
        ) : (
          <Text style={panelStyles.muted}>Account: {capable[0]?.name}</Text>
        )}
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          editable={!create.isPending}
          maxLength={TUNNEL_NAME_MAX}
          placeholder="e.g. production"
          hint="A short name for you. It is also what the tunnel is called in Cloudflare."
          accessibilityLabel="Tunnel name"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <NetworkTunnelPlacement
          draft={draft}
          onChange={setDraft}
          servers={servers}
          datacenters={datacenters}
          disabled={create.isPending}
        />
        {body.ok ? null : <Text style={panelStyles.muted}>{body.problem}</Text>}
        <Button
          label="Create Tunnel"
          variant="primary"
          busy={create.isPending}
          disabled={!canSend}
          onPress={() => void send()}
          accessibilityLabel="Create tunnel"
        />
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
})
