import { StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { chrome, spacing } from '@/lib/theme'

export function WizardStepIndicator({
  labels,
  activeIndex,
}: Readonly<{
  labels: readonly string[]
  activeIndex: number
}>) {
  return (
    <View style={styles.row}>
      {labels.map((label, index) => {
        const done = index < activeIndex
        const active = index === activeIndex
        return (
          <View key={label} style={styles.item}>
            <View
              style={[
                orgPanelStyles.segmentChip,
                done && styles.chipDone,
                active && styles.chipActive,
              ]}
            >
              <Text
                style={[
                  orgPanelStyles.segmentChipText,
                  (done || active) && styles.chipTextActive,
                ]}
              >
                {index + 1}. {label}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  item: {
    flexGrow: 0,
  },
  chipDone: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  chipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  chipTextActive: {
    color: chrome.accent,
  },
})
