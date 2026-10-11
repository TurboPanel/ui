import { StyleSheet, Text, View } from 'react-native'
import { Badge, LoadingState } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { UpgradeStepRow } from '@/lib/instance-api'
import { useUpgradeRun } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'
import {
  fleetStatusBadge,
  upgradePhaseLabel,
  upgradeRunErrorLabel,
  upgradeStepOutcome,
} from '@/lib/upgrade-display'
import { plainStepFailureMessage } from '@/lib/user-error'

/** What a step ran on: its phase for the platform pieces, the server for a fleet step. */
function stepTitle(step: UpgradeStepRow): string {
  if (step.phase === 'fleet') {
    return step.serverName?.trim() || step.hostname?.trim() || step.serverId.slice(0, 8)
  }
  return upgradePhaseLabel(step.phase)
}

function moved(step: UpgradeStepRow): string | null {
  const from = step.fromVersion?.trim() || step.fromCommit?.slice(0, 7) || null
  const to = step.toVersion?.trim() || step.toCommit?.slice(0, 7) || null
  if (from && to) return `${from} → ${to}`
  return to ? `to ${to}` : null
}

function StepLine({ step }: Readonly<{ step: UpgradeStepRow }>) {
  const badge = fleetStatusBadge(step.status)
  const outcome = upgradeStepOutcome(step)
  const reason = plainStepFailureMessage(step.errorMessage) ?? outcome.detail
  const when = step.lastStageAt ? new Date(step.lastStageAt).toLocaleString() : null
  const change = moved(step)
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <Text style={styles.stepTitle}>{stepTitle(step)}</Text>
        <Badge {...badge} />
      </View>
      {change ? <Text style={panelStyles.muted}>{change}</Text> : null}
      {reason ? <Text style={panelStyles.error}>{reason}</Text> : null}
      {when ? <Text style={panelStyles.muted}>Last activity {when}</Text> : null}
    </View>
  )
}

/** Every piece one update run touched — control plane, UI, daemon, each server — and how each ended. */
export function UpgradeRunDetail({ runId }: Readonly<{ runId: string }>) {
  const query = useUpgradeRun(runId)
  if (query.isLoading) return <LoadingState />
  const run = query.data?.run
  if (query.isError || !run) {
    return <Text style={panelStyles.muted}>The details of this update are not available.</Text>
  }
  const runError = upgradeRunErrorLabel(run.error)
  const platform = run.steps.filter((step) => step.phase !== 'fleet')
  const fleet = run.steps.filter((step) => step.phase === 'fleet')
  return (
    <View style={styles.root}>
      {runError ? <Text style={panelStyles.error}>{runError}</Text> : null}
      {platform.map((step) => (
        <StepLine key={step.id} step={step} />
      ))}
      {fleet.length > 0 ? <Text style={panelStyles.detailLabel}>Server updates</Text> : null}
      {fleet.map((step) => (
        <StepLine key={step.id} step={step} />
      ))}
      {run.steps.length === 0 ? (
        <Text style={panelStyles.muted}>No steps were recorded for this update.</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  step: {
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderMuted,
  },
  stepHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  stepTitle: {
    color: colors.text,
    fontWeight: '600',
  },
})
