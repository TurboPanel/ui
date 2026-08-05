import { Redirect, Stack, useSegments } from 'expo-router'
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
import { authSpinnerColor } from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import { resolveAuthGuardHref } from '@/lib/auth-guard'
import { colors } from '@/lib/theme'

const STACK_SCREEN_OPTIONS = { headerShown: false } as const

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
  const { session, needsInstall, isLoading, controlPlaneRuntime } = useAuth()
  const segments = useSegments()
  const topSegment = (segments as readonly string[])[0]

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator
          size="large"
          color={authSpinnerColor(controlPlaneRuntime)}
        />
      </View>
    )
  }

  const href = resolveAuthGuardHref({
    session,
    needsInstall,
    topSegment,
    developerDevBypass: __DEV__ && topSegment === 'developer',
  })

  // Keep Stack mounted while redirecting. Swapping Stack out for <Redirect />
  // leaves useSegments() empty, so signed-in users keep resolving to /welcome
  // and expo-router's replace loop hits "Maximum update depth exceeded"
  // (seen right after install completes).
  return (
    <>
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
      {href !== null ? <Redirect href={href} /> : null}
    </>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
