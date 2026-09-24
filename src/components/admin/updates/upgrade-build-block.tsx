import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Badge, Button } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdateTarget } from '@/lib/instance-api'
import {
  formatUpgradeBuildDisplayName,
  upgradeBuildDetailLines,
} from '@/lib/upgrade-display'
import { colors, spacing } from '@/lib/theme'

export function UpgradeBuildBlock({
  title,
  target,
  installedLabel,
}: Readonly<{
  title: string
  target: InstanceUpdateTarget | null
  installedLabel: string
}>) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const display = formatUpgradeBuildDisplayName(target)
  const detail = upgradeBuildDetailLines(target)

  return (
    <View style={styles.block}>
      <Text style={panelStyles.detailLabel}>{title}</Text>
      <Text style={styles.displayName}>{display}</Text>
      <View style={styles.row}>
        <Badge tone="muted" label={`Installed ${installedLabel}`} />
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
          {detail.version ? (
            <Text style={panelStyles.muted}>Version {detail.version}</Text>
          ) : null}
          {detail.commit ? (
            <Text style={panelStyles.muted}>Commit {detail.commit}</Text>
          ) : null}
          {detail.manifestUrl ? (
            <Text style={panelStyles.muted} numberOfLines={2}>
              Manifest {detail.manifestUrl}
            </Text>
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
  displayName: {
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
