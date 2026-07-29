import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import type { AuthAccentTheme } from '@/lib/auth-accent'
import { colors, spacing } from '@/lib/theme'

/** Constrained auth column — email/password forms should not stretch on desktop. */
export const AUTH_FORM_MAX_WIDTH = 400

export const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {}

/** RN Web: keep auth scrollers from bleeding past the viewport. */
export const authScrollWebStyle =
  Platform.OS === 'web' ? ({ overflowX: 'hidden' } as const) : null

export const authWebInputStyle = {
  borderWidth: 1,
  borderColor: colors.borderMuted,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: spacing.md,
  paddingVertical: 12,
  fontSize: 16,
  borderRadius: 8,
  minHeight: 44,
  width: '100%' as const,
  outlineStyle: 'none' as const,
} as const

/** Borderless input inside {@link authFormStyles.floatingField}. */
export const authFloatingWebInputStyle = {
  borderWidth: 0,
  backgroundColor: 'transparent',
  color: colors.text,
  paddingHorizontal: spacing.md,
  paddingTop: 22,
  paddingBottom: 8,
  fontSize: 16,
  minHeight: 52,
  width: '100%' as const,
  outlineStyle: 'none' as const,
} as const

export const authFormStyles = StyleSheet.create({
  scroll: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    // Center via column `alignSelf` — parent `alignItems: 'center'` +
    // `width: '100%'` overflows/clips on RN Web when padding is present.
    alignItems: 'stretch',
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: spacing.xl,
    paddingVertical: 48,
  },
  column: {
    width: '100%',
    maxWidth: AUTH_FORM_MAX_WIDTH,
    alignSelf: 'center',
    gap: spacing.xl,
  },
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel,
    paddingHorizontal: spacing.xl,
    paddingVertical: 28,
    gap: spacing.lg,
  },
  panelHeader: {
    gap: spacing.sm,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  panelCopy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textLabel,
    fontSize: 13,
    fontWeight: '500',
  },
  inputNative: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInput,
    color: colors.text,
    borderRadius: 8,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  floatingField: {
    position: 'relative',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    minHeight: 52,
    overflow: 'hidden',
  },
  floatingLabel: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    fontWeight: '500',
    zIndex: 1,
  },
  floatingLabelWithToggle: {
    right: 48,
  },
  floatingInputNative: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: colors.text,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingTop: 22,
    paddingBottom: 8,
    fontSize: 16,
  },
  floatingInputWithToggle: {
    paddingRight: 48,
  },
  passwordRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordToggle: {
    position: 'absolute',
    right: spacing.sm,
    top: 0,
    bottom: 0,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passwordToggleText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: colors.errorText,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: spacing.xs,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerLink: {
    color: colors.textBody,
    fontSize: 14,
    lineHeight: 20,
  },
  footerLinkAccent: {
    fontWeight: '600',
  },
  copyright: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
})

/** Runtime-tinted CTA styles for auth screens. */
export function authAccentStyles(theme: AuthAccentTheme): {
  primaryButton: ViewStyle
  primaryButtonText: TextStyle
  footerLinkAccent: TextStyle
} {
  return {
    primaryButton: { backgroundColor: theme.accent },
    primaryButtonText: { color: theme.onAccent },
    footerLinkAccent: { color: theme.accent },
  }
}
