import { Pressable, StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { webPointer } from '@/lib/theme'

export type SegmentedOption<T extends string> = Readonly<{
  value: T
  label: string
  /** Disable just this option (others stay selectable). */
  disabled?: boolean
}>

/**
 * Standard segmented filter / view switcher using the shared
 * `panelStyles.segment*` shapes (never hand-roll chip rows).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
}: Readonly<{
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Blocks selection changes (e.g. while a save is in flight). */
  disabled?: boolean
  accessibilityLabel?: string
}>) {
  return (
    <View
      style={panelStyles.segmentGroup}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const active = option.value === value
        const optionDisabled = disabled || option.disabled === true
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={optionDisabled}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: optionDisabled }}
            style={[
              panelStyles.segmentChip,
              webPointer,
              active && panelStyles.segmentChipActive,
              optionDisabled && styles.disabled,
            ]}
          >
            <Text
              style={[
                panelStyles.segmentChipText,
                active && panelStyles.segmentChipTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
})
