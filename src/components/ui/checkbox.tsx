import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { webPointer } from '@/components/org/org-panel-styles'
import { chrome, colors, spacing } from '@/lib/theme'

function CheckGlyph({ indeterminate }: Readonly<{ indeterminate: boolean }>) {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
      <Path
        d={indeterminate ? 'M2.5 6h7' : 'M2.25 6.25 4.75 8.75 9.75 3.25'}
        stroke={chrome.accent}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/**
 * Standard checkbox (SVG mark, never the `✓` glyph). Supports
 * indeterminate; add `label` for an inline labelled row. `busy`
 * swaps the mark for a spinner and blocks presses while pending.
 * A press never bubbles to an enclosing pressable row — toggling
 * must not also activate the row.
 */
export function Checkbox({
  checked,
  onPress,
  indeterminate = false,
  disabled = false,
  busy = false,
  label,
  accessibilityLabel,
}: Readonly<{
  checked: boolean
  onPress: () => void
  indeterminate?: boolean
  disabled?: boolean
  busy?: boolean
  label?: string
  accessibilityLabel?: string
}>) {
  const marked = checked || indeterminate
  const inert = disabled || busy
  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation()
        onPress()
      }}
      disabled={inert}
      accessibilityRole="checkbox"
      accessibilityState={{
        checked: indeterminate ? 'mixed' : checked,
        disabled: inert,
        busy,
      }}
      accessibilityLabel={accessibilityLabel ?? label ?? 'Toggle'}
      hitSlop={8}
      style={[styles.row, webPointer, disabled && styles.disabled]}
    >
      <View style={[styles.box, marked && styles.boxMarked]}>
        {busy ? (
          <ActivityIndicator
            size="small"
            color={colors.textMuted}
            style={styles.spinner}
          />
        ) : null}
        {!busy && marked ? <CheckGlyph indeterminate={indeterminate} /> : null}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxMarked: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
  },
  disabled: {
    opacity: 0.5,
  },
  spinner: {
    transform: [{ scale: 0.6 }],
  },
})
