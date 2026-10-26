import { StyleSheet, type ViewStyle } from 'react-native'
import { colors } from '@/lib/theme'
import { CHIP_HEIGHT } from '@/lib/v4/ui-scale'

/**
 * One line height for every breadcrumb level, the separators and the small
 * status chip beside the current object, so their text shares a centre line.
 */
export const CRUMB_LINE_HEIGHT = CHIP_HEIGHT.sm

/** Space above and below a crumb's text: every crumb box is the same height. */
export const CRUMB_PADDING = 4

/** The box of one crumb: the organization button and every trail link use it. */
export const CRUMB_BOX: ViewStyle = {
  flexShrink: 1,
  minWidth: 0,
  borderRadius: 6,
  paddingVertical: CRUMB_PADDING,
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
    color: colors.textDim,
    fontSize: 14,
    lineHeight: CRUMB_LINE_HEIGHT,
    flexShrink: 0,
  },
})
