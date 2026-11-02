import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Checkbox, FormField, InlineNotice, SegmentedControl, Select } from '@/components/ui'
import type { DatacenterRecord, OrgServerRecord } from '@/lib/instance-api'
import { spacing } from '@/lib/theme'
import {
  carryCountNote,
  draftCarryCount,
  draftRunsOn,
  PLACEMENT_OPTIONS,
  serverChoices,
  serverLabel,
  serverNeverCarries,
  toggleDraftServer,
  withPlacementKind,
  type PlacementDraft,
} from '@/lib/tunnel-runs'

const KIND_OPTIONS = PLACEMENT_OPTIONS.map(({ value, label }) => ({ value, label }))

function ServerChoice({
  server,
  draft,
  disabled,
  onChange,
}: Readonly<{
  server: OrgServerRecord
  draft: PlacementDraft
  disabled: boolean
  onChange: (next: PlacementDraft) => void
}>) {
  const never = serverNeverCarries(server)
  const label = serverLabel(server)
  return (
    <View style={styles.choice}>
      <Checkbox
        checked={!never && draftRunsOn(draft, server.id)}
        disabled={disabled || never}
        onPress={() => onChange(toggleDraftServer(draft, server.id))}
        label={draft.placement === 'all' ? `Run on ${label}` : label}
        accessibilityLabel={`${draft.placement === 'all' ? 'Run on' : 'Use'} ${label}`}
      />
      {never ? (
        <Text style={panelStyles.muted}>Set to never run tunnels. Change that further down.</Text>
      ) : null}
    </View>
  )
}

/**
 * Where a tunnel runs: one server, chosen servers, or every server of a
 * datacenter (with some left out). Used when creating a tunnel and when
 * changing where an existing one runs. Only "All Servers" picks up servers
 * added later.
 */
export function NetworkTunnelPlacement({
  draft,
  onChange,
  servers,
  datacenters,
  disabled = false,
}: Readonly<{
  draft: PlacementDraft
  onChange: (next: PlacementDraft) => void
  servers: readonly OrgServerRecord[]
  datacenters: readonly DatacenterRecord[]
  disabled?: boolean
}>) {
  const explanation = PLACEMENT_OPTIONS.find((o) => o.value === draft.placement)?.explanation
  const choices = serverChoices(draft, servers)
  const note = carryCountNote(draftCarryCount(draft, servers))
  const datacenterOptions = datacenters.map((d) => ({ value: d.id, label: d.name ?? d.id }))

  return (
    <View style={styles.root}>
      <FormField label="Where It Runs">
        <SegmentedControl
          options={KIND_OPTIONS}
          value={draft.placement}
          onChange={(kind) => onChange(withPlacementKind(draft, kind))}
          disabled={disabled}
          accessibilityLabel="Where the tunnel runs"
        />
      </FormField>
      {explanation ? <Text style={panelStyles.muted}>{explanation}</Text> : null}
      {draft.placement === 'all' ? (
        <FormField label="Datacenter">
          <Select
            value={draft.datacenterId}
            options={datacenterOptions}
            placeholder="Choose a datacenter"
            disabled={disabled}
            accessibilityLabel="Datacenter whose servers run the tunnel"
            onChange={(datacenterId) => onChange({ ...draft, datacenterId, exceptServerIds: [] })}
          />
        </FormField>
      ) : null}
      {draft.placement === 'all' && !draft.datacenterId ? null : (
        <View style={styles.list}>
          <Text style={panelStyles.muted}>
            {draft.placement === 'all'
              ? 'Untick a server to leave it out. A server you add to this datacenter later runs the tunnel by itself.'
              : 'Pick the servers.'}
          </Text>
          {choices.length === 0 ? (
            <Text style={panelStyles.muted}>No servers to choose from here yet.</Text>
          ) : null}
          {choices.map((server) => (
            <ServerChoice
              key={server.id}
              server={server}
              draft={draft}
              disabled={disabled}
              onChange={onChange}
            />
          ))}
        </View>
      )}
      {note ? <InlineNotice tone="warning" title={note} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  list: { gap: spacing.sm },
  choice: { gap: spacing.xs },
})
