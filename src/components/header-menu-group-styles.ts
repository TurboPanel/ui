import { Platform, StyleSheet, type ViewStyle } from 'react-native'
import { webPointer } from '@/components/org/org-panel-styles'
import { glass } from '@/lib/glass'
import { chrome, colors, spacing } from '@/lib/theme'

export const HEADER_MENU_WIDTH = 280
export const HEADER_TRIGGER_MAX_WIDTH = 220
/** Matches `triggerLabel` lineHeight so leading icons sit on the same band. */
export const HEADER_TRIGGER_ICON_SIZE = 16

const menuShadow =
  Platform.OS === 'web'
    ? ({
        boxShadow: glass.shadow,
      } as const)
    : {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 8,
      }

const triggerWebMotion =
  Platform.OS === 'web'
    ? ({
        transitionProperty: 'background-color',
        transitionDuration: '150ms',
        transitionTimingFunction: 'ease',
      } as unknown as ViewStyle)
    : {}

const triggerFocusRing =
  Platform.OS === 'web'
    ? ({
        outlineWidth: 2,
        outlineStyle: 'solid',
        outlineColor: chrome.accent,
        outlineOffset: 2,
      } as unknown as ViewStyle)
    : {}

export type HeaderPressableState = Readonly<{
  pressed: boolean
  hovered?: boolean
  focused?: boolean
}>

/**
 * Resting header org / user / notification controls are borderless.
 * Hover and press paint a rounded tile (`bgSecondary`); open uses `chrome.bgActive`.
 */
export function headerTriggerStyle(
  state: HeaderPressableState,
  options?: Readonly<{ open?: boolean; icon?: boolean }>,
) {
  const open = options?.open === true
  const showTile = state.hovered === true || state.pressed
  return [
    headerMenuGroupStyles.trigger,
    options?.icon === true ? headerMenuGroupStyles.triggerIcon : null,
    showTile ? headerMenuGroupStyles.triggerHover : null,
    open ? headerMenuGroupStyles.triggerOpen : null,
    state.focused === true ? headerMenuGroupStyles.triggerFocused : null,
    state.pressed ? headerMenuGroupStyles.triggerPressed : null,
    webPointer,
  ]
}

export const headerMenuGroupStyles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    maxWidth: HEADER_TRIGGER_MAX_WIDTH,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
    flexShrink: 1,
    minWidth: 0,
    ...triggerWebMotion,
  },
  triggerIcon: {
    width: 40,
    maxWidth: 40,
    paddingLeft: 0,
    paddingRight: 0,
    justifyContent: 'center',
    flexShrink: 0,
  },
  triggerHover: {
    backgroundColor: colors.bgSecondary,
  },
  triggerOpen: {
    backgroundColor: chrome.bgActive,
  },
  triggerFocused: {
    ...triggerFocusRing,
  },
  triggerPressed: {
    opacity: 0.9,
  },
  triggerGlyph: {
    width: HEADER_TRIGGER_ICON_SIZE,
    height: HEADER_TRIGGER_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  triggerCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  triggerLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: HEADER_TRIGGER_ICON_SIZE,
  },
  menu: {
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: 10,
    backgroundColor: glass.fillStrong,
    padding: spacing.sm,
    gap: 2,
    ...menuShadow,
  },
  menuSheet: {
    maxHeight: '55%',
  },
  menuHeading: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    minHeight: 36,
  },
  menuItemActive: {
    backgroundColor: chrome.bgActive,
  },
  menuItemLabel: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    minWidth: 0,
  },
  menuItemLabelActive: {
    color: colors.text,
    fontWeight: '600',
  },
  menuItemMark: {
    width: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuAction: {
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    minHeight: 36,
    justifyContent: 'center',
  },
  menuActionLabel: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 4,
  },
  itemPressed: {
    opacity: 0.85,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-start',
  },
  backdropCompact: {
    backgroundColor: colors.overlay,
  },
  desktopMenuWrap: {
    position: 'absolute',
    zIndex: 2,
    pointerEvents: 'box-none',
  },
  sheetWrap: {
    marginTop: 'auto',
    padding: spacing.md,
    zIndex: 2,
    pointerEvents: 'box-none',
  },
})
