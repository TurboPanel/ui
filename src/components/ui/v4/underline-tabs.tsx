import { LinearGradient } from 'expo-linear-gradient'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native'
import { themedStyles, usePalette, useTouch } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { layout, webPointer } from '@/lib/theme'
import { useColors } from '@/lib/theme-preference'
import { tabEdgeFades, tabFadeMask, tabScrollTarget, type TabSpan } from '@/lib/v4/tab-scroll'

export type UnderlineTab = Readonly<{
  key: string
  label: string
  /** A small amber dot: something on this tab is saved but not deployed. */
  dot?: boolean
  /** What the dot means, read aloud after the label ("not deployed changes"). */
  dotLabel?: string
}>

/** How wide the fade is on an edge that has more tabs past it. */
const FADE_WIDTH = 32

const styles = themedStyles((p) => ({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: p.sep,
  },
  scrollWrap: { position: 'relative' },
  scrollRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 2,
    minWidth: '100%',
    borderBottomWidth: 1,
    borderBottomColor: p.sep,
  },
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
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE_WIDTH },
  fadeStart: { left: 0 },
  fadeEnd: { right: 0 },
}))

type Fades = Readonly<{ start: boolean; end: boolean }>

const NO_FADES: Fades = { start: false, end: false }

/** Native edge fades: the page colour over the tabs (web uses a CSS mask instead). */
function NativeEdgeFades({ fades }: Readonly<{ fades: Fades }>) {
  const s = styles(usePalette())
  const bg = useColors().bg
  // Native palettes are plain hex, so a transparent stop of the same colour is safe here.
  const clear = `${bg}00`
  return (
    <>
      {fades.start ? (
        <LinearGradient
          colors={[bg, clear]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[s.fade, s.fadeStart]}
          pointerEvents="none"
        />
      ) : null}
      {fades.end ? (
        <LinearGradient
          colors={[clear, bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[s.fade, s.fadeEnd]}
          pointerEvents="none"
        />
      ) : null}
    </>
  )
}

/**
 * The phone bar: one row that scrolls sideways (it never wraps), with a fade on
 * each edge that has more tabs past it, and the selected tab scrolled into view
 * when the page opens and whenever it changes.
 */
function ScrollingTabBar({
  value,
  ariaLabel,
  children,
  spans,
}: Readonly<{
  value: string
  ariaLabel: string
  children: ReactNode
  spans: Readonly<Record<string, TabSpan>>
}>) {
  const s = styles(usePalette())
  const scrollRef = useRef<ScrollView>(null)
  const scrollX = useRef(0)
  const [viewport, setViewport] = useState(0)
  const [content, setContent] = useState(0)
  const [fades, setFades] = useState<Fades>(NO_FADES)

  const updateFades = useCallback((x: number, viewportWidth: number, contentWidth: number) => {
    const next = tabEdgeFades(x, viewportWidth, contentWidth)
    setFades((current) =>
      current.start === next.start && current.end === next.end ? current : next
    )
  }, [])

  useEffect(() => {
    updateFades(scrollX.current, viewport, content)
    const target = tabScrollTarget(spans[value], viewport, scrollX.current, content)
    if (target === null) return
    scrollRef.current?.scrollTo({ x: target, animated: scrollX.current > 0 })
  }, [value, viewport, content, spans, updateFades])

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.current = event.nativeEvent.contentOffset.x
    updateFades(scrollX.current, viewport, content)
  }

  const mask = Platform.OS === 'web' ? tabFadeMask(fades, FADE_WIDTH) : null
  // React Native Web passes these through to the element's CSS.
  const maskStyle = mask
    ? ({ maskImage: mask, WebkitMaskImage: mask } as unknown as ViewStyle)
    : null

  return (
    <View style={s.scrollWrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={onScroll}
        onLayout={(event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.width)}
        onContentSizeChange={(width: number) => setContent(width)}
        style={maskStyle}
        contentContainerStyle={s.scrollRow}
        accessibilityRole="tablist"
        accessibilityLabel={ariaLabel}
      >
        {children}
      </ScrollView>
      {Platform.OS === 'web' ? null : <NativeEdgeFades fades={fades} />}
    </View>
  )
}

/**
 * Section navigation: underline tabs, one selected. The same component serves
 * the project tabs (Overview, Base, Settings), the environment tabs and the
 * organization tabs. A segmented control is for filters, never for this.
 *
 * Wide screens wrap the tabs as before; a phone gets one row that scrolls
 * sideways ({@link ScrollingTabBar}), every tab at least 44 pt tall.
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
  const { width } = useWindowDimensions()
  const compact = width < layout.desktopBreakpoint
  const [spans, setSpans] = useState<Readonly<Record<string, TabSpan>>>({})

  const items = tabs.map((tab) => {
    const selected = tab.key === value
    const name = tab.dot && tab.dotLabel ? `${tab.label}, ${tab.dotLabel}` : tab.label
    return (
      <Pressable
        key={tab.key}
        accessibilityRole="tab"
        accessibilityLabel={name}
        accessibilityState={{ selected }}
        onPress={() => onChange(tab.key)}
        onLayout={
          compact
            ? (event: LayoutChangeEvent) => {
                const { x, width: tabWidth } = event.nativeEvent.layout
                setSpans((current) => ({ ...current, [tab.key]: { x, width: tabWidth } }))
              }
            : undefined
        }
        style={[s.tab, (touch || compact) && s.touch, selected && s.on, webPointer]}
      >
        <Text style={selected ? s.textOn : s.text}>{tab.label}</Text>
        {tab.dot ? <View style={s.dot} /> : null}
      </Pressable>
    )
  })

  if (compact) {
    return (
      <ScrollingTabBar value={value} ariaLabel={ariaLabel} spans={spans}>
        {items}
      </ScrollingTabBar>
    )
  }
  return (
    <View accessibilityRole="tablist" accessibilityLabel={ariaLabel} style={s.bar}>
      {items}
    </View>
  )
}
