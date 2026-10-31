import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, ConfirmButton, SectionPanel, SettingRow, Toggle } from '@/components/ui'
import type { OrgServerRecord, TunnelRecord } from '@/lib/instance-api'
import { useSetServerTunnelCarrying } from '@/lib/queries/tunnel-routes'
import { spacing } from '@/lib/theme'
import { tunnelErrorMessage } from '@/lib/tunnels'
import { serverLabel, serverNeverCarries, tunnelsRunningOn } from '@/lib/tunnel-runs'

/**
 * "Allow tunnels on this server": a server switched off here is never picked,
 * even by an all-servers tunnel and even when a datacenter gains it later.
 * Switching one off while it runs a tunnel's connector asks first, because
 * that connector is removed from the tunnel.
 */
export function NetworkTunnelServers({
  orgId,
  servers,
  tunnels = [],
}: Readonly<{
  orgId: string
  servers: readonly OrgServerRecord[]
  tunnels?: readonly TunnelRecord[]
}>) {
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [askingId, setAskingId] = useState<string | null>(null)
  const set = useSetServerTunnelCarrying(orgId)

  async function change(serverId: string, carry: boolean) {
    setError(null)
    setAskingId(null)
    setPendingId(serverId)
    const result = await set.run({ serverId, carry })
    setPendingId(null)
    if (!result.ok) setError(tunnelErrorMessage(result.cause, 'Failed to change this server'))
  }

  function onToggle(serverId: string, carry: boolean) {
    if (!carry && tunnelsRunningOn(tunnels, serverId).length > 0) {
      setAskingId(serverId)
      return
    }
    void change(serverId, carry)
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
          .map((server) => {
            const running = tunnelsRunningOn(tunnels, server.id)
            return (
              <View key={server.id} style={styles.item}>
                <SettingRow label={serverLabel(server)}>
                  <Toggle
                    value={!serverNeverCarries(server)}
                    busy={pendingId === server.id}
                    disabled={set.isPending}
                    onLabel="May Run Tunnels"
                    offLabel="Never Runs Tunnels"
                    accessibilityLabel={`Allow tunnels on ${serverLabel(server)}`}
                    onValueChange={(carry) => onToggle(server.id, carry)}
                  />
                </SettingRow>
                {askingId === server.id ? (
                  <View style={styles.ask}>
                    <Text style={panelStyles.muted}>
                      {serverLabel(server)} runs {running.map((t) => t.name).join(', ')}. Switching
                      it off removes its connector from{' '}
                      {running.length === 1 ? 'that tunnel' : 'those tunnels'}.
                    </Text>
                    <ButtonRow>
                      <ConfirmButton
                        label="Switch Off Tunnels Here"
                        confirmLabel="Switch Off"
                        prompt="Remove this server's connector and stop it running tunnels?"
                        stacked
                        busy={pendingId === server.id}
                        onConfirm={() => void change(server.id, false)}
                      />
                      <Button
                        label="Keep It On"
                        size="sm"
                        disabled={pendingId === server.id}
                        onPress={() => setAskingId(null)}
                      />
                    </ButtonRow>
                  </View>
                ) : null}
              </View>
            )
          })}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
  item: { gap: spacing.xs },
  ask: { gap: spacing.sm },
})
