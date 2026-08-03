import { useRouter, useLocalSearchParams, type Href } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { authSpinnerColor } from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import {
  parseRecoveryReason,
  pollInstanceRecovery,
  recoveryDetail,
  recoveryTitle,
} from '@/lib/instance-recovery'
import { queryKeys } from '@/lib/query-keys'
import { colors, spacing } from '@/lib/theme'

const POLL_MS = 1_000

export default function RecoveringScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ reason?: string }>()
  const reason = parseRecoveryReason(params.reason)
  const {
    clearSession,
    refreshInstallStatus,
    controlPlaneRuntime,
  } = useAuth()
  const spinnerColor = authSpinnerColor(controlPlaneRuntime)
  const [navigated, setNavigated] = useState(false)

  useEffect(() => {
    clearSession()
  }, [clearSession])

  const recoveryQuery = useQuery({
    queryKey: queryKeys.recovery,
    queryFn: pollInstanceRecovery,
    refetchInterval: navigated ? false : POLL_MS,
    retry: false,
  })

  const result = recoveryQuery.data
  const waiting = !result || result.kind === 'waiting'

  useEffect(() => {
    if (navigated || waiting || !result) return

    let cancelled = false
    setNavigated(true)

    void (async () => {
      await refreshInstallStatus().catch(() => {
        // Best effort — poll already read install status.
      })
      if (cancelled) return

      if (result.kind === 'needsInstall') {
        router.replace('/install' as Href)
        return
      }
      if (result.kind === 'signedIn') {
        router.replace(`/${result.organizationId}/servers` as Href)
        return
      }
      if (result.kind === 'welcome') {
        router.replace('/welcome' as Href)
        return
      }
      router.replace('/sign-in' as Href)
    })()

    return () => {
      cancelled = true
    }
  }, [navigated, waiting, result, refreshInstallStatus, router])

  let statusText = 'Waiting for instance…'
  if (!waiting) {
    statusText = 'Instance is back online. Redirecting…'
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ActivityIndicator size="large" color={spinnerColor} />
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
