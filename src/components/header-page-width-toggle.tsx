import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { HeaderMenuTrigger } from '@/components/header-menu-trigger'
import { togglePageWidth, usePageWidth } from '@/lib/page-width'
import { colors, layout } from '@/lib/theme'

/**
 * Header control for the page-width preference. The icon is a page outline
 * with one column inside and shows what a click will do: a column filling the
 * page while contained (click to widen), a narrow left column while wide
 * (click to narrow). Compact screens have no max-width column,
 * so it is not drawn there.
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
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={4.5}
        width={18}
        height={15}
        rx={2.5}
        stroke={colors.textDim}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Rect
        x={6.5}
        y={8}
        width={wide ? 6 : 11}
        height={8}
        rx={1}
        stroke={colors.textDim}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
  },
})
