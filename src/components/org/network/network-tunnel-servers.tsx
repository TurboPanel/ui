import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { SectionPanel, SettingRow, Toggle } from '@/components/ui'
import type { OrgServerRecord } from '@/lib/instance-api'
import { useSetServerTunnelCarrying } from '@/lib/queries/tunnel-routes'
import { spacing } from '@/lib/theme'
import { tunnelErrorMessage } from '@/lib/tunnels'
import { serverLabel, serverNeverCarries } from '@/lib/tunnel-runs'

/**
 * "Allow tunnels on this server": a server switched off here is never picked,
 * even by an all-servers tunnel and even when a datacenter gains it later.
 */
export function NetworkTunnelServers({
  orgId,
  servers,
}: Readonly<{ orgId: string; servers: readonly OrgServerRecord[] }>) {
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const set = useSetServerTunnelCarrying(orgId)

  async function change(serverId: string, carry: boolean) {
    setError(null)
    setPendingId(serverId)
    const result = await set.run({ serverId, carry })
    setPendingId(null)
    if (!result.ok) setError(tunnelErrorMessage(result.cause, 'Failed to change this server'))
  }

  if (servers.length === 0) return null
  return (
    <SectionPanel title="Servers" hint="Which servers may run tunnels">
      <Text style={panelStyles.muted}>
        Every server may run tunnels unless you switch it off here. A server switched off is never
        used, even by a tunnel that runs on all servers of its datacenter.
      </Text>
      {error ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.list}>
        {[...servers]
          .sort((a, b) => serverLabel(a).localeCompare(serverLabel(b)))
          .map((server) => (
            <SettingRow key={server.id} label={serverLabel(server)}>
              <Toggle
                value={!serverNeverCarries(server)}
                busy={pendingId === server.id}
                disabled={set.isPending}
                onLabel="May Run Tunnels"
                offLabel="Never Runs Tunnels"
                accessibilityLabel={`Allow tunnels on ${serverLabel(server)}`}
                onValueChange={(carry) => void change(server.id, carry)}
              />
            </SettingRow>
          ))}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
})
