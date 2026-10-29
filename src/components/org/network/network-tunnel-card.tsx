import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  InlineNotice,
  MonoText,
  SectionPanel,
} from '@/components/ui'
import type {
  DatacenterRecord,
  OrgServerRecord,
  TunnelPortal,
  TunnelRecord,
} from '@/lib/instance-api'
import { useDeleteTunnel, useUpdateTunnelPlacement } from '@/lib/queries/tunnel-routes'
import { spacing } from '@/lib/theme'
import { tunnelErrorMessage } from '@/lib/tunnels'
import {
  connectorLine,
  draftFromTunnel,
  placementBody,
  placementSummary,
  REDEPLOY_NOTE,
  portalState,
  seenLabel,
  serverLabel,
  tunnelHealth,
  type PlacementDraft,
} from '@/lib/tunnel-runs'
import { NetworkTunnelHostnames } from './network-tunnel-hostnames'
import { NetworkTunnelPlacement } from './network-tunnel-placement'
import { NetworkTunnelVerify } from './network-tunnel-verify'

function PortalRow({ portal, serverName }: Readonly<{ portal: TunnelPortal; serverName: string }>) {
  const state = portalState(portal)
  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.titleRow}>
        <Text style={panelStyles.detailTitle}>{serverName}</Text>
        <Badge label={state.label} tone={state.tone} />
      </View>
      {portal.wanted === 'skip' ? null : (
        <Text style={panelStyles.muted}>
          {connectorLine(portal)}. {seenLabel(portal.lastSeenAt)}
        </Text>
      )}
      {portal.lastError ? <Text style={panelStyles.error}>{portal.lastError}</Text> : null}
    </View>
  )
}

function PlacementEditor({
  orgId,
  tunnel,
  servers,
  datacenters,
}: Readonly<{
  orgId: string
  tunnel: TunnelRecord
  servers: readonly OrgServerRecord[]
  datacenters: readonly DatacenterRecord[]
}>) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<PlacementDraft>(() => draftFromTunnel(tunnel))
  const [error, setError] = useState<string | null>(null)
  const update = useUpdateTunnelPlacement(orgId, tunnel.id)
  const body = placementBody(draft, servers)

  async function save() {
    if (!body.ok) return
    setError(null)
    const result = await update.run(body.body)
    if (result.ok) {
      setOpen(false)
      return
    }
    setError(tunnelErrorMessage(result.cause, 'Failed to change where the tunnel runs'))
  }

  if (!open) {
    return (
      <ButtonRow>
        <Button
          label="Change Where It Runs"
          size="sm"
          onPress={() => {
            setDraft(draftFromTunnel(tunnel))
            setOpen(true)
          }}
          accessibilityLabel={`Change where ${tunnel.name} runs`}
        />
      </ButtonRow>
    )
  }
  return (
    <View style={styles.form}>
      {error ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <NetworkTunnelPlacement
        draft={draft}
        onChange={setDraft}
        servers={servers}
        datacenters={datacenters}
        disabled={update.isPending}
      />
      <Text style={panelStyles.muted}>{REDEPLOY_NOTE}</Text>
      {body.ok ? null : <Text style={panelStyles.muted}>{body.problem}</Text>}
      <ButtonRow>
        <Button
          label="Save"
          variant="primary"
          size="sm"
          busy={update.isPending}
          disabled={!body.ok}
          onPress={() => void save()}
          accessibilityLabel="Save where the tunnel runs"
        />
        <Button
          label="Cancel"
          size="sm"
          disabled={update.isPending}
          onPress={() => {
            setOpen(false)
            setError(null)
          }}
        />
      </ButtonRow>
    </View>
  )
}

/** One tunnel: its status, the connector on each server, where it runs, and its hostnames. */
export function NetworkTunnelCard({
  orgId,
  tunnel,
  servers,
  datacenters,
}: Readonly<{
  orgId: string
  tunnel: TunnelRecord
  servers: readonly OrgServerRecord[]
  datacenters: readonly DatacenterRecord[]
}>) {
  const [error, setError] = useState<string | null>(null)
  const remove = useDeleteTunnel(orgId)
  const datacenterName = datacenters.find((d) => d.id === tunnel.datacenterId)?.name ?? null
  const names = new Map(servers.map((s) => [s.id, serverLabel(s)]))
  const health = tunnelHealth(tunnel)

  async function runRemove() {
    setError(null)
    const result = await remove.run(tunnel.id)
    if (!result.ok) setError(tunnelErrorMessage(result.cause, 'Failed to remove the tunnel'))
  }

  return (
    <SectionPanel title={tunnel.name} hint={placementSummary(tunnel, datacenterName)}>
      <View style={styles.titleRow}>
        <Badge label={health.label} tone={health.tone} />
        <MonoText>{`${tunnel.doorwayCount} ${tunnel.doorwayCount === 1 ? 'hostname' : 'hostnames'}`}</MonoText>
      </View>
      {error ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {tunnel.warnings.map((warning) => (
        <InlineNotice key={warning} tone="warning" title={warning} />
      ))}
      <View style={styles.list}>
        <Text style={panelStyles.detailTitle}>Servers</Text>
        {tunnel.portals.length === 0 ? (
          <Text style={panelStyles.muted}>No server reports on this tunnel yet.</Text>
        ) : null}
        {tunnel.portals.map((portal) => (
          <PortalRow
            key={portal.serverId}
            portal={portal}
            serverName={names.get(portal.serverId) ?? portal.serverId.slice(0, 8)}
          />
        ))}
      </View>
      <PlacementEditor orgId={orgId} tunnel={tunnel} servers={servers} datacenters={datacenters} />
      <NetworkTunnelVerify orgId={orgId} tunnel={tunnel} />
      <NetworkTunnelHostnames orgId={orgId} tunnelId={tunnel.id} />
      <ButtonRow>
        <ConfirmButton
          label="Remove Tunnel"
          confirmLabel="Remove Tunnel"
          prompt="Remove this tunnel from TurboPanel and from Cloudflare? It has to carry no hostnames first."
          stacked
          busy={remove.isPending}
          disabled={tunnel.status === 'removing'}
          onConfirm={() => void runRemove()}
        />
      </ButtonRow>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  form: { gap: spacing.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
