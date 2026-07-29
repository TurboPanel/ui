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
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { colors } from '@/lib/theme'

const COPYRIGHT_YEAR = new Date().getFullYear()

export function AuthScreenShell({
  title,
  description,
  footer,
  accentColor = colors.accent,
  children,
}: Readonly<{
  title: string
  description?: string
  footer?: ReactNode
  /** Runtime accent for the gradient wash (Workers blue / Deno green). */
  accentColor?: string
  children: ReactNode
}>) {
  return (
    <View style={authFormStyles.shell}>
      <AuthScreenBackground accentColor={accentColor} />
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
                <Text style={authFormStyles.pageTitle}>{title}</Text>
              </View>
              {description ? (
                <Text style={authFormStyles.pageCopy}>{description}</Text>
              ) : null}
            </View>

            <View style={authFormStyles.panel}>
              <View
                style={[
                  authFormStyles.panelAccent,
                  { backgroundColor: accentColor },
                ]}
              />
              <View style={authFormStyles.panelBody}>{children}</View>
            </View>

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
