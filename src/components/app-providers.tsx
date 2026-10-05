import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TamaguiProvider, Theme } from 'tamagui'
import '@/lib/control-plane-platform'
import { authSpinnerColor } from '@/lib/auth-accent'
import { AuthProvider } from '@/lib/auth-context'
import { isRemoteCookieClient } from '@/lib/control-plane'
import { hydrateControlPlaneStore } from '@/lib/control-plane-accounts'
import { createAppQueryClient } from '@/lib/query-client'
import tamaguiConfig from '@/lib/tamagui.config'
import { ReauthSheet } from '@/components/auth/reauth-sheet'
import { ControlPlaneUpdatingOverlay } from '@/components/admin/control-plane-updating-overlay'
import { colors } from '@/lib/theme'
import { useColorScheme } from '@/lib/theme-preference'

/** Module-level instance — preserves Fast Refresh lifetime. */
const queryClient = createAppQueryClient()

type AppProvidersProps = Readonly<{
  children: ReactNode
}>

function ControlPlaneGate({ children }: Readonly<{ children: ReactNode }>) {
  const [ready, setReady] = useState(() => !isRemoteCookieClient())

  useEffect(() => {
    if (ready) return
    void hydrateControlPlaneStore().finally(() => {
      setReady(true)
    })
  }, [ready])

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={authSpinnerColor()} />
      </View>
    )
  }

  return children
}

export function AppProviders({ children }: AppProvidersProps) {
  const scheme = useColorScheme()
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={scheme}>
      {/* `defaultTheme` only seeds the provider, so the live choice goes through Theme. */}
      <Theme name={scheme}>
        <QueryClientProvider client={queryClient}>
          <ControlPlaneGate>
            <AuthProvider>
              {children}
              <ControlPlaneUpdatingOverlay />
              <ReauthSheet />
            </AuthProvider>
          </ControlPlaneGate>
          {Platform.OS === 'web' && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
      </Theme>
    </TamaguiProvider>
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
