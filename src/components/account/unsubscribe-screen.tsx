import { useMemo, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { AuthPrimaryButton } from '@/components/auth/auth-primary-button'
import { AuthScreenShell } from '@/components/auth/auth-screen-shell'
import { authAccentStyles } from '@/components/auth/auth-form-styles'
import { TextLink } from '@/components/ui'
import type { NotificationUnsubscribeResult } from '@/lib/instance-api'
import { authAccentForRuntime, resolveControlPlaneRuntime } from '@/lib/auth-accent'
import { unsubscribeCategoryName, unsubscribeResultCopy } from '@/lib/notification-preferences'
import { orgSettingsTabHref } from '@/lib/org-navigation'
import { useNotificationUnsubscribe } from '@/lib/queries/notification-preferences'
import { useAuthStatus } from '@/lib/query-client'
import { colors } from '@/lib/theme'

function firstParam(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first.trim() : ''
}

/**
 * The page an email's unsubscribe link opens. Nothing happens on load (a link
 * scanner opening the page must not unsubscribe anyone); the person presses
 * the button, which posts the token once. Once it has worked the token is
 * taken out of the address, so it is not left in the address bar or in the
 * browser's history; the result stays on screen.
 */
export function UnsubscribeScreenContent() {
  const router = useRouter()
  const token = firstParam(useLocalSearchParams<{ token?: string | string[] }>().token)
  const unsubscribe = useNotificationUnsubscribe()
  const [result, setResult] = useState<NotificationUnsubscribeResult | null>(null)
  const [failed, setFailed] = useState(false)
  const { data: instanceInfo } = useAuthStatus()
  const accent = useMemo(
    () => authAccentForRuntime(resolveControlPlaneRuntime(instanceInfo)),
    [instanceInfo]
  )
  const tint = useMemo(() => authAccentStyles(accent), [accent])

  const settingsHref = (
    result?.ok && result.organizationId
      ? orgSettingsTabHref(result.organizationId, 'notifications')
      : '/account/notifications'
  ) as Href
  const settingsLink = (
    <TextLink label="Open Notification Settings" onPress={() => router.push(settingsHref)} />
  )

  // The result comes first: after a success the token is gone from the
  // address, and that must not read as a link without one.
  if (result) {
    const copy = unsubscribeResultCopy(
      result,
      result.ok ? unsubscribeCategoryName(result.categoryCode) : null
    )
    return (
      <AuthScreenShell title="Unsubscribe" accentColor={accent.accent}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.copy}>{copy.body}</Text>
        {settingsLink}
      </AuthScreenShell>
    )
  }

  if (!token) {
    return (
      <AuthScreenShell title="Unsubscribe" accentColor={accent.accent}>
        <Text style={styles.copy}>
          This link is missing its token. Open the link from the email again, or change your
          notification settings after signing in.
        </Text>
        {settingsLink}
      </AuthScreenShell>
    )
  }

  return (
    <AuthScreenShell title="Unsubscribe" accentColor={accent.accent}>
      <Text style={styles.copy}>
        Stop the emails this link came with? You can turn them back on at any time in your
        notification settings.
      </Text>
      {failed ? (
        <Text style={styles.error}>
          The control plane could not be reached. Try again in a moment.
        </Text>
      ) : null}
      <AuthPrimaryButton
        label="Unsubscribe"
        busyLabel="Unsubscribing…"
        busy={unsubscribe.isPending}
        disabled={unsubscribe.isPending}
        accessibilityLabel="Unsubscribe from these emails"
        tint={tint}
        onPress={() => {
          setFailed(false)
          void unsubscribe.run(token).then((outcome) => {
            if (!outcome.ok) {
              setFailed(true)
              return
            }
            setResult(outcome.value)
            if (outcome.value.ok) router.setParams({ token: undefined })
          })
        }}
      />
      {settingsLink}
    </AuthScreenShell>
  )
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  copy: {
    color: colors.textBody,
    fontSize: 14,
    lineHeight: 21,
  },
  error: {
    color: colors.errorText,
    fontSize: 14,
    lineHeight: 21,
  },
})
