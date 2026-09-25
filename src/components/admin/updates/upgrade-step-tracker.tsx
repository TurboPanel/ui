import { Text, View } from 'react-native'
import { WizardSteps, type WizardStepItem } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  mapStepStatusToPipeline,
  upgradePhaseLabel,
  upgradeStepOutcome,
} from '@/lib/upgrade-display'
import type { UpgradePhase, UpgradeStepStatus } from '@/lib/instance-api'
import { UPGRADE_STEP_PIPELINE } from '@/lib/upgrade-vocabulary'
import { spacing } from '@/lib/theme'

const PIPELINE_STEPS: readonly WizardStepItem<(typeof UPGRADE_STEP_PIPELINE)[number]>[] =
  UPGRADE_STEP_PIPELINE.map((id) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
  }))

export function UpgradeStepTracker({
  phase,
  status,
  errorCode,
  title,
}: Readonly<{
  phase: UpgradePhase | null
  status: UpgradeStepStatus | null
  errorCode?: string | null
  title?: string
}>) {
  const current = mapStepStatusToPipeline(status)
  const heading = title ?? upgradePhaseLabel(phase)
  const outcome = upgradeStepOutcome({ status, errorCode })
  const ended = outcome.tone === 'danger' || outcome.tone === 'pending'

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={panelStyles.detailLabel}>{heading}</Text>
      <WizardSteps steps={PIPELINE_STEPS} current={current} />
      {ended ? (
        <Text style={outcome.tone === 'danger' ? panelStyles.error : panelStyles.muted}>
          {outcome.detail ? `${outcome.label}: ${outcome.detail}` : outcome.label}
        </Text>
      ) : null}
    </View>
  )
}
