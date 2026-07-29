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
  shell: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    backgroundColor: colors.bg,
  },
  /** Scroller over {@link AuthScreenBackground} — keep fill transparent. */
  scrollTransparent: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    backgroundColor: 'transparent',
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
    paddingVertical: 56,
  },
  column: {
    width: '100%',
    maxWidth: AUTH_FORM_MAX_WIDTH,
    alignSelf: 'center',
    gap: spacing.lg,
  },
  /** Page title lives above the form panel. */
  pageHeader: {
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  pageCopy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel,
    overflow: 'hidden',
    // Soft lift so the panel reads against the grid without heavy chrome.
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
        } as object)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }),
  },
  panelAccent: {
    height: 2,
    width: '100%',
  },
  panelBody: {
    paddingHorizontal: spacing.xl,
    paddingTop: 24,
    paddingBottom: 28,
    gap: spacing.lg,
  },
  field: {
    gap: 0,
  },
  fieldSpaced: {
    marginTop: spacing.xs,
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
    borderRadius: 10,
    minHeight: 54,
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
    marginTop: spacing.sm,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonPressed: {
    opacity: 0.92,
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
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
    marginTop: spacing.xs,
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
