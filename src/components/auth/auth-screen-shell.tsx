import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { AuthScreenBackground } from '@/components/auth/auth-screen-background'
import {
  authFormStyles,
  authScrollWebStyle,
} from '@/components/auth/auth-form-styles'
import { HighAvailabilityWordmark } from '@/components/brand/high-availability-wordmark'
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { GlassSurface } from '@/components/glass/glass-surface'
import { navyPalette } from '@/lib/theme-palettes'

/**
 * Sign-in and the other auth screens always paint dark: their animated wash is
 * built from fixed Navy colours. On the web this re-points every theme
 * variable inside the screen at Navy (`[data-theme="dark"]` in the theme
 * stylesheet); native is Navy already.
 */
const DARK_SCOPE = { dataSet: { theme: 'dark' } } as object

const COPYRIGHT_YEAR = new Date().getFullYear()

export function AuthScreenShell({
  title,
  description,
  footer,
  accentColor = navyPalette.accent,
  animateBackdrop = true,
  children,
}: Readonly<{
  title: string
  description?: string
  footer?: ReactNode
  /** Accent for the gradient wash (Navy hex: the wash does colour maths on it). */
  accentColor?: string
  /** When false, skip backdrop streak motion (static wash + grid only). */
  animateBackdrop?: boolean
  children: ReactNode
}>) {
  return (
    <View style={authFormStyles.shell} {...DARK_SCOPE}>
      <AuthScreenBackground
        accentColor={accentColor}
        animate={animateBackdrop}
      />
      <KeyboardAvoidingView
        style={[authFormStyles.scrollTransparent, authScrollWebStyle]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={[authFormStyles.scrollTransparent, authScrollWebStyle]}
          contentContainerStyle={authFormStyles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <View style={authFormStyles.column}>
            <View style={authFormStyles.pageHeader} accessibilityRole="header">
              <View style={authFormStyles.pageTitleRow}>
                <TurboPanelLogo size={44} style={authFormStyles.brandMark} />
                <View style={authFormStyles.wordmarkSlot}>
                  <HighAvailabilityWordmark showVersion={false} />
                </View>
                <Text style={authFormStyles.pageTitle}>{title}</Text>
              </View>
              {description ? (
                <Text style={authFormStyles.pageCopy}>{description}</Text>
              ) : null}
            </View>

            <GlassSurface style={authFormStyles.panel} intensity="regular">
              <View
                style={[
                  authFormStyles.panelAccent,
                  { backgroundColor: accentColor },
                ]}
              />
              <View style={authFormStyles.panelBody}>{children}</View>
            </GlassSurface>

            {footer ? <View style={authFormStyles.footer}>{footer}</View> : null}

            <Text style={authFormStyles.copyright}>
              © {COPYRIGHT_YEAR} TurboPanel
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
