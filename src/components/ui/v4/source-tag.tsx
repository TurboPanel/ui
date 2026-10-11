import { Text, View } from 'react-native'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { CHIP_HEIGHT, RADIUS } from '@/lib/v4/ui-scale'
import type { ConfigSource } from '@/lib/v4/types'

const styles = themedStyles((p) => ({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: CHIP_HEIGHT.md,
    paddingHorizontal: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: 'transparent',
  },
  change: { borderColor: p.baseLine, backgroundColor: p.baseSoft },
  own: { borderStyle: 'dashed' },
  text: { ...typeStyle('bodySemibold', 'caption'), color: p.text2 },
  textChange: { color: p.base },
  textOwn: { color: p.text3 },
}))

/**
 * Where a setting comes from, on a row: "Base", "Staging change" (blue, the
 * environment changes it) or "Set in Staging" (dashed, the environment stands
 * alone). Words come from `sourceLabel` in `src/lib/v4/change-labels.ts`.
 */
export function SourceTag({
  source,
  label,
}: Readonly<{ source: ConfigSource; label: string }>) {
  const p = usePalette()
  const s = styles(p)
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[s.tag, source === 'env' && s.change, source === 'own' && s.own]}
    >
      <Text
        numberOfLines={1}
        style={[s.text, source === 'env' && s.textChange, source === 'own' && s.textOwn]}
      >
        {label}
      </Text>
    </View>
  )
}
