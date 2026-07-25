import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchSignupSettings,
  isForbiddenError,
  saveSignupSettings,
  type SignupSettingsResponse,
} from '@/lib/instance-api'
import { useForbiddenRecovery } from '@/lib/query-client'
import { HA_SIGNUP_SETTINGS_NOTE } from '@/lib/platform-copy'
import { colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function SignupSettingsSection() {
  const { handleUnauthorized } = useAuth()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['admin', 'settings', 'signup'],
    queryFn: fetchSignupSettings,
  })
  useForbiddenRecovery(query.error)

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => saveSignupSettings(enabled),
    onSuccess: (data) => {
      setError(null)
      queryClient.setQueryData(['admin', 'settings', 'signup'], data)
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      setError(errorMessage(err, 'Failed to update sign-up setting'))
    },
  })

  const settings = query.data
  const enabled = settings?.enabled === true
  const envForced = settings?.isEnvForced === true
  const pending = mutation.isPending || query.isLoading

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Sign-up</Text>
      <Text style={styles.copy}>
        Control whether public account creation is available on the sign-in
        page. {HA_SIGNUP_SETTINGS_NOTE}
      </Text>

      <SectionPanel
        title="Public sign-up"
        hint="When enabled, guests see Create account and can open /sign-up"
      >
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {query.isError && !error ? (
          <Text style={orgPanelStyles.error}>
            {errorMessage(query.error, 'Failed to load sign-up setting')}
          </Text>
        ) : null}

        {envForced ? (
          <Text style={orgPanelStyles.muted}>
            Sign-up is force-controlled by TURBOPANEL_IS_SIGNUP_ENABLED
            {settings?.envOverride ? ` (${settings.envOverride})` : ''}. Clear
            that environment variable to use this panel toggle.
          </Text>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.statusLabel}>{statusLabel(query.isLoading, enabled)}</Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: enabled, disabled: pending || envForced }}
            disabled={pending || envForced || !settings}
            onPress={() => {
              if (!settings) return
              mutation.mutate(!enabled)
            }}
            style={[
              styles.toggle,
              enabled ? styles.toggleOn : styles.toggleOff,
              pending || envForced ? styles.toggleDisabled : null,
            ]}
          >
            <Text style={styles.toggleText}>
              {enabled ? 'On' : 'Off'}
            </Text>
          </Pressable>
        </View>

        <SignupMeta settings={settings} />
      </SectionPanel>
    </View>
  )
}

function SignupMeta({
  settings,
}: Readonly<{ settings: SignupSettingsResponse | undefined }>) {
  if (!settings) return null
  return (
    <View style={styles.meta}>
      <Text style={orgPanelStyles.muted}>
        Database value: {settings.dbValue ?? 'unset (defaults to off)'}
      </Text>
    </View>
  )
}

function statusLabel(loading: boolean, enabled: boolean): string {
  if (loading) return 'Loading…'
  if (enabled) return 'Sign-up is enabled'
  return 'Sign-up is disabled'
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  statusLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  toggle: {
    minWidth: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleOn: {
    backgroundColor: colors.accent,
  },
  toggleOff: {
    backgroundColor: colors.border,
  },
  toggleDisabled: {
    opacity: 0.5,
  },
  toggleText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
})
