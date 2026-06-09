import { useRouter, type Href } from 'expo-router'
import { useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  bootstrapInstall,
  completeInstall,
} from '@/lib/instance-api'
import { useAuth } from '@/lib/auth-context'
import { colors, spacing } from '@/lib/theme'

export default function InstallScreen() {
  const router = useRouter()
  const { refreshSession, refreshInstallStatus } = useAuth()
  const [hostVerified, setHostVerified] = useState(false)
  const [hostUsername, setHostUsername] = useState('root')
  const [hostPassword, setHostPassword] = useState('')
  const [superadminEmail, setSuperadminEmail] = useState('')
  const [superadminPassword, setSuperadminPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleHostAuth() {
    if (!hostUsername.trim() || !hostPassword) {
      setError('Enter host username and password')
      return
    }

    setError(null)
    setIsSubmitting(true)
    try {
      await bootstrapInstall(hostUsername.trim(), hostPassword)
      setHostVerified(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Host authentication failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCompleteSetup() {
    if (!hostUsername.trim() || !hostPassword) {
      setError('Enter host username and password')
      return
    }
    if (!superadminEmail.trim() || !superadminPassword) {
      setError('Enter superadmin email and password')
      return
    }

    setError(null)
    setIsSubmitting(true)
    try {
      const result = await completeInstall({
        hostUsername: hostUsername.trim(),
        hostPassword,
        superadminEmail,
        superadminPassword,
      })

      await refreshInstallStatus()
      await refreshSession()
      router.replace(`/${result.organizationId}/overview` as Href)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>TurboPanel</Text>
        <Text style={styles.subtitle}>Initial setup</Text>
        <Text style={styles.copy}>
          {hostVerified
            ? 'Create your superadmin account. Organization and team use default names.'
            : 'Sign in with root or a sudo-capable host account to begin setup.'}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Host administrator</Text>
          <TextInput
            style={styles.input}
            value={hostUsername}
            onChangeText={setHostUsername}
            placeholder="Username"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSubmitting && !hostVerified}
          />
          <TextInput
            style={styles.input}
            value={hostPassword}
            onChangeText={setHostPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSubmitting}
          />
        </View>

        {hostVerified ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Superadmin account</Text>
            <TextInput
              style={styles.input}
              value={superadminEmail}
              onChangeText={setSuperadminEmail}
              placeholder="Email address"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!isSubmitting}
            />
            <TextInput
              style={styles.input}
              value={superadminPassword}
              onChangeText={setSuperadminPassword}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
            />
          </View>
        ) : null}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={() => void (hostVerified ? handleCompleteSetup() : handleHostAuth())}
          disabled={isSubmitting}
        >
          <Text style={styles.buttonText}>
            {isSubmitting
              ? hostVerified
                ? 'Setting up…'
                : 'Authenticating…'
              : hostVerified
                ? 'Complete setup'
                : 'Continue'}
          </Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
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
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
  },
  copy: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  section: {
    width: '100%',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textLabel,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: colors.bgInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.buttonText,
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
})
