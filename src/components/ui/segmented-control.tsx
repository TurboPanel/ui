import { Pressable, StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { useTouch } from '@/components/ui/v4/use-palette'
import { webPointer } from '@/lib/theme'
import { CONTROL_HEIGHT } from '@/lib/v4/ui-scale'

export type SegmentedOption<T extends string> = Readonly<{
  value: T
  label: string
  /** Disable just this option (others stay selectable). */
  disabled?: boolean
  /** What a screen reader says for this option; defaults to `label`. */
  accessibilityLabel?: string
}>

/**
 * Standard segmented filter / view switcher using the shared
 * `panelStyles.segment*` shapes (never hand-roll chip rows). Each option is
 * 44 pt tall on a phone or a coarse pointer.
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
  const touch = useTouch()
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
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected: active, disabled: optionDisabled }}
            aria-selected={active}
            aria-disabled={optionDisabled}
            style={[
              panelStyles.segmentChip,
              touch && styles.touch,
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
  touch: {
    minHeight: CONTROL_HEIGHT.touch,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
})
