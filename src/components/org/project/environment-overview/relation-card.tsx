import { Link, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { webPointer } from '@/lib/theme'
import type { EnvironmentRelation } from '@/lib/v4/environment-overview'
import { RADIUS } from '@/lib/v4/ui-scale'

const styles = themedStyles((p) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: p.baseLine,
    backgroundColor: p.baseSoft,
  },
  alone: { borderStyle: 'dashed', borderColor: p.sepStrong, backgroundColor: 'transparent' },
  main: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typeStyle('display', 'headline'), color: p.text },
  text: { ...typeStyle('body', 'subhead'), color: p.text2 },
  chevron: { ...typeStyle('body', 'headline'), color: p.text3 },
}))

/**
 * "Changes from Base (2)" for an environment that follows the Base and changes
 * something, or "Staging stands alone". Shows nothing when there is nothing to
 * say, so it never reads "(0)".
 */
export function RelationCard({
  relation,
  changesHref,
  settingsHref,
}: Readonly<{ relation: EnvironmentRelation; changesHref: string; settingsHref: string }>) {
  const s = styles(usePalette())
  if (relation.kind === 'none') return null
  const href = relation.kind === 'changes' ? changesHref : settingsHref
  // The child of `Link asChild` takes one style object on web, never an array.
  const style = StyleSheet.flatten([s.card, relation.kind === 'alone' && s.alone, webPointer])
  return (
    <Link href={href as Href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${relation.title}. ${relation.text}`}
        style={style}
      >
        <View style={s.main}>
          <Text style={s.title}>{relation.title}</Text>
          <Text style={s.text}>{relation.text}</Text>
        </View>
        <Text style={s.chevron}>›</Text>
      </Pressable>
    </Link>
  )
}
