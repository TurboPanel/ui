import { useRouter, useLocalSearchParams, type Href } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth-context'
import {
  parseRecoveryReason,
  pollInstanceRecovery,
  recoveryDetail,
  recoveryTitle,
  type RecoveryReason,
} from '@/lib/instance-recovery'
import { colors, spacing } from '@/lib/theme'

const POLL_MS = 1_000

export default function RecoveringScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ reason?: string }>()
  const reason = parseRecoveryReason(params.reason)
  const { clearSession, refreshInstallStatus, refreshSession } = useAuth()
  const [statusText, setStatusText] = useState('Waiting for instance…')
  const redirected = useRef(false)

  useEffect(() => {
    clearSession()
  }, [clearSession])

  useEffect(() => {
    let cancelled = false

    async function tick() {
      if (cancelled || redirected.current) return

      const result = await pollInstanceRecovery()
      if (cancelled || redirected.current) return

      if (result.kind === 'waiting') {
        setStatusText('Waiting for instance…')
        return
      }

      redirected.current = true
      setStatusText('Instance is back online. Redirecting…')

      const needsInstall = result.kind === 'needsInstall'
      await refreshInstallStatus().catch(() => {
        // Best effort — poll already read install status.
      })

      if (needsInstall) {
        router.replace('/install' as Href)
        return
      }

      const session = await refreshSession().catch(() => null)
      if (session?.organizationId) {
        router.replace(`/${session.organizationId}/servers` as Href)
        return
      }

      router.replace('/sign-in' as Href)
    }

    void tick()
    const timer = setInterval(() => {
      void tick()
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [refreshInstallStatus, refreshSession, router])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.title}>{recoveryTitle(reason)}</Text>
        <Text style={styles.detail}>{recoveryDetail(reason)}</Text>
        <Text style={styles.status}>{statusText}</Text>
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
    gap: spacing.md,
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  detail: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  status: {
    fontSize: 14,
    color: colors.textLabel,
    textAlign: 'center',
  },
})
