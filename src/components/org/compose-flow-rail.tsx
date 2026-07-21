import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/lib/theme'

export type ComposeFlowStep = 'base' | 'production' | 'deploy'

const STEPS: { id: ComposeFlowStep; label: string; marker: string }[] = [
  { id: 'base', label: 'Project base', marker: '1' },
  { id: 'production', label: 'Production', marker: '2' },
  { id: 'deploy', label: 'Deploy', marker: '3' },
]

export function ComposeFlowRail({
  activeStep = 'base',
}: Readonly<{ activeStep?: ComposeFlowStep }>) {
  return (
    <View style={styles.rail}>
      {STEPS.map((step, index) => {
        const active = step.id === activeStep
        const done =
          STEPS.findIndex((entry) => entry.id === activeStep) > index
        return (
          <View key={step.id} style={styles.segment}>
            <View style={styles.nodeRow}>
              <View
                style={[
                  styles.node,
                  done && styles.nodeDone,
                  active && styles.nodeActive,
                ]}
              >
                <Text
                  style={[
                    styles.nodeMarker,
                    (done || active) && styles.nodeMarkerActive,
                  ]}
                >
                  {done ? '✓' : step.marker}
                </Text>
              </View>
              {index < STEPS.length - 1 ? (
                <View
                  style={[styles.connector, done && styles.connectorDone]}
                />
              ) : null}
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>
              {step.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    width: '100%',
  },
  segment: {
    flex: 1,
    minWidth: 96,
    gap: spacing.xs,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  node: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDone: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  nodeActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
    transform: [{ scale: 1.05 }],
  },
  nodeMarker: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  nodeMarkerActive: {
    color: colors.accent,
  },
  connector: {
    flex: 1,
    height: 2,
    marginHorizontal: spacing.xs,
    backgroundColor: colors.borderChip,
    minWidth: 12,
  },
  connectorDone: {
    backgroundColor: colors.accent,
  },
  label: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  labelActive: {
    color: colors.textBody,
  },
})
