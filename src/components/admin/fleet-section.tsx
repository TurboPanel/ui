import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { SectionPanel } from '@/components/admin/section-panel'
import { adminStyles } from '@/components/admin/admin-styles'
import { useAdmin } from '@/lib/admin-context'
import {
  daemonLabel,
  setInstanceTunnelToken,
  syncDevToAllDaemons,
  upgradeSystem,
} from '@/lib/instance-api'
import { ADMIN_SECTIONS } from '@/lib/admin-navigation'
import { colors } from '@/lib/admin-theme'

const section = ADMIN_SECTIONS.find((s) => s.id === 'fleet')!

export function FleetSection() {
  const { healthOk, connections, fleet, staleCount } = useAdmin()
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
      <View style={adminStyles.row}>
        <View style={[adminStyles.dot, healthOk ? adminStyles.dotOk : adminStyles.dotBad]} />
        <Text style={adminStyles.rowText}>
          API {healthOk === null ? 'checking…' : healthOk ? 'healthy' : 'unreachable'}
        </Text>
        <Text style={adminStyles.fleetCount}>
          {fleet.length} server{fleet.length === 1 ? '' : 's'}
          {staleCount > 0 ? ` (${staleCount} stale sockets clearing…)` : ''}
        </Text>
      </View>

      <Text style={adminStyles.inlineLabel}>System upgrade</Text>
      <Text style={adminStyles.muted}>
        Fetch origin/trunk, notify connected agents to update, and restart this instance.
      </Text>
      <Pressable
        style={[adminStyles.button, !canUpgrade && adminStyles.buttonDisabled]}
        onPress={() => void onUpgrade()}
        disabled={!canUpgrade}
      >
        {upgrading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.buttonText} />
            <Text style={adminStyles.buttonText}>Upgrading…</Text>
          </View>
        ) : (
          <Text style={adminStyles.buttonText}>Upgrade System</Text>
        )}
      </Pressable>
      {upgradeResult ? (
        <Text style={upgradeResult.ok ? adminStyles.muted : adminStyles.error}>
          {upgradeResult.message}
        </Text>
      ) : null}

      <Text style={adminStyles.inlineLabel}>Dev sync</Text>
      <Text style={adminStyles.muted}>
        Package this host's current daemon build and push it to all connected agents over the
        websocket (no git push/pull); each agent unpacks and restarts.
      </Text>
      <Pressable
        style={[adminStyles.button, !canSync && adminStyles.buttonDisabled]}
        onPress={() => void onSyncDev()}
        disabled={!canSync}
      >
        {syncing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.buttonText} />
            <Text style={adminStyles.buttonText}>Syncing…</Text>
          </View>
        ) : (
          <Text style={adminStyles.buttonText}>Sync Dev Build</Text>
        )}
      </Pressable>
      {syncResult ? (
        <Text style={syncResult.ok ? adminStyles.muted : adminStyles.error}>
          {syncResult.message}
        </Text>
      ) : null}

      <Text style={adminStyles.inlineLabel}>Cloudflare tunnel</Text>
      <Text style={adminStyles.muted}>
        Set the instance's Cloudflare tunnel token so the co-located daemon runs cloudflared and
        external agents can reach this instance. Leave empty and save to tear the tunnel down.
      </Text>
      <TextInput
        style={adminStyles.input}
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
        style={[adminStyles.button, !canSaveToken && adminStyles.buttonDisabled]}
        onPress={() => void onSaveTunnelToken()}
        disabled={!canSaveToken}
      >
        {savingToken ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.buttonText} />
            <Text style={adminStyles.buttonText}>Saving…</Text>
          </View>
        ) : (
          <Text style={adminStyles.buttonText}>Save Tunnel Token</Text>
        )}
      </Pressable>
      {tunnelResult ? (
        <Text style={tunnelResult.ok ? adminStyles.muted : adminStyles.error}>
          {tunnelResult.message}
        </Text>
      ) : null}

      {fleet.length === 0 ? (
        <Text style={adminStyles.muted}>Waiting for daemon connections…</Text>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={adminStyles.inlineLabel}>Connected agents</Text>
          {fleet.map((conn) => (
            <View key={conn.id} style={adminStyles.detailCard}>
              <Text style={adminStyles.detailTitle}>
                {daemonLabel(conn.id, connections)}
              </Text>
              <Text style={adminStyles.detailLine}>
                <Text style={adminStyles.detailLabel}>Connection: </Text>
                {conn.id}
              </Text>
              {conn.hostname ? (
                <Text style={adminStyles.detailLine}>
                  <Text style={adminStyles.detailLabel}>Hostname: </Text>
                  {conn.hostname}
                </Text>
              ) : null}
              {conn.nodeId ? (
                <Text style={adminStyles.detailLine}>
                  <Text style={adminStyles.detailLabel}>Node ID: </Text>
                  {conn.nodeId}
                </Text>
              ) : null}
              {conn.remoteAddress ? (
                <Text style={adminStyles.detailLine}>
                  <Text style={adminStyles.detailLabel}>Remote: </Text>
                  {conn.remoteAddress}
                </Text>
              ) : null}
              <Text style={adminStyles.detailLine}>
                <Text style={adminStyles.detailLabel}>Connected: </Text>
                {new Date(conn.connectedAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </SectionPanel>
  )
}
