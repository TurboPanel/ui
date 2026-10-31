import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import type { FabricPairRow } from '@/lib/fabric-mesh'
import { spacing } from '@/lib/theme'

function FabricPairPathRow({ row }: Readonly<{ row: FabricPairRow }>) {
  const latency = row.latencyMs === undefined ? '' : `  ${String(row.latencyMs)} ms`
  return (
    <View style={panelStyles.detailCard}>
      <Text style={panelStyles.detailTitle}>{row.title}</Text>
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Path: </Text>
        {row.pathLabel}
        {latency}
      </Text>
      {row.reason ? (
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Why: </Text>
          {row.reason}
        </Text>
      ) : null}
      {row.viaLabel ? (
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Via: </Text>
          {row.viaLabel}
        </Text>
      ) : null}
      {row.readingAge ? (
        <Text style={panelStyles.muted}>Reading as of {row.readingAge}</Text>
      ) : null}
      {row.warning ? (
        <View style={panelStyles.calloutWarning}>
          <Text style={panelStyles.calloutWarningText}>{row.warning}</Text>
        </View>
      ) : null}
    </View>
  )
}

/**
 * How each server pair talks: the path ("LAN", "TurboFabric", "TurboFabric
 * over LAN", "No Path"), the panel's one-sentence reason and, for a tunnel,
 * its latency and warning. Shared by the org TurboFabric page and the server
 * Network tab.
 */
export function FabricPairPathList({ rows }: Readonly<{ rows: readonly FabricPairRow[] }>) {
  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <FabricPairPathRow key={row.key} row={row} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
})
