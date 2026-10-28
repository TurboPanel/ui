import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  Checkbox,
  ConfirmButton,
  LoadingState,
  MonoText,
  TextField,
} from '@/components/ui'
import type { TunnelHostnameRecord } from '@/lib/instance-api'
import {
  useAddTunnelHostname,
  useRemoveTunnelHostname,
  useTunnelHostnames,
} from '@/lib/queries/tunnel-routes'
import { spacing } from '@/lib/theme'
import { tunnelErrorMessage } from '@/lib/tunnels'
import {
  dnsOutcome,
  hostnameProblem,
  hostnameStatusLabel,
  hostnameStatusTone,
  normalizeHostname,
} from '@/lib/tunnel-runs'

function HostnameRow({
  orgId,
  tunnelId,
  record,
  onError,
}: Readonly<{
  orgId: string
  tunnelId: string
  record: TunnelHostnameRecord
  onError: (message: string | null) => void
}>) {
  const remove = useRemoveTunnelHostname(orgId, tunnelId)

  async function runRemove() {
    onError(null)
    const result = await remove.run(record.id)
    if (!result.ok) onError(tunnelErrorMessage(result.cause, 'Failed to remove the hostname'))
  }

  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.rowHeader}>
        <View style={styles.titleRow}>
          <MonoText>{record.hostname}</MonoText>
          <Badge
            label={hostnameStatusLabel(record.status)}
            tone={hostnameStatusTone(record.status)}
          />
        </View>
        <ConfirmButton
          label="Remove"
          confirmLabel="Remove Hostname"
          prompt="Remove this hostname from the tunnel? Its Cloudflare route is removed, and so is the DNS name TurboPanel made for it."
          stacked
          busy={remove.isPending}
          onConfirm={() => void runRemove()}
        />
      </View>
      <Text style={panelStyles.muted}>{dnsOutcome(record.dns)}</Text>
    </View>
  )
}

function AddHostnameForm({ orgId, tunnelId }: Readonly<{ orgId: string; tunnelId: string }>) {
  const [hostname, setHostname] = useState('')
  const [alsoPublic, setAlsoPublic] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const add = useAddTunnelHostname(orgId, tunnelId)
  const problem = hostname.length > 0 ? hostnameProblem(hostname) : null
  const canSend = !add.isPending && hostname.trim().length > 0 && !problem

  async function send() {
    setError(null)
    setDone(null)
    const result = await add.run({
      hostname: normalizeHostname(hostname),
      isLocalOnly: !alsoPublic,
    })
    if (result.ok) {
      setDone(dnsOutcome(result.value.hostname.dns))
      setHostname('')
      setAlsoPublic(false)
      return
    }
    setError(tunnelErrorMessage(result.cause, 'Failed to add the hostname'))
  }

  return (
    <View style={styles.form}>
      {error ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {done ? <Text style={panelStyles.muted}>{done}</Text> : null}
      <TextField
        label="Hostname"
        value={hostname}
        onChangeText={setHostname}
        editable={!add.isPending}
        error={problem}
        placeholder="app.example.com"
        hint="TurboPanel adds a route to this tunnel and, when the API Token can edit the zone, the DNS name too. A site's own hostname never needs DNS set up first."
        accessibilityLabel="Tunnel hostname"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        mono
      />
      <Checkbox
        checked={alsoPublic}
        onPress={() => setAlsoPublic((v) => !v)}
        disabled={add.isPending}
        label="This name is also a public site name"
        accessibilityLabel="This name is also a public site name"
      />
      <ButtonRow>
        <Button
          label="Add Hostname"
          variant="primary"
          size="sm"
          busy={add.isPending}
          disabled={!canSend}
          onPress={() => void send()}
          accessibilityLabel="Add hostname to tunnel"
        />
      </ButtonRow>
    </View>
  )
}

/** The hostnames a tunnel carries, each with what happened to its DNS name, and a form to add one. */
export function NetworkTunnelHostnames({
  orgId,
  tunnelId,
}: Readonly<{ orgId: string; tunnelId: string }>) {
  const query = useTunnelHostnames(orgId, tunnelId)
  const [error, setError] = useState<string | null>(null)
  const hostnames = query.data?.hostnames ?? []

  return (
    <View style={styles.root}>
      <Text style={panelStyles.detailTitle}>Hostnames</Text>
      {error ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {query.isError ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {tunnelErrorMessage(query.error, 'Failed to load the hostnames')}
        </Text>
      ) : null}
      {query.isLoading ? <LoadingState label="Loading hostnames…" /> : null}
      {!query.isLoading && hostnames.length === 0 ? (
        <Text style={panelStyles.muted}>No hostnames on this tunnel yet.</Text>
      ) : null}
      {hostnames.map((record) => (
        <HostnameRow
          key={record.id}
          orgId={orgId}
          tunnelId={tunnelId}
          record={record}
          onError={setError}
        />
      ))}
      <AddHostnameForm orgId={orgId} tunnelId={tunnelId} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  form: { gap: spacing.sm },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
