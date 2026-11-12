import { StyleSheet, type ViewStyle } from 'react-native'
import { colors } from '@/lib/theme'
import { CHIP_HEIGHT } from '@/lib/v4/ui-scale'

/**
 * One line height for every breadcrumb level and the small status chip beside
 * the current object, so their text shares a centre line.
 */
export const CRUMB_LINE_HEIGHT = CHIP_HEIGHT.sm

/**
 * Every crumb box is as tall as the header's other buttons (profile and
 * notifications), so the organization button lines up with the profile button.
 */
export const CRUMB_HEIGHT = 40

/**
 * Space between a crumb's text and the side of its box. The separator has no
 * space of its own, so this is the gap on each side of every `›`.
 */
export const CRUMB_PADDING = 8

/** The box of one trail link. */
export const CRUMB_BOX: ViewStyle = {
  flexShrink: 1,
  minWidth: 0,
  minHeight: CRUMB_HEIGHT,
  justifyContent: 'center',
  borderRadius: 8,
  paddingHorizontal: CRUMB_PADDING,
}

/** Shared by the organization crumb and the trail links in the header breadcrumb. */
export const breadcrumbStyles = StyleSheet.create({
  link: CRUMB_BOX,
  linkText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: CRUMB_LINE_HEIGHT,
  },
  separator: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
