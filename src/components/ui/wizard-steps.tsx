import { StyleSheet, View } from 'react-native'
import { StepRail } from '@/components/ui/v4/step-rail'
import { stepStatesFromCurrent, type StepRailItem, type StepRailState } from '@/lib/step-rail'
import { colors, spacing } from '@/lib/theme'

/**
 * The numbered step indicator for a multi-step flow, drawn by the shared
 * `StepRail` (the same one a deploy's progress uses).
 *
 * Give `steps` with their ids and `current`: a step before the current one is
 * done, the current one waits on the person (`currentState` says otherwise,
 * e.g. `running` while the system works), the rest are still to come. A flow
 * that knows each step's state itself passes `states` instead.
 */
export type WizardStepItem<TId extends string = string> = {
  id: TId
  label: string
}

export function WizardSteps<TId extends string>({
  steps,
  current,
  currentState,
  states,
}: Readonly<{
  steps: readonly WizardStepItem<TId>[]
  /** `null` while nothing has started: no step reads as active or done. */
  current?: TId | null
  currentState?: StepRailState
  /** Each step's own state, by id; overrides `current`. */
  states?: Readonly<Partial<Record<TId, StepRailState>>>
}>) {
  const items: StepRailItem[] = states
    ? steps.map((step) => ({ id: step.id, label: step.label, state: states[step.id] ?? 'pending' }))
    : stepStatesFromCurrent(steps, current ?? null, currentState)
  return (
    <View style={styles.wrap}>
      <StepRail steps={items} numbered phoneLabels="current" />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
})
