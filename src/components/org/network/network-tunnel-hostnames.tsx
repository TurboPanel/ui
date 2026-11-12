import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  LoadingState,
  MonoText,
  TextField,
  TypeNameDeleteButton,
} from '@/components/ui'
import {
  confirmedDnsRecords,
  TunnelDnsRecordExistsError,
  TunnelDnsReplaceIncompleteError,
  type ConfirmedDnsRecord,
  type ExistingDnsRecord,
  type RemovedDnsRecord,
  type TunnelHostnameRecord,
} from '@/lib/instance-api'
import {
  useAddTunnelHostname,
  useRemoveTunnelHostname,
  useTunnelHostnames,
} from '@/lib/queries/tunnel-routes'
import { spacing } from '@/lib/theme'
import { tunnelErrorMessage } from '@/lib/tunnels'
import {
  DNS_REPLACE_INCOMPLETE_NOTE,
  DNS_REPLACE_NOTE,
  DNS_TOO_MANY_RECORDS_NOTE,
  dnsOutcome,
  dnsRecordLine,
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
          <MonoText style={styles.hostname}>{record.hostname}</MonoText>
          <Badge
            label={hostnameStatusLabel(record.status)}
            tone={hostnameStatusTone(record.status)}
          />
        </View>
        <TypeNameDeleteButton
          label="Remove"
          thing="Hostname"
          verb="Remove"
          name={record.hostname}
          description="Its Cloudflare route is removed, and so is the DNS name TurboPanel made for it."
          busy={remove.isPending}
          onConfirm={() => runRemove()}
        />
      </View>
      <Text style={panelStyles.muted}>{dnsOutcome(record.dns)}</Text>
    </View>
  )
}

/** The records that already hold the name, and the choice to replace them. */
function ExistingRecords({
  hostname,
  records,
  replaceable,
  busy,
  onReplace,
  onCancel,
}: Readonly<{
  hostname: string
  records: ExistingDnsRecord[]
  replaceable: boolean
  busy: boolean
  onReplace: () => void
  onCancel: () => void
}>) {
  return (
    <View style={panelStyles.detailCard} accessibilityRole="alert">
      <Text style={panelStyles.detailTitle}>
        {records.length === 1 ? 'Existing DNS Record' : 'Existing DNS Records'}
      </Text>
      <Text style={panelStyles.muted}>
        {hostname} already has {records.length === 1 ? 'this DNS record' : 'these DNS records'}:
      </Text>
      {records.map((record) => (
        <MonoText key={record.id}>{dnsRecordLine(record)}</MonoText>
      ))}
      {replaceable ? (
        <Text style={panelStyles.muted}>{DNS_REPLACE_NOTE}</Text>
      ) : (
        <Text style={panelStyles.muted}>{DNS_TOO_MANY_RECORDS_NOTE}</Text>
      )}
      <ButtonRow>
        {replaceable ? (
          <ConfirmButton
            label={records.length === 1 ? 'Replace Record' : 'Replace Records'}
            confirmLabel="Replace"
            prompt={`Replace ${records.length === 1 ? 'this record' : 'these records'} for ${hostname}?`}
            busy={busy}
            onConfirm={onReplace}
          />
        ) : null}
        <Button label="Cancel" size="sm" disabled={busy} onPress={onCancel} />
      </ButtonRow>
    </View>
  )
}

/** What a failed replacement already removed, so it can be added back by hand. */
function RemovedRecords({
  hostname,
  records,
  onDismiss,
}: Readonly<{ hostname: string; records: RemovedDnsRecord[]; onDismiss: () => void }>) {
  return (
    <View style={panelStyles.detailCard} accessibilityRole="alert">
      <Text style={panelStyles.detailTitle}>DNS Records Removed</Text>
      <Text style={panelStyles.error}>
        {hostname} was not added. Replacing its DNS records failed partway, after{' '}
        {records.length === 1 ? 'this record was' : 'these records were'} removed:
      </Text>
      {records.map((record) => (
        <MonoText key={dnsRecordLine(record)}>{dnsRecordLine(record)}</MonoText>
      ))}
      <Text style={panelStyles.muted}>{DNS_REPLACE_INCOMPLETE_NOTE}</Text>
      <ButtonRow>
        <Button label="Dismiss" size="sm" onPress={onDismiss} />
      </ButtonRow>
    </View>
  )
}

function AddHostnameForm({ orgId, tunnelId }: Readonly<{ orgId: string; tunnelId: string }>) {
  const [hostname, setHostname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [conflict, setConflict] = useState<TunnelDnsRecordExistsError | null>(null)
  const [removed, setRemoved] = useState<TunnelDnsReplaceIncompleteError | null>(null)
  const add = useAddTunnelHostname(orgId, tunnelId)
  const problem = hostname.length > 0 ? hostnameProblem(hostname) : null
  const canSend = !add.isPending && hostname.trim().length > 0 && !problem

  async function send(replaceDnsRecords?: ConfirmedDnsRecord[]) {
    setError(null)
    setDone(null)
    const result = await add.run({
      hostname: normalizeHostname(hostname),
      ...(replaceDnsRecords ? { replaceDnsRecords } : {}),
    })
    if (result.ok) {
      setConflict(null)
      setRemoved(null)
      setDone(dnsOutcome(result.value.hostname.dns))
      setHostname('')
      return
    }
    if (result.cause instanceof TunnelDnsRecordExistsError) {
      // Shown with the choice to replace; a second answer (the records changed) replaces the first.
      setConflict(result.cause)
      return
    }
    if (result.cause instanceof TunnelDnsReplaceIncompleteError) {
      // The shown records are partly gone, so the choice to replace them is no longer offered.
      setConflict(null)
      if (result.cause.removedRecords.length > 0) setRemoved(result.cause)
      else setError(result.cause.message)
      return
    }
    // Any other failure keeps the records on screen, so Replace can be tried again.
    setError(tunnelErrorMessage(result.cause, 'Failed to add the hostname'))
  }

  function edit(next: string) {
    setHostname(next)
    setConflict(null)
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
        onChangeText={edit}
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
      {removed ? (
        <RemovedRecords
          hostname={removed.hostname || normalizeHostname(hostname)}
          records={removed.removedRecords}
          onDismiss={() => setRemoved(null)}
        />
      ) : null}
      {conflict ? (
        <ExistingRecords
          hostname={conflict.hostname || normalizeHostname(hostname)}
          records={conflict.records}
          replaceable={conflict.replaceable}
          busy={add.isPending}
          onReplace={() => void send(confirmedDnsRecords(conflict.records))}
          onCancel={() => setConflict(null)}
        />
      ) : (
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
      )}
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
  // A hostname can be 253 characters with no break in it: let it shrink and wrap.
  hostname: { flexShrink: 1, minWidth: 0 },
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
    flexShrink: 1,
    gap: spacing.sm,
  },
})
