import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Badge, Button } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdateTarget } from '@/lib/instance-api'
import {
  formatUpgradeBuildDisplayName,
  pieceIdentityLines,
  stepInFlight,
  type PieceIdentity,
  type PieceStepView,
  updateAvailabilityBadge,
  upgradeBuildDetailLines,
} from '@/lib/upgrade-display'
import { colors, spacing } from '@/lib/theme'

function BuildDetails({
  lines,
  detail,
}: Readonly<{
  lines: ReturnType<typeof pieceIdentityLines>
  detail: ReturnType<typeof upgradeBuildDetailLines>
}>) {
  return (
    <View style={styles.details}>
      {lines.installedOnDisk ? (
        <Text style={panelStyles.muted}>Installed on disk: {lines.installedOnDisk}</Text>
      ) : null}
      <Text style={panelStyles.muted}>Running now: {lines.runningNow}</Text>
      {lines.updatingTo ? (
        <Text style={panelStyles.muted}>Updating to {lines.updatingTo}</Text>
      ) : null}
      <Text style={panelStyles.detailLabel}>Newest build on this channel</Text>
      {detail.version ? <Text style={panelStyles.muted}>Version {detail.version}</Text> : null}
      {detail.commit ? <Text style={panelStyles.muted}>Commit {detail.commit}</Text> : null}
      {detail.manifestUrl ? (
        <Text style={panelStyles.muted} numberOfLines={2}>
          Manifest {detail.manifestUrl}
        </Text>
      ) : null}
      {!detail.version && !detail.commit ? (
        <Text style={panelStyles.muted}>No package on this channel.</Text>
      ) : null}
    </View>
  )
}

/**
 * One updatable piece (control plane, UI, co-located daemon): what it runs now,
 * whether the channel has something newer, and — only then — what it would
 * move to. `updateAvailable` is `null` when that is not known (a daemon that is
 * not connected).
 */
export function UpgradeBuildBlock({
  title,
  target,
  installedLabel,
  updateAvailable,
  running,
  step,
}: Readonly<{
  title: string
  target: InstanceUpdateTarget | null
  installedLabel: string
  updateAvailable: boolean | null
  /** What the piece reports about itself (the live process); null when not reported. */
  running?: PieceIdentity | null
  /** This piece's step in the run being shown, when there is one. */
  step?: PieceStepView | null
}>) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detail = upgradeBuildDetailLines(target)
  const inFlight = stepInFlight(step?.status)
  const lines = pieceIdentityLines({ running, runningLabel: installedLabel, step })

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <Text style={panelStyles.detailLabel}>{title}</Text>
        <Badge {...updateAvailabilityBadge(updateAvailable, inFlight)} />
        {lines.restartPending ? <Badge tone="pending" label="Restart pending" /> : null}
      </View>
      <Text style={styles.installed}>{installedLabel}</Text>
      {updateAvailable && !inFlight ? (
        <Text style={panelStyles.muted}>Update to {formatUpgradeBuildDisplayName(target)}</Text>
      ) : null}
      <View style={styles.row}>
        <Button
          label={detailsOpen ? 'Hide details' : 'Details'}
          size="sm"
          variant="secondary"
          onPress={() => {
            setDetailsOpen((open) => !open)
          }}
        />
      </View>
      {detailsOpen ? <BuildDetails lines={lines} detail={detail} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.xs,
  },
  head: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  installed: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  details: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
})
