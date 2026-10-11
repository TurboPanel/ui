import { type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { webPointer } from '@/lib/theme'
import { ROW_HEIGHT } from '@/lib/v4/ui-scale'

const styles = themedStyles((p) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: ROW_HEIGHT.regular,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  tall: { minHeight: ROW_HEIGHT.tall },
  pressed: { backgroundColor: p.press },
  main: { flex: 1, minWidth: 0, gap: 2 },
  titleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  title: { ...typeStyle('bodyMedium', 'body'), color: p.text },
  titleDanger: { color: p.bad },
  sub: { ...typeStyle('body', 'footnote'), color: p.text3 },
  value: { ...typeStyle('body', 'subhead'), color: p.text2, textAlign: 'right' },
  valueUnset: { color: p.text3 },
  valueBox: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 8, maxWidth: '50%' },
  chevron: { ...typeStyle('body', 'headline'), color: p.text3 },
}))

/**
 * A 48 px settings or list row: a title with optional chips after it, a grey
 * sub line, and a value on the right. Give it `onPress` to make the whole row
 * a button with a trailing chevron. `staged` adds the "Not deployed" chip for
 * a change that is saved but not live.
 */
export function ListRow({
  title,
  sub,
  value,
  unset = false,
  chips,
  leading,
  trailing,
  onPress,
  tall = false,
  danger = false,
  staged = false,
  accessibilityLabel,
}: Readonly<{
  title: string
  sub?: string
  /** Text on the right. */
  value?: string
  /** The value is empty ("Not set"): draw it grey. */
  unset?: boolean
  /** Chips after the title (source tag, status chip). */
  chips?: ReactNode
  leading?: ReactNode
  /** Anything after the value (a switch, a small button). */
  trailing?: ReactNode
  onPress?: () => void
  tall?: boolean
  danger?: boolean
  staged?: boolean
  accessibilityLabel?: string
}>) {
  const s = styles(usePalette())
  const body = (
    <>
      {leading}
      <View style={s.main}>
        <View style={s.titleLine}>
          <Text style={[s.title, danger && s.titleDanger]}>{title}</Text>
          {chips}
          {staged ? <StatusChip status="changes" size="sm" /> : null}
        </View>
        {sub ? <Text style={s.sub}>{sub}</Text> : null}
      </View>
      {value !== undefined || trailing ? (
        <View style={s.valueBox}>
          {value === undefined ? null : (
            <Text style={[s.value, unset && s.valueUnset]}>{value}</Text>
          )}
          {trailing}
        </View>
      ) : null}
      {onPress ? <Text style={s.chevron}>›</Text> : null}
    </>
  )
  if (!onPress) {
    return (
      <View style={[s.row, tall && s.tall]} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    )
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [s.row, tall && s.tall, pressed && s.pressed, webPointer]}
    >
      {body}
    </Pressable>
  )
}
