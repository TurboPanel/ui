import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native'
import {
  authFormStyles,
  authScrollWebStyle,
} from '@/components/auth/auth-form-styles'

const COPYRIGHT_YEAR = new Date().getFullYear()

export function AuthScreenShell({
  title,
  description,
  footer,
  children,
}: Readonly<{
  title: string
  description?: string
  footer?: ReactNode
  children: ReactNode
}>) {
  return (
    <KeyboardAvoidingView
      style={[authFormStyles.scroll, authScrollWebStyle]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[authFormStyles.scroll, authScrollWebStyle]}
        contentContainerStyle={authFormStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <View style={authFormStyles.column}>
          <View style={authFormStyles.panel}>
            <View style={authFormStyles.panelHeader} accessibilityRole="header">
              <Text style={authFormStyles.panelTitle}>{title}</Text>
              {description ? (
                <Text style={authFormStyles.panelCopy}>{description}</Text>
              ) : null}
            </View>
            {children}
          </View>

          {footer ? <View style={authFormStyles.footer}>{footer}</View> : null}

          <Text style={authFormStyles.copyright}>
            © {COPYRIGHT_YEAR} TurboPanel
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
