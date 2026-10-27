import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { Badge, SectionPanel, TextLink } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { UpgradeHistoryEntry } from '@/lib/instance-api'
import { colors, spacing, webPointer } from '@/lib/theme'
import {
  UPDATE_HISTORY_HREF,
  updateRunHref,
  upgradeRunResultLabel,
  upgradeRunStatusBadge,
  upgradeStartedByLabel,
} from '@/lib/upgrade-history-display'

/** How many recent runs the Updates page lists before "See all". */
export const RECENT_UPDATE_RUNS = 5

function RecentRunRow({
  run,
  last,
  onOpen,
}: Readonly<{ run: UpgradeHistoryEntry; last: boolean; onOpen: () => void }>) {
  const started = formatLocalDateTime(run.startedAt ?? run.createdAt ?? null, {
    includeSeconds: false,
  })
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open the update started ${started}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivider,
        webPointer,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.summaryText}>
        <Text style={styles.started}>{started}</Text>
        <Text style={panelStyles.muted} numberOfLines={1}>
          {upgradeStartedByLabel(run)} · {upgradeRunResultLabel(run)}
        </Text>
      </View>
      <Badge {...upgradeRunStatusBadge(run.status)} />
    </Pressable>
  )
}

/** The last few update runs on the Updates page; each opens its Update Run screen. */
export function UpgradeHistoryPanel({ runs }: Readonly<{ runs: readonly UpgradeHistoryEntry[] }>) {
  const router = useRouter()
  const recent = runs.slice(0, RECENT_UPDATE_RUNS)
  return (
    <SectionPanel
      title="Recent Updates"
      headerRight={
        <TextLink
          label="See all"
          size="sm"
          accessibilityLabel="Open Update History"
          onPress={() => router.push(UPDATE_HISTORY_HREF as Href)}
        />
      }
    >
      {recent.length === 0 ? (
        <Text style={panelStyles.muted}>No updates recorded yet.</Text>
      ) : (
        recent.map((run, index) => (
          <RecentRunRow
            key={run.id}
            run={run}
            last={index === recent.length - 1}
            onOpen={() => router.push(updateRunHref(run.id) as Href)}
          />
        ))
      )}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  pressed: {
    opacity: 0.88,
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  started: {
    color: colors.text,
  },
})
