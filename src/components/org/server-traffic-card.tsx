import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  Button,
  ConfirmButton,
  InlineNotice,
  LoadingState,
  SectionPanel,
  TextField,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { parseDatacenterPriorityDraft } from '@/lib/datacenter-routing'
import type {
  DatacenterRecord,
  ServerTrafficMapNetwork,
  ServerTrafficMapNic,
  ServerTrafficMapPeer,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { useOrgServers } from '@/lib/queries/servers'
import { resolveServerLabel } from '@/lib/resource-labels'
import {
  useChooseServerTrafficNetwork,
  useDatacenters,
  useServerTrafficMap,
  useUpdateDatacenter,
} from '@/lib/queries/topology'
import {
  linkLabel,
  networkBadge,
  networkDownNote,
  orderedNetworks,
  peerSummary,
  renumberedLines,
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

const EVERY_SERVER = 'This applies to every server in the organization.'

function PriorityEditor({
  orgId,
  dc,
  first,
  names,
}: Readonly<{
  orgId: string
  dc: DatacenterRecord
  first: boolean
  names: ReadonlyMap<string, string>
}>) {
  const update = useUpdateDatacenter(orgId, dc.id)
  const choose = useChooseServerTrafficNetwork(orgId)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moved, setMoved] = useState<string[]>([])
  const name = dc.name ?? 'Unnamed network'
  const busy = update.isPending || choose.isPending

  const savePriority = async () => {
    if (busy) return
    const parsed = parseDatacenterPriorityDraft(draft ?? String(dc.priority))
    if (!parsed.ok) {
      setError(parsed.reason)
      return
    }
    setError(null)
    const result = await update.run({ options: { ...dc.options, priority: parsed.priority } })
    if (result.ok) setDraft(null)
  }
  const makeFirst = async () => {
    if (busy) return
    const result = await choose.run(dc.id)
    if (result.ok) setMoved(renumberedLines(result.value.changes, names))
  }

  return (
    <View style={styles.controls}>
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
          <ConfirmButton
            label="Use this one first"
            prompt={`Make ${name} the first choice? Other networks may get new priority numbers. ${EVERY_SERVER}`}
            confirmLabel="Use it first"
            onConfirm={() => void makeFirst()}
            busy={busy}
            disabled={busy}
          />
        )}
      </View>
      <Text style={panelStyles.muted}>{EVERY_SERVER}</Text>
      {moved.length > 0 ? (
        <View accessibilityLiveRegion="polite">
          <Text style={panelStyles.detailTitle}>Priority numbers that changed</Text>
          {moved.map((line) => (
            <Text key={line} style={panelStyles.muted}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function UseToggle({ orgId, dc }: Readonly<{ orgId: string; dc: DatacenterRecord }>) {
  const update = useUpdateDatacenter(orgId, dc.id)
  const name = dc.name ?? 'Unnamed network'
  const verb = dc.trusted ? 'Stop using' : 'Start using'
  const toggle = () => {
    if (update.isPending) return
    void update.run({ options: { ...dc.options, trusted: !dc.trusted } })
  }
  return (
    <View style={styles.controls}>
      <ConfirmButton
        key={String(dc.trusted)}
        label={dc.trusted ? 'Stop using this network' : 'Use this network'}
        prompt={`${verb} ${name} for server traffic? ${EVERY_SERVER}`}
        confirmLabel={dc.trusted ? 'Stop using it' : 'Use it'}
        onConfirm={toggle}
        busy={update.isPending}
        disabled={update.isPending}
      />
      {update.actionError ? <Text style={panelStyles.muted}>{update.actionError}</Text> : null}
    </View>
  )
}

function NetworkControls({
  orgId,
  dc,
  first,
  names,
}: Readonly<{
  orgId: string
  dc: DatacenterRecord
  first: boolean
  names: ReadonlyMap<string, string>
}>) {
  return (
    <View style={styles.controls}>
      <UseToggle orgId={orgId} dc={dc} />
      {dc.trusted ? <PriorityEditor orgId={orgId} dc={dc} first={first} names={names} /> : null}
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
  names,
}: Readonly<{
  orgId: string
  dc: DatacenterRecord
  position: number | null
  tied: boolean
  carrying: number
  canManage: boolean
  names: ReadonlyMap<string, string>
}>) {
  const line = carryingLine(carrying)
  const badge = networkBadge(position, tied)
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={panelStyles.detailTitle}>{dc.name ?? 'Unnamed network'}</Text>
        {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
      </View>
      {line ? <Text style={panelStyles.muted}>{line}</Text> : null}
      {canManage ? (
        <NetworkControls orgId={orgId} dc={dc} first={position === 1 && !tied} names={names} />
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

function PeerRow({ peer, label }: Readonly<{ peer: ServerTrafficMapPeer; label: string }>) {
  return (
    <View style={styles.row}>
      <Text style={panelStyles.detailTitle}>{label}</Text>
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
  const names = new Map(datacenters.map((dc) => [dc.id, dc.name ?? 'Unnamed network']))
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
          names={names}
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
  // A server without a display name goes by its hostname, as everywhere else.
  const servers = useOrgServers(orgId).data?.servers
  const networks = datacenters.data?.datacenters ?? []
  const peers = map.data?.peers ?? []
  const nics = map.data?.nics ?? []

  if (datacenters.isError || map.isError) {
    return (
      <SectionPanel title="Server traffic">
        <InlineNotice
          tone="warning"
          title="Could not load the networks."
          body="Some of this page could not be read. Try again in a moment."
        />
      </SectionPanel>
    )
  }
  if (datacenters.isPending || map.isPending) {
    return (
      <SectionPanel title="Server traffic">
        <LoadingState label="Loading networks…" />
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
            <PeerRow
              key={peer.serverId}
              peer={peer}
              label={
                peer.name?.trim() || resolveServerLabel(peer.serverId, servers) || peer.serverId
              }
            />
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
