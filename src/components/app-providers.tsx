import type { ReactNode } from 'react'
import { Platform } from 'react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TamaguiProvider } from 'tamagui'
import { AuthProvider } from '@/lib/auth-context'
import { createAppQueryClient } from '@/lib/query-client'
import tamaguiConfig from '@/lib/tamagui.config'

/** Module-level instance — preserves Fast Refresh lifetime. */
const queryClient = createAppQueryClient()

type AppProvidersProps = Readonly<{
  children: ReactNode
}>

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
        {Platform.OS === 'web' && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </TamaguiProvider>
  )
}
