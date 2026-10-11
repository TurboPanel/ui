import { type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import {
  COMPACT_BREAKPOINT,
  RADIUS,
  SHEET_WIDTH,
  SHEET_WIDTH_WIDE,
} from '@/lib/v4/ui-scale'
import type { ViewStyle } from 'react-native'

const styles = themedStyles((p) => ({
  scrim: { flex: 1, backgroundColor: p.scrim, justifyContent: 'center', padding: 16 },
  panel: {
    alignSelf: 'center',
    width: '100%',
    maxHeight: '90%',
    borderRadius: RADIUS.sheet,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface,
    zIndex: 2,
    // The spec's pop shadow (web and the new React Native renderer).
    ...({ boxShadow: p.shadowPop } as unknown as ViewStyle),
  },
  bottom: {
    marginTop: 'auto',
    maxWidth: '100%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  head: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4, gap: 4 },
  title: { ...typeStyle('display', 'title2'), color: p.text, lineHeight: 25 },
  sub: { ...typeStyle('body', 'footnote'), color: p.text3 },
  body: { flexShrink: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, gap: 20 },
  foot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: p.sep,
  },
  why: { ...typeStyle('body', 'footnote'), color: p.text3, marginRight: 'auto', flexShrink: 1 },
}))

/**
 * A sheet: a centred panel on a wide screen, a bottom sheet on a phone, over a
 * dimmed page. Reserve it for a choice or a form that must be finished before
 * going on; the title, an optional grey sub line, the body, and a footer of
 * actions (cancel on the left of the confirm, aligned right).
 *
 * The scrim closes it (named "Close {title}"), and so does Android back.
 * `why` is the small grey sentence at the left of the footer ("Nothing goes
 * live until you deploy").
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  why,
  wide = false,
  footer,
  children,
}: Readonly<{
  visible: boolean
  onClose: () => void
  title: string
  subtitle?: string
  why?: string
  wide?: boolean
  /** The action buttons, usually quiet Cancel then a secondary or primary confirm. */
  footer?: ReactNode
  children?: ReactNode
}>) {
  const p = usePalette()
  const s = styles(p)
  const { width } = useWindowDimensions()
  const compact = width < COMPACT_BREAKPOINT
  const maxWidth = wide ? SHEET_WIDTH_WIDE : SHEET_WIDTH
  return (
    <Modal
      visible={visible}
      transparent
      animationType={compact ? 'slide' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={s.scrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
        />
        <View style={[s.panel, { maxWidth }, compact && s.bottom]}>
          <View style={s.head}>
            <Text accessibilityRole="header" style={s.title}>
              {title}
            </Text>
            {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
          </View>
          <ScrollView
            style={s.body}
            contentContainerStyle={s.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer || why ? (
            <View style={s.foot}>
              {why ? <Text style={s.why}>{why}</Text> : null}
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}
