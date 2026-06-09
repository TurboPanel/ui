import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { DeveloperShell } from '@/components/developer/developer-shell'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'
import { DeveloperProvider } from '@/lib/developer-context'
import { colors } from '@/lib/theme'

export default function DeveloperLayout() {
  const { session, isLoading } = useAuth()

  // The developer console is a dev-only surface. In a production build (`__DEV__`
  // is false) the instance does not serve `/api/developer/*` either, so bounce
  // back to the landing page instead of rendering a console that can't talk to
  // anything. The future instance-admin surface will live under its own route.
  if (!__DEV__) {
    return <Redirect href="/" />
  }

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  }

  if (!isSuperadminSession(session)) {
    return <Redirect href="/" />
  }

  return (
    <DeveloperProvider>
      <DeveloperShell />
    </DeveloperProvider>
  )
}
