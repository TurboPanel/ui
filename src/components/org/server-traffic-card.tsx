import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Badge, Button, Checkbox, InlineNotice, SectionPanel, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { parseDatacenterPriorityDraft } from '@/lib/datacenter-routing'
import type {
  DatacenterRecord,
  ServerTrafficMapNetwork,
  ServerTrafficMapNic,
  ServerTrafficMapPeer,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import {
  useChooseServerTrafficNetwork,
  useDatacenters,
  useServerTrafficMap,
  useUpdateDatacenter,
} from '@/lib/queries/topology'
import {
  linkLabel,
  networkDownNote,
  orderedNetworks,
  peerSummary,
  tiedNetworkIds,
  trafficStateLabel,
  trafficStateTone,
} from '@/lib/server-traffic'
import { colors, spacing } from '@/lib/theme'

const EXPLANATION =
  'Servers in the same organization talk to each other over the best network they share. ' +
  'Every network has a priority number: the lowest number is used first. ' +
  'If that network goes down, traffic moves to the next one by itself and moves back when it returns. ' +
  'These choices apply to every server in the organization, not just this one.'

function countCarrying(peers: readonly ServerTrafficMapPeer[], datacenterId: string): number {
  return peers.filter((peer) => peer.chosenDatacenterId === datacenterId).length
}

function carryingLine(count: number): string | null {
  if (count === 0) return null
  return `Carrying traffic to ${count} ${count === 1 ? 'server' : 'servers'} from here`
}

function PriorityEditor({
  orgId,
  dc,
  first,
}: Readonly<{ orgId: string; dc: DatacenterRecord; first: boolean }>) {
  const update = useUpdateDatacenter(orgId, dc.id)
  const choose = useChooseServerTrafficNetwork(orgId)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = dc.name ?? 'Unnamed network'
  const busy = update.isPending || choose.isPending

  const savePriority = async () => {
    const parsed = parseDatacenterPriorityDraft(draft ?? String(dc.priority))
    if (!parsed.ok) {
      setError(parsed.reason)
      return
    }
    setError(null)
    const result = await update.run({ options: { ...dc.options, priority: parsed.priority } })
    if (result.ok) setDraft(null)
  }

  return (
    <View style={styles.priorityRow}>
      <View style={styles.priorityField}>
        <TextField
          label="Priority (lowest number is used first)"
          value={draft ?? String(dc.priority)}
          onChangeText={setDraft}
          keyboardType="number-pad"
          error={error ?? update.actionError ?? choose.actionError}
          accessibilityLabel={`Priority for ${name}`}
        />
      </View>
      <Button
        label="Save priority"
        accessibilityLabel={`Save priority for ${name}`}
        size="sm"
        variant="secondary"
        onPress={() => void savePriority()}
        disabled={busy || draft === null}
      />
      {first ? null : (
        <Button
          label="Use this one first"
          accessibilityLabel={`Use ${name} first`}
          size="sm"
          onPress={() => void choose.run(dc.id)}
          disabled={busy}
        />
      )}
    </View>
  )
}

function NetworkControls({
  orgId,
  dc,
  first,
}: Readonly<{ orgId: string; dc: DatacenterRecord; first: boolean }>) {
  const update = useUpdateDatacenter(orgId, dc.id)
  const name = dc.name ?? 'Unnamed network'
  return (
    <View style={styles.controls}>
      <Checkbox
        checked={dc.trusted}
        onPress={() => void update.run({ options: { ...dc.options, trusted: !dc.trusted } })}
        disabled={update.isPending}
        label="Use this network for server traffic"
        accessibilityLabel={`Use ${name} for server traffic`}
      />
      {dc.trusted ? <PriorityEditor orgId={orgId} dc={dc} first={first} /> : null}
      {update.actionError ? <Text style={panelStyles.muted}>{update.actionError}</Text> : null}
    </View>
  )
}

function NetworkRow({
  orgId,
  dc,
  position,
  tied,
  carrying,
  canManage,
}: Readonly<{
  orgId: string
  dc: DatacenterRecord
  position: number | null
  tied: boolean
  carrying: number
  canManage: boolean
}>) {
  const line = carryingLine(carrying)
  const first = position === 1 && !tied
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={panelStyles.detailTitle}>{dc.name ?? 'Unnamed network'}</Text>
        {position === 1 ? <Badge label="Used first" tone="ok" /> : null}
        {position !== null && position > 1 ? (
          <Badge label={`Number ${position}`} tone="muted" />
        ) : null}
        {tied ? <Badge label="Same priority as another" tone="pending" /> : null}
        {dc.trusted ? null : <Badge label="Not used" tone="muted" />}
      </View>
      {line ? <Text style={panelStyles.muted}>{line}</Text> : null}
      {canManage ? (
        <NetworkControls orgId={orgId} dc={dc} first={first} />
      ) : (
        <Text style={panelStyles.muted}>{dc.trusted ? `Priority ${dc.priority}` : 'Not used'}</Text>
      )}
    </View>
  )
}

function PeerNetworkLine({ net }: Readonly<{ net: ServerTrafficMapNetwork }>) {
  const note = networkDownNote(net)
  return (
    <View style={styles.netLine}>
      <Text style={panelStyles.muted}>
        {net.name ?? 'Unnamed network'} · priority {net.priority}
      </Text>
      <Badge label={trafficStateLabel(net.state)} tone={trafficStateTone(net.state)} />
      {note ? <Text style={panelStyles.muted}>{note}</Text> : null}
    </View>
  )
}

function PeerRow({ peer }: Readonly<{ peer: ServerTrafficMapPeer }>) {
  return (
    <View style={styles.row}>
      <Text style={panelStyles.detailTitle}>{peer.name ?? 'Unnamed server'}</Text>
      <Text style={panelStyles.muted}>
        {peerSummary(peer.chosenDatacenterId, peer.sharedNetworks)}
      </Text>
      {peer.sharedNetworks.map((net) => (
        <PeerNetworkLine key={net.datacenterId} net={net} />
      ))}
    </View>
  )
}

function NicRow({ nic }: Readonly<{ nic: ServerTrafficMapNic }>) {
  const addresses = nic.addresses.map((entry) => entry.address).join(', ')
  return (
    <View style={styles.netLine}>
      <Text style={panelStyles.detailTitle}>{nic.name}</Text>
      <Badge label={linkLabel(nic.link)} tone={nic.link === 'down' ? 'danger' : 'muted'} />
      {addresses ? <Text style={panelStyles.muted}>{addresses}</Text> : null}
    </View>
  )
}

function NetworksList({
  orgId,
  datacenters,
  peers,
  canManage,
}: Readonly<{
  orgId: string
  datacenters: readonly DatacenterRecord[]
  peers: readonly ServerTrafficMapPeer[]
  canManage: boolean
}>) {
  const { used, unused } = orderedNetworks(datacenters)
  const tied = tiedNetworkIds(used)
  const rows = [
    ...used.map((dc, index) => ({ dc, position: index + 1 })),
    ...unused.map((dc) => ({ dc, position: null })),
  ]
  return (
    <View style={styles.list}>
      {rows.map(({ dc, position }) => (
        <NetworkRow
          key={dc.id}
          orgId={orgId}
          dc={dc}
          position={position}
          tied={tied.has(dc.id)}
          carrying={countCarrying(peers, dc.id)}
          canManage={canManage}
        />
      ))}
    </View>
  )
}

/**
 * "Server traffic": which networks servers use to reach each other, in what
 * order, and what is happening on them now. Priorities are per organization
 * (the API stores them on the network), the state is read from this server.
 */
export function ServerTrafficCard({
  orgId,
  serverId,
}: Readonly<{ orgId: string; serverId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const datacenters = useDatacenters(orgId)
  const map = useServerTrafficMap(orgId, serverId)
  const networks = datacenters.data?.datacenters ?? []
  const peers = map.data?.peers ?? []
  const nics = map.data?.nics ?? []

  if (datacenters.isError && map.isError) {
    return (
      <SectionPanel title="Server traffic">
        <InlineNotice
          tone="warning"
          title="Could not load the networks."
          body="Try again in a moment."
        />
      </SectionPanel>
    )
  }
  if (networks.length === 0 && peers.length === 0) {
    return (
      <SectionPanel title="Server traffic" hint={EXPLANATION}>
        <Text style={panelStyles.muted}>
          No networks are set up yet. Add servers to a network and they will show here.
        </Text>
      </SectionPanel>
    )
  }
  return (
    <SectionPanel title="Server traffic" hint={EXPLANATION}>
      <Text style={panelStyles.detailTitle}>Networks, in the order they are used</Text>
      <NetworksList orgId={orgId} datacenters={networks} peers={peers} canManage={canManage} />
      <Text style={panelStyles.detailTitle}>Other servers reached from here</Text>
      {peers.length === 0 ? (
        <Text style={panelStyles.muted}>
          This server shares no network with another server yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {peers.map((peer) => (
            <PeerRow key={peer.serverId} peer={peer} />
          ))}
        </View>
      )}
      {map.data?.truncated ? (
        <Text style={panelStyles.muted}>Only the first 100 servers are shown.</Text>
      ) : null}
      {nics.length > 0 ? (
        <>
          <Text style={panelStyles.detailTitle}>Network cards on this server</Text>
          <View style={styles.list}>
            {nics.map((nic) => (
              <NicRow key={nic.name} nic={nic} />
            ))}
          </View>
        </>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: {
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSubtle,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  netLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  controls: { gap: spacing.sm },
  priorityRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
  priorityField: { minWidth: 200, flexGrow: 1 },
})
