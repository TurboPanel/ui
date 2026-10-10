import { Children, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { RADIUS } from '@/lib/v4/ui-scale'

const styles = themedStyles((p) => ({
  group: {
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.sep,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  strong: { borderColor: p.sepStrong },
  title: { ...typeStyle('bodySemibold', 'footnote'), color: p.text3, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  divided: { borderTopWidth: 1, borderTopColor: p.sep },
  foot: { ...typeStyle('body', 'footnote'), color: p.text3, marginTop: 8, lineHeight: 18 },
}))

/**
 * A list of rows in one bordered card, a hairline between rows. Pass `empty`
 * to show a message in place of the rows when there are none. The optional
 * `title` is the small grey sub-group label inside the card; a section's own
 * heading is `SectionHeading`.
 */
export function ListGroup({
  title,
  foot,
  empty,
  strong = false,
  children,
}: Readonly<{
  title?: string
  /** Grey help text under the card. */
  foot?: string
  /** Shown when there are no rows. */
  empty?: ReactNode
  strong?: boolean
  children?: ReactNode
}>) {
  const s = styles(usePalette())
  const rows = Children.toArray(children)
  return (
    <View>
      <View style={[s.group, strong && s.strong]}>
        {title ? (
          <Text accessibilityRole="header" style={s.title}>
            {title}
          </Text>
        ) : null}
        {rows.length === 0
          ? empty
          : rows.map((row, index) => (
              <View key={rowKey(row, index)} style={index > 0 && s.divided}>
                {row}
              </View>
            ))}
      </View>
      {foot ? <Text style={s.foot}>{foot}</Text> : null}
    </View>
  )
}

function rowKey(row: ReturnType<typeof Children.toArray>[number], index: number): string {
  if (typeof row === 'object' && row !== null && 'key' in row && row.key !== null) {
    return String(row.key)
  }
  return `row-${index}`
}
