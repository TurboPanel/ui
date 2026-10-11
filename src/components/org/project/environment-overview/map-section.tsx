import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { EnvironmentMap, type StationHref } from '@/components/org/project/environment-overview/environment-map'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { webPointer } from '@/lib/theme'
import { mapInputOf, type OverviewSource } from '@/lib/v4/environment-overview'
import { mapLayout, type MapLayout, type MapMode } from '@/lib/v4/map-layout'
import { RADIUS } from '@/lib/v4/ui-scale'

const MODES: readonly SwitchOption<MapMode>[] = [
  { value: 'env', label: 'This environment' },
  { value: 'base', label: 'Base' },
  { value: 'diff', label: 'Differences' },
]

const styles = themedStyles((p) => ({
  switch: {
    flexDirection: 'row',
    borderRadius: RADIUS.button,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface2,
    padding: 2,
  },
  option: { paddingHorizontal: 10, minHeight: 28, justifyContent: 'center', borderRadius: RADIUS.row },
  optionOn: { backgroundColor: p.surface3 },
  optionText: { ...typeStyle('bodyMedium', 'footnote'), color: p.text3 },
  optionTextOn: { color: p.text },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  key: { width: 22, height: 3, borderRadius: 2 },
  legendText: { ...typeStyle('body', 'caption'), color: p.text3 },
}))

export type SwitchOption<T extends string> = Readonly<{ value: T; label: string }>

/** A small row of radio options above a map: a view filter, not navigation. */
export function OptionSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string
  options: readonly SwitchOption<T>[]
  value: T
  onChange: (value: T) => void
}>) {
  const s = styles(usePalette())
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={s.switch}>
      {options.map((option) => {
        const on = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(option.value)}
            style={[s.option, on && s.optionOn, webPointer]}
          >
            <Text style={[s.optionText, on && s.optionTextOn]}>{option.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const LINE_KEY_COLOR = { https: 'railHttps', internal: 'railInternal', data: 'railData' } as const

/** One legend entry per kind of line the map actually draws. */
export function Legend({ layout }: Readonly<{ layout: MapLayout }>) {
  const p = usePalette()
  const s = styles(p)
  const drawn = new Set(layout.segments.map((segment) => segment.kind))
  const items = layout.legend.filter((item) => drawn.has(item.kind))
  if (items.length === 0) return null
  return (
    <View style={s.legend}>
      {items.map((item) => (
        <View key={item.kind} style={s.legendItem}>
          <View accessibilityElementsHidden style={[s.key, { backgroundColor: p[LINE_KEY_COLOR[item.kind]] }]} />
          <Text style={s.legendText}>{item.label}</Text>
        </View>
      ))}
    </View>
  )
}

/** The Map section: heading, the view filter, the map and its legend. */
export function MapSection({
  source,
  hrefFor,
}: Readonly<{ source: OverviewSource; hrefFor: StationHref }>) {
  const [mode, setMode] = useState<MapMode>('env')
  const layout = useMemo(() => mapLayout(mapInputOf(source, mode)), [source, mode])
  return (
    <View>
      <SectionHeading
        title="Map"
        action={<OptionSwitch label="Map view" options={MODES} value={mode} onChange={setMode} />}
      />
      <EnvironmentMap layout={layout} hrefFor={hrefFor} legend={<Legend layout={layout} />} />
    </View>
  )
}
