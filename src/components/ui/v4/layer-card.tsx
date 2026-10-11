import { type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { webPointer } from '@/lib/theme'
import { RADIUS } from '@/lib/v4/ui-scale'

const GHOST_OFFSET = 6

const styles = themedStyles((p) => ({
  base: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: RADIUS.layer,
    borderWidth: 1,
    borderColor: p.baseLine,
    backgroundColor: p.baseSoft,
  },
  baseTitle: { ...typeStyle('display', 'headline'), color: p.base },
  baseSub: { ...typeStyle('body', 'subhead'), color: p.text2, flexShrink: 1 },
  stack: { position: 'relative' },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: GHOST_OFFSET,
    bottom: GHOST_OFFSET,
    borderRadius: RADIUS.layer,
    borderWidth: 1,
    borderColor: p.baseLine,
    backgroundColor: p.baseSoft,
  },
  ghostAlone: { borderStyle: 'dashed', borderColor: p.sepStrong, backgroundColor: 'transparent' },
  card: {
    marginTop: GHOST_OFFSET,
    marginLeft: GHOST_OFFSET,
    gap: 12,
    padding: 20,
    borderRadius: RADIUS.layer,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface,
  },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  title: { ...typeStyle('display', 'headline'), color: p.text },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  pressed: { opacity: 0.9 },
}))

/**
 * The Base, as a band that sits above its environments: blue-tinted, with the
 * project's shared settings summarised. Press it to open the Base tab.
 */
export function LayerBase({
  title = 'Base',
  summary,
  onPress,
  trailing,
}: Readonly<{
  title?: string
  summary?: string
  onPress?: () => void
  trailing?: ReactNode
}>) {
  const s = styles(usePalette())
  const content = (
    <>
      <Text style={s.baseTitle}>{title}</Text>
      {summary ? <Text style={s.baseSub}>{summary}</Text> : null}
      {trailing}
    </>
  )
  if (!onPress) return <View style={s.base}>{content}</View>
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={summary ? `${title}, ${summary}` : title}
      style={({ pressed }) => [s.base, pressed && s.pressed, webPointer]}
    >
      {content}
    </Pressable>
  )
}

/**
 * An environment card drawn as a sheet laid over a faint Base sheet: "this
 * environment is the Base plus its changes". `alone` draws an empty dashed
 * sheet behind it instead, for an environment that stands alone and no longer
 * follows the Base.
 */
export function LayerCard({
  title,
  head,
  foot,
  alone = false,
  children,
}: Readonly<{
  title: string
  /** Chips beside the title (status, relation to the Base). */
  head?: ReactNode
  /** Actions along the bottom. */
  foot?: ReactNode
  alone?: boolean
  children?: ReactNode
}>) {
  const s = styles(usePalette())
  return (
    <View style={s.stack}>
      <View pointerEvents="none" style={[s.ghost, alone && s.ghostAlone]} />
      <View style={s.card}>
        <View style={s.head}>
          <Text accessibilityRole="header" style={s.title}>
            {title}
          </Text>
          {head}
        </View>
        {children}
        {foot ? <View style={s.foot}>{foot}</View> : null}
      </View>
    </View>
  )
}
