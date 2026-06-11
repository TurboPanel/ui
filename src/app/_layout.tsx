import { Redirect, Stack, useSegments, type Href } from 'expo-router'
import { useFonts } from 'expo-font'
import { useEffect } from 'react'
import { AppState, Platform, StyleSheet, View } from 'react-native'
import type { AppStateStatus } from 'react-native'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { TamaguiProvider } from 'tamagui'
import {
  AuthProvider,
  dashboardHref,
  hasUserSession,
  useAuth,
} from '@/lib/auth-context'
import tamaguiConfig from '@/lib/tamagui.config'
import { colors } from '@/lib/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
  },
})

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
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <AuthProvider>
            <AuthGuard />
          </AuthProvider>
          {Platform.OS === 'web' && <ReactQueryDevtools initialIsOpen={false} />}
        </SafeAreaProvider>
      </QueryClientProvider>
    </TamaguiProvider>
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
  const onSignUp = topSegment === 'sign-up'
  const onInstall = topSegment === 'install'
  const onWelcome = topSegment === 'welcome'
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

  if (!hasUserSession(session) && !onSignIn && !onSignUp) {
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
    !onSignUp
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
  },
})
