import type { ReactNode } from 'react'
import { Platform } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TamaguiProvider } from 'tamagui'
import { AuthProvider } from '@/lib/auth-context'
import tamaguiConfig from '@/lib/tamagui.config'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
  },
})

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
