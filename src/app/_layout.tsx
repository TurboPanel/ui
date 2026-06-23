import { Redirect, Stack, useSegments, type Href } from 'expo-router'
import { useFonts } from 'expo-font'
import { useEffect } from 'react'
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  View,
} from 'react-native'
import type { AppStateStatus } from 'react-native'
import { focusManager } from '@tanstack/react-query'
import { AppProviders } from '@/components/app-providers'
import { SafeAreaRoot } from '@/components/safe-area-root'
import {
  dashboardHref,
  hasUserSession,
  useAuth,
} from '@/lib/auth-context'
import { useAuthStatus } from '@/lib/query-client'
import { colors } from '@/lib/theme'

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active')
  }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
    InterMediumItalic: require('@tamagui/font-inter/otf/Inter-MediumItalic.otf'),
    InterBoldItalic: require('@tamagui/font-inter/otf/Inter-BoldItalic.otf'),
  })

  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange)

    return () => subscription.remove()
  }, [])

  if (!fontsLoaded) {
    return null
  }

  return (
    <SafeAreaRoot>
      <AppProviders>
        <AuthGuard />
      </AppProviders>
    </SafeAreaRoot>
  )
}

function AuthGuard() {
  const { session, needsInstall, isLoading } = useAuth()
  const { data: installStatus } = useAuthStatus()
  const isInstallMode = installStatus?.isInstallMode === true
  const segments = useSegments()
  const topSegment = (segments as readonly string[])[0]

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  const onSignIn = topSegment === 'sign-in'
  const onSignUp = topSegment === 'sign-up'
  const onInstall = topSegment === 'install'
  const onWelcome = topSegment === 'welcome'
  const onRecovering = topSegment === 'recovering'
  const onDeveloper = topSegment === 'developer'
  const developerDevBypass = __DEV__ && onDeveloper

  if (onRecovering) {
    return <Stack screenOptions={{ headerShown: false }} />
  }

  if (needsInstall) {
    if (developerDevBypass) {
      return <Stack screenOptions={{ headerShown: false }} />
    }
    if (!onInstall) {
      return <Redirect href={'/install' as Href} />
    }

    return <Stack screenOptions={{ headerShown: false }} />
  }

  if (onInstall && !isInstallMode) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  if (onInstall) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  if (!hasUserSession(session) && !onSignIn && !onSignUp && !developerDevBypass) {
    return <Redirect href={'/sign-in' as Href} />
  }

  if (hasUserSession(session) && session.organizationId && onWelcome) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  if (
    hasUserSession(session) &&
    !session.organizationId &&
    !onWelcome &&
    !onSignIn &&
    !onSignUp &&
    !developerDevBypass
  ) {
    return <Redirect href={'/welcome' as Href} />
  }

  if (hasUserSession(session) && (onSignIn || onSignUp)) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
