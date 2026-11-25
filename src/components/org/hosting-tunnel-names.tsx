import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ExistingRecords, RemovedRecords } from '@/components/org/network/network-tunnel-hostnames'
import { Badge, Button, ButtonRow, Select } from '@/components/ui'
import {
  isForbidden,
  noTunnelHint,
  SERVE_THROUGH_TUNNEL_LABEL,
  tunnelsForServer,
} from '@/lib/hosting-tunnel-offer'
import {
  confirmedDnsRecords,
  TunnelDnsRecordExistsError,
  TunnelDnsReplaceIncompleteError,
  type HostingTunnelPath,
  type TunnelRecord,
} from '@/lib/instance-api'
import { tunnelPathFor } from '@/lib/name-certificates'
import { useHostingCertificate } from '@/lib/queries/hosting-certificate'
import { useAddTunnelHostname, useTunnels } from '@/lib/queries/tunnel-routes'
import { colors, spacing } from '@/lib/theme'
import { tunnelErrorMessage } from '@/lib/tunnels'
import { normalizeHostname } from '@/lib/tunnel-runs'

function NameRow({
  orgId,
  hostname,
  path,
  candidates,
  serverKnown,
  tunnelCount,
  locked,
}: Readonly<{
  orgId: string
  hostname: string
  path: HostingTunnelPath | undefined
  candidates: readonly TunnelRecord[]
  serverKnown: boolean
  tunnelCount: number
  locked: boolean
}>) {
  const [picked, setPicked] = useState<string | null>(null)
  const tunnel = candidates.find((candidate) => candidate.id === picked) ?? candidates[0] ?? null
  const add = useAddTunnelHostname(orgId, tunnel?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<TunnelDnsRecordExistsError | null>(null)
  const [removed, setRemoved] = useState<TunnelDnsReplaceIncompleteError | null>(null)

  async function send(replaceRecords?: TunnelDnsRecordExistsError['records']) {
    if (!tunnel) return
    setError(null)
    const result = await add.run({
      hostname: normalizeHostname(hostname),
      ...(replaceRecords ? { replaceDnsRecords: confirmedDnsRecords(replaceRecords) } : {}),
    })
    if (result.ok) {
      setConflict(null)
      setRemoved(null)
      return
    }
    if (result.cause instanceof TunnelDnsRecordExistsError) {
      setConflict(result.cause)
      return
    }
    if (result.cause instanceof TunnelDnsReplaceIncompleteError) {
      setConflict(null)
      if (result.cause.removedRecords.length > 0) setRemoved(result.cause)
      else setError(result.cause.message)
      return
    }
    setError(
      isForbidden(result.cause)
        ? 'You do not have permission to put names on tunnels.'
        : tunnelErrorMessage(result.cause, 'Failed to add the hostname to the tunnel')
    )
  }

  let body
  if (path) {
    body = <Badge label={`Carried by ${path.tunnelName}`} tone="ok" />
  } else if (tunnel) {
    body = (
      <>
        {candidates.length > 1 ? (
          <Select
            accessibilityLabel={`Tunnel for ${hostname}`}
            value={tunnel.id}
            options={candidates.map((candidate) => ({
              value: candidate.id,
              label: candidate.name,
            }))}
            placeholder="Choose a tunnel"
            disabled={locked || add.isPending}
            onChange={(value) => {
              setPicked(value)
              setConflict(null)
            }}
          />
        ) : null}
        {conflict ? (
          <ExistingRecords
            hostname={conflict.hostname || hostname}
            records={conflict.records}
            replaceable={conflict.replaceable}
            busy={add.isPending}
            onReplace={() => void send(conflict.records)}
            onCancel={() => setConflict(null)}
          />
        ) : (
          <ButtonRow>
            <Button
              label={SERVE_THROUGH_TUNNEL_LABEL}
              accessibilityLabel={`${SERVE_THROUGH_TUNNEL_LABEL}: ${hostname}`}
              size="sm"
              variant="secondary"
              busy={add.isPending}
              disabled={locked}
              onPress={() => void send()}
            />
          </ButtonRow>
        )}
      </>
    )
  } else {
    body = <Text style={styles.line}>{noTunnelHint({ serverKnown, tunnelCount })}</Text>
  }

  return (
    <View style={styles.row}>
      <Text style={styles.hostname}>{hostname}</Text>
      {body}
      {removed ? (
        <RemovedRecords
          hostname={removed.hostname || hostname}
          records={removed.removedRecords}
          onDismiss={() => setRemoved(null)}
        />
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * Which tunnel carries each name of a saved site, and for a name none carries,
 * Serve Through Tunnel when a tunnel runs on the environment's server. It adds
 * the name to the tunnel with the call the Network page uses; the control plane
 * links the name to this site by its hostname, so no site id is sent.
 */
export function HostingTunnelNames({
  orgId,
  hostingId,
  serverId,
  locked,
  canManage,
}: Readonly<{
  orgId: string
  hostingId: string
  /** Only people who manage the organization can put a name on a tunnel. */
  canManage: boolean
  /** The environment's server (its own or the project's default); null when none is set. */
  serverId: string | null
  locked: boolean
}>) {
  const hostingQuery = useHostingCertificate(orgId, hostingId)
  const tunnelsQuery = useTunnels(orgId, { enabled: canManage })
  const hosting = hostingQuery.data?.hosting
  // Only people who manage the organization read the list; for the rest it is never asked for.
  const tunnels = canManage ? tunnelsQuery.data?.tunnels : []
  if (hostingQuery.isError || (canManage && tunnelsQuery.isError)) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Tunnels</Text>
        <Text style={styles.error} accessibilityRole="alert">
          Could not load the tunnels for this site. Reload to try again.
        </Text>
      </View>
    )
  }
  if (!hosting?.names || hosting.names.length === 0 || !tunnels) return null
  const candidates = canManage ? tunnelsForServer(tunnels, serverId) : []
  const names = canManage
    ? hosting.names
    : hosting.names.filter((name) => tunnelPathFor(name.hostname, hosting.tunnels))
  if (names.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Tunnels</Text>
      {names.map((name) => (
        <NameRow
          key={name.hostname}
          orgId={orgId}
          hostname={name.hostname}
          path={tunnelPathFor(name.hostname, hosting.tunnels)}
          candidates={candidates}
          serverKnown={serverId !== null}
          tunnelCount={tunnels.length}
          locked={locked}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.sm },
  title: { color: colors.textMuted, fontSize: 12 },
  row: { gap: spacing.xs },
  hostname: { color: colors.textBody, fontSize: 14, fontWeight: '600' },
  line: { color: colors.textBody, fontSize: 12, lineHeight: 17 },
  error: { color: colors.errorText, fontSize: 12, lineHeight: 17 },
})
