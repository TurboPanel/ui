import { Platform, StyleSheet } from 'react-native'
import { glass } from '@/lib/glass'
import { chrome, colors, spacing } from '@/lib/theme'

export const HEADER_MENU_WIDTH = 280
export const HEADER_TRIGGER_MAX_WIDTH = 220

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
    gap: spacing.sm,
    minHeight: 40,
    maxWidth: HEADER_TRIGGER_MAX_WIDTH,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: glass.fillSoft,
    flexShrink: 1,
    minWidth: 0,
  },
  triggerOpen: {
    borderColor: glass.borderBright,
    backgroundColor: chrome.bgActive,
  },
  triggerPressed: {
    opacity: 0.9,
  },
  triggerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  triggerLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
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
