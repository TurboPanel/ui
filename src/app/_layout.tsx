import { Redirect, Stack, useSegments, type Href } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import {
  AuthProvider,
  dashboardHref,
  hasUserSession,
  useAuth,
} from '@/lib/auth-context'
import { colors } from '@/lib/theme'

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGuard />
    </AuthProvider>
  )
}

function AuthGuard() {
  const { session, needsInstall, isLoading } = useAuth()
  const segments = useSegments()
  const topSegment = (segments as readonly string[])[0]

  if (isLoading) {
    return <View style={styles.loading} />
  }

  const onSignIn = topSegment === 'sign-in'
  const onInstall = topSegment === 'install'
  const onRecovering = topSegment === 'recovering'

  if (onRecovering) {
    return <Stack screenOptions={{ headerShown: false }} />
  }

  if (needsInstall) {
    if (!onInstall) {
      return <Redirect href={'/install' as Href} />
    }

    return <Stack screenOptions={{ headerShown: false }} />
  }

  if (onInstall) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  if (!hasUserSession(session) && !onSignIn) {
    return <Redirect href={'/sign-in' as Href} />
  }

  if (hasUserSession(session) && onSignIn) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
  },
})
