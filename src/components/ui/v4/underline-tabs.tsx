import { Pressable, Text, View } from 'react-native'
import { themedStyles, usePalette, useTouch } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { webPointer } from '@/lib/theme'

export type UnderlineTab = Readonly<{
  key: string
  label: string
  /** A small amber dot: something on this tab is saved but not deployed. */
  dot?: boolean
  /** What the dot means, read aloud after the label ("not deployed changes"). */
  dotLabel?: string
}>

const styles = themedStyles((p) => ({
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderBottomWidth: 1, borderBottomColor: p.sep },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  touch: { minHeight: 44 },
  on: { borderBottomColor: p.accent },
  text: { ...typeStyle('bodyMedium', 'subhead'), color: p.text3 },
  textOn: { ...typeStyle('bodySemibold', 'subhead'), color: p.text },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: p.warn },
}))

/**
 * Section navigation: underline tabs, one selected. The same component serves
 * the project tabs (Overview, Base, Settings), the environment tabs and the
 * organization tabs. A segmented control is for filters, never for this.
 */
export function UnderlineTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
}: Readonly<{
  tabs: readonly UnderlineTab[]
  value: string
  onChange: (key: string) => void
  ariaLabel: string
}>) {
  const p = usePalette()
  const s = styles(p)
  const touch = useTouch()
  return (
    <View accessibilityRole="tablist" accessibilityLabel={ariaLabel} style={s.bar}>
      {tabs.map((tab) => {
        const selected = tab.key === value
        const name =
          tab.dot && tab.dotLabel ? `${tab.label}, ${tab.dotLabel}` : tab.label
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={name}
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.key)}
            style={[s.tab, touch && s.touch, selected && s.on, webPointer]}
          >
            <Text style={selected ? s.textOn : s.text}>{tab.label}</Text>
            {tab.dot ? <View style={s.dot} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}
