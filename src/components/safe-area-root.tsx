import type { ReactNode } from 'react'
import '@tamagui/native/setup-safe-area'
import { SafeAreaProvider } from 'react-native-safe-area-context'

type SafeAreaRootProps = {
  children: ReactNode
}

export function SafeAreaRoot({ children }: SafeAreaRootProps) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>
}
