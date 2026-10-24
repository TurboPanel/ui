import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { webFocusRing, type WebPressableState } from '@/components/ui/focus-ring'
import { themedStyles, usePalette, useTouch } from '@/components/ui/v4/use-palette'
import { webPointer } from '@/lib/theme'
import { controlHeight } from '@/lib/v4/ui-scale'

/** Track and knob sizes: compact with a mouse, the iOS size on touch. */
export const SWITCH_SIZE = {
  pointer: { width: 40, height: 24, knob: 18 },
  touch: { width: 51, height: 31, knob: 25 },
} as const

/** Gap between the knob and the track edge, inside the 1 px border (so knob = height - 6). */
const KNOB_INSET = 2

/**
 * The one on/off switch of the console: a track with a sliding knob, followed
 * by the state as a word ("On" / "Off", or the caller's words such as "Yes" /
 * "No"), so the state never rests on colour alone.
 *
 * Drawn here rather than with React Native's `Switch`, which renders as three
 * visually unrelated controls across web, iOS and Android. It reports
 * `role="switch"` and its checked state to each platform's accessibility layer
 * (`aria-checked` as well, because React Native Web ignores
 * `accessibilityState`). The whole row is the tap target: at least 44 pt tall
 * on a phone or a coarse pointer.
 *
 * Pair with {@link SettingRow} for the labelled "setting + control" layout.
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  busy = false,
  onLabel = 'On',
  offLabel = 'Off',
  accessibilityLabel,
}: Readonly<{
  value: boolean
  onValueChange: (next: boolean) => void
  disabled?: boolean
  /** Shows a spinner and blocks presses while a mutation is in flight. */
  busy?: boolean
  onLabel?: string
  offLabel?: string
  accessibilityLabel?: string
}>) {
  const p = usePalette()
  const s = styles(p)
  const touch = useTouch()
  const blocked = disabled || busy
  const size = touch ? SWITCH_SIZE.touch : SWITCH_SIZE.pointer
  const word = value ? onLabel : offLabel
  const knobTravel = size.width - size.knob - KNOB_INSET * 2 - 2
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={blocked}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: blocked, busy }}
      accessibilityValue={{ text: word }}
      aria-checked={value}
      aria-disabled={blocked}
      aria-busy={busy}
      style={(state: WebPressableState) => [
        s.base,
        { minHeight: controlHeight('md', touch) },
        webPointer,
        state.pressed && !blocked && s.pressed,
        blocked && s.disabled,
        state.focused && webFocusRing,
      ]}
    >
      <View
        style={[
          s.track,
          { width: size.width, height: size.height, borderRadius: size.height / 2 },
          value ? s.trackOn : s.trackOff,
        ]}
      >
        <View
          style={[
            {
              width: size.knob,
              height: size.knob,
              borderRadius: size.knob / 2,
              transform: [{ translateX: value ? knobTravel : 0 }],
            },
            value ? s.knobOn : s.knobOff,
          ]}
        />
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={p.text3} />
      ) : (
        <Text style={[s.text, value && s.textOn]} numberOfLines={1}>
          {word}
        </Text>
      )}
    </Pressable>
  )
}

const styles = themedStyles((p) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 8,
  },
  track: {
    borderWidth: 1,
    padding: KNOB_INSET,
    justifyContent: 'center',
  },
  trackOn: { backgroundColor: p.accent, borderColor: p.accent },
  trackOff: { backgroundColor: p.surface3, borderColor: p.sepStrong },
  knobOn: { backgroundColor: p.accentInk },
  knobOff: { backgroundColor: p.text3 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.5 },
  text: {
    minWidth: 24,
    color: p.text3,
    fontSize: 13,
    fontWeight: '600',
  },
  textOn: { color: p.text },
}))
