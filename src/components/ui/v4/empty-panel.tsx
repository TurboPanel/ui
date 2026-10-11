import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { RADIUS } from '@/lib/v4/ui-scale'

const styles = themedStyles((p) => ({
  panel: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 40,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: p.sep,
    backgroundColor: p.surface,
  },
  inline: { borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent', paddingVertical: 24 },
  hero: { paddingVertical: 64, paddingHorizontal: 24 },
  glyph: { opacity: 0.55, marginBottom: 4 },
  text: { alignItems: 'center', gap: 8, maxWidth: 460 },
  title: { ...typeStyle('display', 'headline'), color: p.text, textAlign: 'center' },
  titleHero: { ...typeStyle('display', 'large') },
  body: { ...typeStyle('body', 'subhead'), color: p.text3, textAlign: 'center' },
}))

/**
 * "Nothing here yet": a quiet 36 px mark, a title, one line of why, and at most
 * one action. `inline` drops the card (use it inside a `ListGroup`, no mark);
 * `hero` is for a page with nothing at all (an empty organization).
 */
export function EmptyPanel({
  title,
  body,
  action,
  inline = false,
  hero = false,
}: Readonly<{
  title: string
  body?: string
  action?: ReactNode
  inline?: boolean
  hero?: boolean
}>) {
  const p = usePalette()
  const s = styles(p)
  return (
    <View style={[s.panel, inline && s.inline, hero && s.hero]}>
      {inline ? null : (
        <View style={s.glyph} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
            <Path
              d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"
              stroke={p.text3}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="m3 7.5 9 4.5 9-4.5M12 12v9"
              stroke={p.text3}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      )}
      <View style={s.text}>
        <Text accessibilityRole="header" style={[s.title, hero && s.titleHero]}>
          {title}
        </Text>
        {body ? <Text style={s.body}>{body}</Text> : null}
        {action}
      </View>
    </View>
  )
}
