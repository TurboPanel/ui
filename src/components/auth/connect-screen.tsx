import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { AuthFloatingField } from '@/components/auth/auth-floating-field'
import { AuthPrimaryButton } from '@/components/auth/auth-primary-button'
import { AuthScreenShell } from '@/components/auth/auth-screen-shell'
import {
  authAccentStyles,
  authFormStyles,
  webPointer,
} from '@/components/auth/auth-form-styles'
import { ScreenSafeArea } from '@/components/screen-safe-area'
import { authAccentForRuntime } from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import {
  HA_CONTROL_PLANE_ORIGIN,
  LOCAL_HTTP_ORIGIN,
  LOCAL_HTTPS_ORIGIN,
  isStandaloneExpoWeb,
} from '@/lib/control-plane'
import { connectToControlPlane } from '@/lib/control-plane-connect'
import { HA_PRODUCT_NAME } from '@/lib/platform-copy'
import { colors, spacing } from '@/lib/theme'

const QUICK_PICKS = [
  { label: HA_PRODUCT_NAME, origin: HA_CONTROL_PLANE_ORIGIN },
  { label: 'Use HTTPS', origin: LOCAL_HTTPS_ORIGIN },
  { label: 'Use HTTP', origin: LOCAL_HTTP_ORIGIN },
] as const

export function ConnectScreenContent() {
  if (isStandaloneExpoWeb()) {
    return <MetroWebConnectScreen />
  }
  return <NativeConnectScreen />
}

function MetroWebConnectScreen() {
  const router = useRouter()
  const accent = authAccentForRuntime(undefined)
  return (
    <AuthScreenShell
      title="Open via Caddy"
      description="This Expo web session is not the control plane. Open the UI through Caddy so cookies stay same-origin."
      accentColor={accent.accent}
      animateBackdrop={false}
    >
      <Text style={authFormStyles.pageCopy}>
        Use {LOCAL_HTTPS_ORIGIN} or {LOCAL_HTTP_ORIGIN} in your browser. Visiting
        Metro on port 8081 cannot sign in.
      </Text>
      <AboutLink onPress={() => router.push('/about')} />
    </AuthScreenShell>
  )
}

function NativeConnectScreen() {
  const router = useRouter()
  const { needsInstall, bootstrapError } = useAuth()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [installBlocked, setInstallBlocked] = useState(needsInstall)
  const [loading, setLoading] = useState(false)
  const accent = useMemo(() => authAccentForRuntime(undefined), [])
  const tint = useMemo(() => authAccentStyles(accent), [accent])

  const onChangeUrl = useCallback((text: string) => {
    setUrl(text)
    setError('')
    setInstallBlocked(false)
  }, [])

  const onConnect = useCallback(
    async (raw: string) => {
      setError('')
      setInstallBlocked(false)
      setLoading(true)
      try {
        const result = await connectToControlPlane(raw)
        if (!result.ok) {
          setError(result.error)
          return
        }
        if (result.status.needsInstall) {
          setInstallBlocked(true)
          return
        }
        router.replace('/sign-in' as Href)
      } finally {
        setLoading(false)
      }
    },
    [router],
  )

  const fieldError = error || bootstrapError

  return (
    <AuthScreenShell
      title="Control plane"
      description="Choose TurboPanel High Availability or a self-hosted origin. On a phone, localhost is this device — use the host LAN IP and prefer HTTP :8880 unless the certificate is publicly trusted."
      accentColor={accent.accent}
    >
      <View style={styles.chipRow}>
        {QUICK_PICKS.map((pick) => (
          <Pressable
            key={pick.origin}
            onPress={() => {
              setUrl(pick.origin)
              onConnect(pick.origin).catch(() => {
                // Errors are surfaced via setError.
              })
            }}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Connect to ${pick.label}`}
            style={({ pressed }) => [
              styles.chip,
              pressed && !loading && styles.chipPressed,
              webPointer,
            ]}
          >
            <Text style={styles.chipLabel}>{pick.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={authFormStyles.field}>
        <AuthFloatingField
          label="Control plane URL"
          value={url}
          onChangeText={onChangeUrl}
          accentColor={accent.accent}
          keyboardType="url"
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={() => {
            onConnect(url).catch(() => {
              // Errors are surfaced via setError.
            })
          }}
        />
      </View>

      {fieldError ? (
        <Text style={authFormStyles.error} accessibilityRole="alert">
          {fieldError}
        </Text>
      ) : null}

      {installBlocked ? (
        <Text style={authFormStyles.error} accessibilityRole="alert">
          This control plane still needs first-run setup. Finish install in a
          browser on the host, then return here to sign in.
        </Text>
      ) : null}

      <AuthPrimaryButton
        onPress={() => {
          onConnect(url).catch(() => {
            // Errors are surfaced via setError.
          })
        }}
        disabled={loading}
        busy={loading}
        accessibilityLabel={loading ? 'Connecting' : 'Connect'}
        label="Connect"
        busyLabel="Connecting…"
        tint={tint}
        spinnerColor={accent.onAccent}
      />
      <AboutLink onPress={() => router.push('/about')} />
    </AuthScreenShell>
  )
}

function AboutLink({ onPress }: Readonly<{ onPress: () => void }>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel="About this app"
      style={({ pressed }) => [styles.aboutLink, pressed && styles.chipPressed, webPointer]}
    >
      <Text style={styles.aboutLinkLabel}>About</Text>
    </Pressable>
  )
}

export function ConnectScreen() {
  return (
    <ScreenSafeArea>
      <ConnectScreenContent />
    </ScreenSafeArea>
  )
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipLabel: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
  },
  aboutLink: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  aboutLinkLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
})
