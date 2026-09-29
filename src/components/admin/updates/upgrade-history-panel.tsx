import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Badge, SectionPanel } from '@/components/ui'
import { UpgradeRunDetail } from '@/components/admin/updates/upgrade-run-detail'
import { panelStyles } from '@/components/ui/panel-styles'
import type { UpgradeHistoryEntry } from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

function resultTone(status: string): 'ok' | 'danger' | 'pending' | 'muted' {
  if (status === 'succeeded') return 'ok'
  if (status === 'failed') return 'danger'
  if (status === 'partially_failed') return 'pending'
  if (status === 'cancelled') return 'muted'
  return 'pending'
}

function RunRow({ run, last }: Readonly<{ run: UpgradeHistoryEntry; last: boolean }>) {
  const [open, setOpen] = useState(false)
  const started = run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open ? 'Hide' : 'Show'} what happened in the update started ${started}`}
        onPress={() => {
          setOpen((value) => !value)
        }}
        style={styles.summary}
      >
        <View style={styles.summaryText}>
          <Text style={{ color: colors.text }}>{started}</Text>
          <Text style={panelStyles.muted}>{run.startedByEmail ?? 'Automatic'}</Text>
        </View>
        <Badge tone={resultTone(run.status)} label={run.resultLabel ?? run.status} />
        <Text style={panelStyles.muted}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? <UpgradeRunDetail runId={run.id} /> : null}
    </View>
  )
}

export function UpgradeHistoryPanel({ runs }: Readonly<{ runs: readonly UpgradeHistoryEntry[] }>) {
  return (
    <SectionPanel title="Update history">
      {runs.length === 0 ? (
        <Text style={panelStyles.muted}>No upgrade runs recorded yet.</Text>
      ) : (
        <>
          <Text style={panelStyles.muted}>Open a run to see how each piece and server ended.</Text>
          {runs.map((run, index) => (
            <RunRow key={run.id} run={run} last={index === runs.length - 1} />
          ))}
        </>
      )}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.xs,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
})
