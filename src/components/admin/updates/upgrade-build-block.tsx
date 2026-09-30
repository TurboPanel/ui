import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Badge, Button } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdateTarget } from '@/lib/instance-api'
import {
  formatUpgradeBuildDisplayName,
  updateAvailabilityBadge,
  upgradeBuildDetailLines,
} from '@/lib/upgrade-display'
import { colors, spacing } from '@/lib/theme'

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
}: Readonly<{
  title: string
  target: InstanceUpdateTarget | null
  installedLabel: string
  updateAvailable: boolean | null
}>) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detail = upgradeBuildDetailLines(target)

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <Text style={panelStyles.detailLabel}>{title}</Text>
        <Badge {...updateAvailabilityBadge(updateAvailable)} />
      </View>
      <Text style={styles.installed}>{installedLabel}</Text>
      {updateAvailable ? (
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
      {detailsOpen ? (
        <View style={styles.details}>
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
      ) : null}
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
