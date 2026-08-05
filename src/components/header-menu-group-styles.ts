import { StyleSheet } from 'react-native'
import { chrome, colors, spacing } from '@/lib/theme'

export const HEADER_MENU_GROUP_HEIGHT = 42
export const HEADER_MENU_WIDTH = 300

export const headerMenuGroupStyles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    maxWidth: 520,
    overflow: 'hidden',
  },
  groupDivider: {
    width: 1,
    backgroundColor: colors.border,
    alignSelf: 'stretch',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: HEADER_MENU_GROUP_HEIGHT,
    flexShrink: 1,
    minWidth: 0,
  },
  orgSegment: {
    flex: 1,
    maxWidth: 240,
  },
  userSegment: {
    flex: 1,
    maxWidth: 260,
  },
  segmentMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
    minWidth: 0,
  },
  segmentMainStatic: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
    minWidth: 0,
  },
  segmentSplitDivider: {
    width: 1,
    backgroundColor: colors.border,
    alignSelf: 'stretch',
  },
  segmentChevronButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 40,
  },
  segmentLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  segmentChevron: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 16,
    marginTop: 1,
  },
  segmentOpen: {
    backgroundColor: chrome.bgActive,
  },
  segmentChevronOpen: {
    color: chrome.accent,
    transform: [{ rotate: '180deg' }],
  },
  menu: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 10,
    backgroundColor: colors.bgPanel,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  menuSheet: {
    maxHeight: '55%',
  },
  menuHeading: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  menuItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  menuItemActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  menuItemLabel: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
  },
  menuItemLabelActive: {
    color: chrome.accent,
  },
  menuActionPrimary: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: 2,
  },
  menuActionPrimaryLabel: {
    color: chrome.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  itemPressed: {
    opacity: 0.85,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-start',
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
