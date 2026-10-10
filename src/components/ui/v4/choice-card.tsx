import { type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { webPointer } from '@/lib/theme'
import { RADIUS } from '@/lib/v4/ui-scale'

const styles = themedStyles((p) => ({
  group: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface,
  },
  alone: { borderStyle: 'dashed' },
  on: { borderColor: p.accent, backgroundColor: p.accentSoft },
  pressed: { opacity: 0.9 },
  radio: {
    width: 18,
    height: 18,
    marginTop: 2,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: p.fieldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: p.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: p.accent },
  main: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typeStyle('bodySemibold', 'body'), color: p.text },
  body: { ...typeStyle('body', 'subhead'), color: p.text3 },
}))

/** A group of choice cards: one is selected, like radio buttons. */
export function ChoiceGroup({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  const s = styles(usePalette())
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={s.group}>
      {children}
    </View>
  )
}

/**
 * One choice as a card (for example "Start from the Base", "Copy of
 * Production", "Empty"). A radio mark, a title and a line of help. `alone`
 * draws it dashed, for the choice that stands apart from the Base.
 */
export function ChoiceCard({
  title,
  body,
  selected,
  onSelect,
  alone = false,
}: Readonly<{
  title: string
  body?: string
  selected: boolean
  onSelect: () => void
  alone?: boolean
}>) {
  const s = styles(usePalette())
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityLabel={body ? `${title}. ${body}` : title}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        s.card,
        alone && s.alone,
        selected && s.on,
        pressed && s.pressed,
        webPointer,
      ]}
    >
      <View style={[s.radio, selected && s.radioOn]}>
        {selected ? <View style={s.radioDot} /> : null}
      </View>
      <View style={s.main}>
        <Text style={s.title}>{title}</Text>
        {body ? <Text style={s.body}>{body}</Text> : null}
      </View>
    </Pressable>
  )
}
