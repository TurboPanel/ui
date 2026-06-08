import { Redirect, Stack, useSegments, type Href } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { colors } from '@/lib/theme'

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGuard />
    </AuthProvider>
  )
}

function AuthGuard() {
  const { session, isLoading } = useAuth()
  const segments = useSegments()

  if (isLoading) {
    return <View style={styles.loading} />
  }

  const onSignIn = (segments as readonly string[])[0] === 'sign-in'

  if (session === null && !onSignIn) {
    return <Redirect href={'/sign-in' as Href} />
  }

  if (session !== null && onSignIn) {
    return <Redirect href="/" />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
  },
})
