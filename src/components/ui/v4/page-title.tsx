import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'

const styles = themedStyles((p) => ({
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 },
  main: { flexShrink: 1, flexGrow: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
  title: { ...typeStyle('displayItalic', 'large'), color: p.text, letterSpacing: -0.5, lineHeight: 32 },
  mono: { ...typeStyle('monoSemibold', 'mono'), color: p.text2 },
  sub: { ...typeStyle('body', 'subhead'), color: p.text3, marginTop: 6 },
  actions: { marginLeft: 'auto', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
}))

/**
 * The page title: 28 px, 800 italic, echoing the logo. Italic is for page
 * titles and the live address only. `mono` adds a small upright code suffix
 * (a project or branch name); `actions` sit on the right.
 */
export function PageTitle({
  title,
  mono,
  sub,
  actions,
}: Readonly<{ title: string; mono?: string; sub?: string; actions?: ReactNode }>) {
  const s = styles(usePalette())
  return (
    <View style={s.head}>
      <View style={s.main}>
        <View style={s.titleLine}>
          <Text accessibilityRole="header" style={s.title}>
            {title}
          </Text>
          {mono ? <Text style={s.mono}>{mono}</Text> : null}
        </View>
        {sub ? <Text style={s.sub}>{sub}</Text> : null}
      </View>
      {actions ? <View style={s.actions}>{actions}</View> : null}
    </View>
  )
}
