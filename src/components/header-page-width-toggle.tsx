import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { HeaderMenuTrigger } from '@/components/header-menu-trigger'
import { togglePageWidth, usePageWidth } from '@/lib/page-width'
import { colors, layout } from '@/lib/theme'

/**
 * Header control for the page-width preference: `|→` widens a contained page,
 * `←|` narrows a wide one. Compact screens have no max-width column, so it
 * is not drawn there.
 */
export function HeaderPageWidthSegment() {
  const { width } = useWindowDimensions()
  const mode = usePageWidth()
  if (width < layout.desktopBreakpoint) return null

  const wide = mode === 'wide'
  const label = wide ? 'Narrow page' : 'Widen page'
  return (
    <View style={styles.wrap}>
      <HeaderMenuTrigger
        icon
        onPress={togglePageWidth}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: wide }}
        // Web hover tooltip; native ignores the unknown prop.
        {...({ title: label } as object)}
      >
        <WidthIcon wide={wide} />
      </HeaderMenuTrigger>
    </View>
  )
}

function WidthIcon({ wide }: Readonly<{ wide: boolean }>) {
  const bar = wide ? 'M20 5v14' : 'M4 5v14'
  const shaft = wide ? 'M15 12H4' : 'M9 12h11'
  const head = wide ? 'm8 8-4 4 4 4' : 'm16 8 4 4-4 4'
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      {[bar, shaft, head].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={colors.textDim}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
  },
})
