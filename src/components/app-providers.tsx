import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TamaguiProvider } from 'tamagui'
import '@/lib/control-plane-platform'
import { authSpinnerColor } from '@/lib/auth-accent'
import { AuthProvider } from '@/lib/auth-context'
import { isRemoteCookieClient } from '@/lib/control-plane'
import { hydrateControlPlaneStore } from '@/lib/control-plane-accounts'
import { createAppQueryClient } from '@/lib/query-client'
import tamaguiConfig from '@/lib/tamagui.config'
import { colors } from '@/lib/theme'

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
        <ActivityIndicator size="large" color={authSpinnerColor(undefined)} />
      </View>
    )
  }

  return children
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <ControlPlaneGate>
          <AuthProvider>{children}</AuthProvider>
        </ControlPlaneGate>
        {Platform.OS === 'web' && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
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
