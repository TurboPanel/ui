import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel, SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { SignupSettingsResponse } from '@/lib/instance-api'
import {
  useSaveSignupSettings,
  useSignupSettings,
} from '@/lib/queries/admin'
import { HA_SIGNUP_SETTINGS_NOTE } from '@/lib/platform-copy'
import { spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function SignupSettingsSection() {
  const [error, setError] = useState<string | null>(null)

  const query = useSignupSettings()
  const mutation = useSaveSignupSettings()

  const settings = query.data
  const enabled = settings?.enabled === true
  const envForced = settings?.isEnvForced === true
  const pending = mutation.isPending || query.isLoading

  const queryError =
    query.isError && !error
      ? errorMessage(query.error, 'Failed to load sign-up setting')
      : null
  const displayError = error ?? mutation.actionError ?? queryError

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Sign-up</Text>
      <Text style={panelStyles.pageCopy}>
        Control whether public account creation is available on the sign-in
        page. {HA_SIGNUP_SETTINGS_NOTE}
      </Text>

      <SectionPanel
        title="Public sign-up"
        hint="When enabled, guests see Create account and can open /sign-up"
      >
        {displayError ? <Text style={panelStyles.error}>{displayError}</Text> : null}

        {envForced ? (
          <Text style={panelStyles.muted}>
            Sign-up is force-controlled by TURBOPANEL_IS_SIGNUP_ENABLED
            {settings?.envOverride ? ` (${settings.envOverride})` : ''}. Clear
            that environment variable to use this panel toggle.
          </Text>
        ) : null}

        <SettingRow label={statusLabel(query.isLoading, enabled)}>
          <Toggle
            value={enabled}
            disabled={envForced || !settings}
            busy={pending}
            accessibilityLabel="Public sign-up"
            onValueChange={(next) => {
              if (!settings) return
              setError(null)
              mutation.mutate(next, {
                onError: () => {
                  setError(
                    mutation.actionError ?? 'Failed to update sign-up setting',
                  )
                },
              })
            }}
          />
        </SettingRow>

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
      <Text style={panelStyles.muted}>
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
  meta: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
})
