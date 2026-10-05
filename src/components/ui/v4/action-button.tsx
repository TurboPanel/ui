import { type ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text } from 'react-native'
import { themedStyles, usePalette, useTouch } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { webPointer } from '@/lib/theme'
import { controlHeight, RADIUS } from '@/lib/v4/ui-scale'

/**
 * The button hierarchy. One primary per view (the header Deploy or the pending
 * bar); everything else steps down.
 *
 * - `primary`: the one main action, brand blue
 * - `secondary`: a normal action, quiet fill and border
 * - `quiet`: no fill, link blue (Cancel, Discard, Back)
 * - `danger`: red outline, for an action that removes something
 * - `dangerSolid`: red fill, only for the final confirm in a sheet
 */
export type ActionVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'dangerSolid'
export type ActionSize = 'sm' | 'md' | 'lg'

const styles = themedStyles((p) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 12,
  },
  sm: { paddingHorizontal: 8, borderRadius: RADIUS.row },
  lg: { paddingHorizontal: 20 },
  fill: { alignSelf: 'stretch' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  primary: { backgroundColor: p.accent },
  secondary: { backgroundColor: p.surface2, borderColor: p.sepStrong },
  quiet: { backgroundColor: 'transparent' },
  danger: { backgroundColor: 'transparent', borderColor: p.bad },
  dangerSolid: { backgroundColor: p.bad },
  textPrimary: { color: p.accentInk },
  textSecondary: { color: p.text },
  textQuiet: { color: p.link },
  textDanger: { color: p.bad },
  textDangerSolid: { color: p.knob },
}))

const TEXT_STYLE = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  quiet: 'textQuiet',
  danger: 'textDanger',
  dangerSolid: 'textDangerSolid',
} as const

export function ActionButton({
  label,
  onPress,
  variant = 'secondary',
  size = 'md',
  busy = false,
  busyLabel,
  disabled = false,
  icon,
  fill = false,
  accessibilityLabel,
}: Readonly<{
  label: string
  onPress: () => void
  variant?: ActionVariant
  size?: ActionSize
  /** Blocks the press and shows a spinner beside the label. */
  busy?: boolean
  /** Label while `busy` ("Saving…"); defaults to `label`. */
  busyLabel?: string
  disabled?: boolean
  /** A leading SVG icon (never an emoji). */
  icon?: ReactNode
  /** Stretch to the full width of the parent. */
  fill?: boolean
  accessibilityLabel?: string
}>) {
  const p = usePalette()
  const s = styles(p)
  const touch = useTouch()
  const blocked = disabled || busy
  const textStyle = s[TEXT_STYLE[variant]]
  const spinner = variant === 'primary' ? p.accentInk : p.text3
  const fontSize = size === 'sm' ? 'footnote' : 'subhead'
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy }}
      style={({ pressed }) => [
        s.base,
        s[variant],
        size === 'sm' && s.sm,
        size === 'lg' && s.lg,
        { minHeight: controlHeight(size, touch) },
        fill && s.fill,
        pressed && !blocked && s.pressed,
        blocked && s.disabled,
        webPointer,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={spinner} /> : icon}
      <Text
        numberOfLines={1}
        style={[typeStyle('bodySemibold', size === 'lg' ? 'headline' : fontSize), textStyle]}
      >
        {busy && busyLabel ? busyLabel : label}
      </Text>
    </Pressable>
  )
}
