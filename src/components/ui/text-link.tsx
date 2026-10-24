import { Pressable, StyleSheet, Text } from 'react-native'
import { isFocused, webFocusRing } from '@/components/ui/focus-ring'
import { useTouch } from '@/components/ui/v4/use-palette'
import { colors, webPointer } from '@/lib/theme'
import { CONTROL_HEIGHT } from '@/lib/v4/ui-scale'

export type TextLinkSize = 'md' | 'sm'

/**
 * A text link ("Open the Base", "Change", "All deployments"): link-blue words
 * with no fill. With a mouse it is as tall as its text, so it sits in a line of
 * copy; on a phone or a coarse pointer its tap area grows to 44 x 44 pt (the
 * words stay the same size, centred in it). Keyboard focus draws the accent ring.
 *
 * Reports itself as a link to screen readers. Use {@link Button} for an action
 * that changes something; a link goes somewhere. Passing `expanded` makes it a
 * disclosure ("Show what will run"): a button that reports open or closed.
 */
export function TextLink({
  label,
  onPress,
  size = 'md',
  disabled = false,
  numberOfLines = 1,
  expanded,
  accessibilityLabel,
}: Readonly<{
  label: string
  onPress: () => void
  size?: TextLinkSize
  disabled?: boolean
  /** Lines before the words are cut with an ellipsis (default one). */
  numberOfLines?: number
  /** Set for a show / hide disclosure: whether the section it controls is open. */
  expanded?: boolean
  /** A fuller name for screen readers, e.g. "Open example.com in a new tab". */
  accessibilityLabel?: string
}>) {
  const touch = useTouch()
  const disclosure = expanded !== undefined
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={disclosure ? 'button' : 'link'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, expanded }}
      aria-disabled={disabled}
      aria-expanded={expanded}
      style={(state) => [
        styles.base,
        touch && styles.touch,
        webPointer,
        state.pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        isFocused(state) && webFocusRing,
      ]}
    >
      <Text style={[styles.text, size === 'sm' && styles.textSm]} numberOfLines={numberOfLines}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    borderRadius: 4,
  },
  touch: {
    minHeight: CONTROL_HEIGHT.touch,
    minWidth: CONTROL_HEIGHT.touch,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    color: colors.link,
    fontSize: 14,
    fontWeight: '600',
  },
  textSm: {
    fontSize: 13,
  },
})
