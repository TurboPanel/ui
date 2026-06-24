import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, type Href } from 'expo-router'
import { adminAreaHref } from '@/lib/admin-navigation'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import { colors, spacing } from '@/lib/theme'

export default function WelcomeScreen() {
  const { session, signOut } = useAuth()
  const router = useRouter()
  const showAdminLink = isAdminSession(session)

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>TurboPanel</Text>
        <Text style={styles.subtitle}>You are signed in</Text>
        {session?.email ? (
          <Text style={styles.email}>{session.email}</Text>
        ) : null}
        <Text style={styles.detail}>
          Your account is not assigned to an organization yet. Contact an
          administrator to get access, or wait for organization onboarding to
          become available.
        </Text>
        {showAdminLink ? (
          <Pressable
            style={styles.adminButton}
            onPress={() => router.push(adminAreaHref('networking') as Href)}
          >
            <Text style={styles.adminButtonText}>Instance administration</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.button} onPress={() => void signOut()}>
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: spacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 18,
    color: colors.textMuted,
    textAlign: 'center',
  },
  email: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  detail: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 420,
  },
  adminButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  adminButtonText: {
    color: colors.buttonText,
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.bgInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
})
