import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { SectionPanel } from '@/components/developer/section-panel'
import { developerStyles } from '@/components/developer/developer-styles'
import { useDeveloper } from '@/lib/developer-context'
import {
  daemonLabel,
  setInstanceTunnelToken,
  syncDevToAllDaemons,
  upgradeSystem,
} from '@/lib/instance-api'
import { DEVELOPER_SECTIONS } from '@/lib/developer-navigation'
import { colors } from '@/lib/theme'

const section = DEVELOPER_SECTIONS.find((s) => s.id === 'fleet')!

export function FleetSection() {
  const { healthOk, connections, fleet, staleCount } = useDeveloper()
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeResult, setUpgradeResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  const [tunnelToken, setTunnelToken] = useState('')
  const [savingToken, setSavingToken] = useState(false)
  const [tunnelResult, setTunnelResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  const canUpgrade = !upgrading && healthOk === true
  const canSync = !syncing && healthOk === true && fleet.length > 0
  const canSaveToken = !savingToken && healthOk === true

  const onSaveTunnelToken = async () => {
    setSavingToken(true)
    setTunnelResult(null)
    try {
      await setInstanceTunnelToken(tunnelToken.trim())
      setTunnelResult({
        ok: true,
        message: tunnelToken.trim()
          ? 'Tunnel token saved; the co-located daemon is starting cloudflared.'
          : 'Tunnel token cleared; the instance tunnel has been torn down.',
      })
      setTunnelToken('')
    } catch (err) {
      setTunnelResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to set tunnel token',
      })
    } finally {
      setSavingToken(false)
    }
  }

  const onSyncDev = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await syncDevToAllDaemons()
      const failed = result.results.filter((r) => !r.ok)
      setSyncResult({
        ok: result.ok,
        message: result.ok
          ? `Pushed the current daemon build to ${result.results.length} agent(s); they are restarting.`
          : `Synced with errors: ${failed.map((r) => `${r.daemonId} (${r.error ?? 'failed'})`).join(', ')}`,
      })
    } catch (err) {
      setSyncResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Dev sync failed',
      })
    } finally {
      setSyncing(false)
    }
  }

  const onUpgrade = async () => {
    setUpgrading(true)
    setUpgradeResult(null)
    try {
      const result = await upgradeSystem()
      setUpgradeResult({
        ok: true,
        message: `Upgrade started at commit ${result.commit}. This instance will restart shortly and connected agents will update.`,
      })
    } catch (err) {
      setUpgradeResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Upgrade failed',
      })
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <SectionPanel title={section.label} hint={section.hint}>
      <View style={developerStyles.row}>
        <View style={[developerStyles.dot, healthOk ? developerStyles.dotOk : developerStyles.dotBad]} />
        <Text style={developerStyles.rowText}>
          API {healthOk === null ? 'checking…' : healthOk ? 'healthy' : 'unreachable'}
        </Text>
        <Text style={developerStyles.fleetCount}>
          {fleet.length} server{fleet.length === 1 ? '' : 's'}
          {staleCount > 0 ? ` (${staleCount} stale sockets clearing…)` : ''}
        </Text>
      </View>

      <Text style={developerStyles.inlineLabel}>System upgrade</Text>
      <Text style={developerStyles.muted}>
        Fetch origin/trunk, notify connected agents to update, and restart this instance.
      </Text>
      <Pressable
        style={[developerStyles.button, !canUpgrade && developerStyles.buttonDisabled]}
        onPress={() => void onUpgrade()}
        disabled={!canUpgrade}
      >
        {upgrading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.buttonText} />
            <Text style={developerStyles.buttonText}>Upgrading…</Text>
          </View>
        ) : (
          <Text style={developerStyles.buttonText}>Upgrade System</Text>
        )}
      </Pressable>
      {upgradeResult ? (
        <Text style={upgradeResult.ok ? developerStyles.muted : developerStyles.error}>
          {upgradeResult.message}
        </Text>
      ) : null}

      <Text style={developerStyles.inlineLabel}>Dev sync</Text>
      <Text style={developerStyles.muted}>
        Package this host's current daemon build and push it to all connected agents over the
        websocket (no git push/pull); each agent unpacks and restarts.
      </Text>
      <Pressable
        style={[developerStyles.button, !canSync && developerStyles.buttonDisabled]}
        onPress={() => void onSyncDev()}
        disabled={!canSync}
      >
        {syncing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.buttonText} />
            <Text style={developerStyles.buttonText}>Syncing…</Text>
          </View>
        ) : (
          <Text style={developerStyles.buttonText}>Sync Dev Build</Text>
        )}
      </Pressable>
      {syncResult ? (
        <Text style={syncResult.ok ? developerStyles.muted : developerStyles.error}>
          {syncResult.message}
        </Text>
      ) : null}

      <Text style={developerStyles.inlineLabel}>Cloudflare tunnel</Text>
      <Text style={developerStyles.muted}>
        Set the instance's Cloudflare tunnel token so the co-located daemon runs cloudflared and
        external agents can reach this instance. Leave empty and save to tear the tunnel down.
      </Text>
      <TextInput
        style={developerStyles.input}
        placeholder="Cloudflare tunnel token"
        placeholderTextColor={colors.textMuted}
        value={tunnelToken}
        onChangeText={setTunnelToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        editable={!savingToken}
      />
      <Pressable
        style={[developerStyles.button, !canSaveToken && developerStyles.buttonDisabled]}
        onPress={() => void onSaveTunnelToken()}
        disabled={!canSaveToken}
      >
        {savingToken ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.buttonText} />
            <Text style={developerStyles.buttonText}>Saving…</Text>
          </View>
        ) : (
          <Text style={developerStyles.buttonText}>Save Tunnel Token</Text>
        )}
      </Pressable>
      {tunnelResult ? (
        <Text style={tunnelResult.ok ? developerStyles.muted : developerStyles.error}>
          {tunnelResult.message}
        </Text>
      ) : null}

      {fleet.length === 0 ? (
        <Text style={developerStyles.muted}>Waiting for daemon connections…</Text>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={developerStyles.inlineLabel}>Connected agents</Text>
          {fleet.map((conn) => (
            <View key={conn.id} style={developerStyles.detailCard}>
              <Text style={developerStyles.detailTitle}>
                {daemonLabel(conn.id, connections)}
              </Text>
              <Text style={developerStyles.detailLine}>
                <Text style={developerStyles.detailLabel}>Connection: </Text>
                {conn.id}
              </Text>
              {conn.hostname ? (
                <Text style={developerStyles.detailLine}>
                  <Text style={developerStyles.detailLabel}>Hostname: </Text>
                  {conn.hostname}
                </Text>
              ) : null}
              {conn.nodeId ? (
                <Text style={developerStyles.detailLine}>
                  <Text style={developerStyles.detailLabel}>Node ID: </Text>
                  {conn.nodeId}
                </Text>
              ) : null}
              {conn.remoteAddress ? (
                <Text style={developerStyles.detailLine}>
                  <Text style={developerStyles.detailLabel}>Remote: </Text>
                  {conn.remoteAddress}
                </Text>
              ) : null}
              <Text style={developerStyles.detailLine}>
                <Text style={developerStyles.detailLabel}>Connected: </Text>
                {new Date(conn.connectedAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </SectionPanel>
  )
}
