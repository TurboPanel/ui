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
  isAdminSession,
  useAuth,
} from '@/lib/auth-context'
import type { SessionInfo } from '@/lib/instance-api'
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
  const { session, needsInstall, isLoading } = useAuth()
  const segments = useSegments()
  const topSegment = (segments as readonly string[])[0]

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  const href = resolveAuthGuardHref({
    session,
    needsInstall,
    topSegment,
    developerDevBypass: __DEV__ && topSegment === 'developer',
  })

  if (href !== null) {
    return <Redirect href={href} />
  }

  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />
}

type AuthGuardContext = Readonly<{
  session: SessionInfo | null
  needsInstall: boolean
  topSegment: string | undefined
  developerDevBypass: boolean
}>

/** Returns a redirect target, or `null` to render the root Stack. */
function resolveAuthGuardHref(ctx: AuthGuardContext): Href | null {
  const { needsInstall, topSegment, developerDevBypass } = ctx

  if (topSegment === 'recovering') {
    return null
  }

  if (needsInstall) {
    return resolveNeedsInstallHref(topSegment, developerDevBypass)
  }

  // Install wizard is only for fresh hosts; leave once install is complete.
  if (topSegment === 'install') {
    return dashboardHref(ctx.session, needsInstall) as Href
  }

  return resolveSessionRouteHref(ctx)
}

function resolveNeedsInstallHref(
  topSegment: string | undefined,
  developerDevBypass: boolean,
): Href | null {
  if (developerDevBypass || topSegment === 'install') {
    return null
  }
  return '/install' as Href
}

function resolveSessionRouteHref(ctx: AuthGuardContext): Href | null {
  const { session, needsInstall, topSegment, developerDevBypass } = ctx
  const signedIn = hasUserSession(session)
  const onAuthRoute = isPublicAuthRoute(topSegment)
  const dash = dashboardHref(session, needsInstall) as Href

  if (!signedIn && !onAuthRoute && !developerDevBypass) {
    return '/sign-in' as Href
  }

  if (signedIn && (topSegment === 'sign-in' || topSegment === 'sign-up')) {
    return dash
  }

  if (signedIn && topSegment === 'welcome' && dash !== '/welcome') {
    return dash
  }

  if (signedIn && shouldLeaveUnknownSignedInRoute(ctx)) {
    return dash
  }

  return null
}

function isPublicAuthRoute(topSegment: string | undefined): boolean {
  return (
    topSegment === 'sign-in' ||
    topSegment === 'sign-up' ||
    topSegment === 'verify-email'
  )
}

function shouldLeaveUnknownSignedInRoute(ctx: AuthGuardContext): boolean {
  const { session, topSegment, developerDevBypass } = ctx

  if (topSegment === 'welcome' || isPublicAuthRoute(topSegment)) {
    return false
  }
  if (developerDevBypass) {
    return false
  }
  if (topSegment === 'admin' && isAdminSession(session)) {
    return false
  }
  return !isOrgRoute(topSegment)
}

const PUBLIC_ROUTE_SEGMENTS = new Set([
  'sign-in',
  'sign-up',
  'verify-email',
  'install',
  'welcome',
  'admin',
  'recovering',
  'developer',
])

function isOrgRoute(topSegment: string | undefined): boolean {
  return Boolean(topSegment && !PUBLIC_ROUTE_SEGMENTS.has(topSegment))
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
