import type { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/lib/theme'

type ScreenSafeAreaProps = Readonly<{
  children: ReactNode
  backgroundColor?: string
}>

export function ScreenSafeArea({
  children,
  backgroundColor = colors.bg,
}: ScreenSafeAreaProps) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]}>{children}</SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
  },
})
