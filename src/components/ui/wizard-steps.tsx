import { StyleSheet, Text, View } from 'react-native'
import { chrome, colors, spacing } from '@/lib/theme'

/**
 * Numbered progress dots for a multi-step flow.
 *
 * Lifted out of `add-server-wizard.tsx`, where it had lived privately since the
 * server wizard shipped, once a second wizard (registering a GitHub App) needed
 * the same thing. `ui/AGENTS.md` had already listed it as a shipped item that
 * was never promoted to the kit.
 *
 * Steps are given as data rather than children so the indicator can render
 * done / active / upcoming state itself: a step before the active one is
 * finished, which is what the filled dot and the connector both mean.
 */
export type WizardStepItem<TId extends string = string> = {
  id: TId
  label: string
}

export function WizardSteps<TId extends string>({
  steps,
  current,
}: Readonly<{
  steps: readonly WizardStepItem<TId>[]
  current: TId
}>) {
  const activeIndex = steps.findIndex((entry) => entry.id === current)

  return (
    <View style={styles.row} accessibilityRole="list">
      {steps.map((entry, index) => {
        const done = index < activeIndex
        const active = entry.id === current
        return (
          <View key={entry.id} style={styles.item}>
            <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
              <Text
                style={[
                  styles.dotText,
                  done && styles.dotTextDone,
                  active && styles.dotTextActive,
                ]}
              >
                {index + 1}
              </Text>
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{entry.label}</Text>
            {index < steps.length - 1 ? (
              <View style={[styles.connector, index < activeIndex && styles.connectorDone]} />
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 0,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  dotDone: {
    borderColor: chrome.accent,
    backgroundColor: chrome.accent,
  },
  dotText: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  dotTextActive: {
    color: chrome.accent,
  },
  dotTextDone: {
    color: colors.buttonText,
  },
  label: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  labelActive: {
    color: colors.text,
  },
  connector: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderArea,
    marginHorizontal: 2,
  },
  connectorDone: {
    backgroundColor: chrome.accent,
  },
})
