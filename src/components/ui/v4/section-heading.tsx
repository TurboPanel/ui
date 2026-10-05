import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'

const styles = themedStyles((p) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 12, marginBottom: 8 },
  title: { ...typeStyle('display', 'headline'), color: p.text, letterSpacing: -0.1 },
  danger: { color: p.bad },
  note: { ...typeStyle('body', 'footnote'), color: p.text3 },
  action: { marginLeft: 'auto' },
}))

/**
 * A section's heading: 17 px display type, 700. Every section on every page
 * uses this, with the same 8 px gap to its content. Grey 12 px labels are for
 * sub-groups inside a card (`ListGroup` title), not sections.
 */
export function SectionHeading({
  title,
  note,
  action,
  danger = false,
}: Readonly<{
  title: string
  /** A short grey line after the title. */
  note?: string
  /** A link or button pushed to the right. */
  action?: ReactNode
  danger?: boolean
}>) {
  const s = styles(usePalette())
  return (
    <View style={s.row}>
      <Text accessibilityRole="header" style={[s.title, danger && s.danger]}>
        {title}
      </Text>
      {note ? <Text style={s.note}>{note}</Text> : null}
      {action ? <View style={s.action}>{action}</View> : null}
    </View>
  )
}
