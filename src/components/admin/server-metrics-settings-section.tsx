import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Button,
  ButtonRow,
  SectionPanel,
  SettingRow,
  TextField,
  Toggle,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  SERVER_METRICS_LIVE_MAX_MINUTES,
  SERVER_METRICS_LIVE_MIN_MINUTES,
} from '@/lib/instance-api'
import {
  useSaveServerMetricsLiveSettings,
  useServerMetricsLiveSettings,
} from '@/lib/queries/admin'
import { spacing } from '@/lib/theme'

/** Cap restored when re-enabling live metrics — mirrors the instance default. */
const DEFAULT_LIVE_MAX_MINUTES = 60

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function parseMinutesDraft(draft: string): number | null {
  if (!/^\d+$/.test(draft.trim())) return null
  const parsed = Number.parseInt(draft.trim(), 10)
  if (
    parsed < SERVER_METRICS_LIVE_MIN_MINUTES ||
    parsed > SERVER_METRICS_LIVE_MAX_MINUTES
  ) {
    return null
  }
  return parsed
}

export function ServerMetricsSettingsSection() {
  const [error, setError] = useState<string | null>(null)
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null)

  const query = useServerMetricsLiveSettings()
  const mutation = useSaveServerMetricsLiveSettings()

  const settings = query.data
  const maxMinutes = settings?.maxMinutes
  const enabled = maxMinutes != null && maxMinutes > 0
  const pending = mutation.isPending || query.isLoading

  const queryError =
    query.isError && !error
      ? errorMessage(query.error, 'Failed to load server metrics settings')
      : null
  const displayError = error ?? mutation.actionError ?? queryError

  const save = (next: number) => {
    setError(null)
    mutation.mutate(next, {
      onSuccess: () => {
        setMinutesDraft(null)
      },
      onError: (err) => {
        setError(errorMessage(err, 'Failed to save server metrics settings'))
      },
    })
  }

  const saveDraft = () => {
    const draft = minutesDraft ?? (enabled ? String(maxMinutes) : '')
    const parsed = parseMinutesDraft(draft)
    if (parsed == null) {
      setError(
        `Session length must be a whole number from ${SERVER_METRICS_LIVE_MIN_MINUTES} to ${SERVER_METRICS_LIVE_MAX_MINUTES} minutes.`,
      )
      return
    }
    save(parsed)
  }

  const minutesText =
    minutesDraft ?? (enabled && maxMinutes != null ? String(maxMinutes) : '')

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Server metrics</Text>
      <Text style={panelStyles.pageCopy}>
        Live mode samples a host every 10 seconds while an operator watches the
        5m/10m metrics ranges. The cap below bounds one live session; the
        daemon returns to 1-minute sampling when it expires.
      </Text>

      <SectionPanel
        title="Live metrics sessions"
        hint={`One session may run ${SERVER_METRICS_LIVE_MIN_MINUTES}–${SERVER_METRICS_LIVE_MAX_MINUTES} minutes; disabling turns live mode off everywhere`}
      >
        {displayError ? (
          <Text style={panelStyles.error}>{displayError}</Text>
        ) : null}

        <SettingRow label={statusLabel(query.isLoading, enabled, maxMinutes)}>
          <Toggle
            value={enabled}
            disabled={!settings}
            busy={pending}
            accessibilityLabel="Live metrics sessions"
            onValueChange={(next) => {
              if (!settings) return
              save(next ? DEFAULT_LIVE_MAX_MINUTES : 0)
            }}
          />
        </SettingRow>

        {enabled ? (
          <>
            <TextField
              label="Max session length (minutes)"
              value={minutesText}
              onChangeText={setMinutesDraft}
              editable={!pending}
              keyboardType="number-pad"
              placeholder={String(DEFAULT_LIVE_MAX_MINUTES)}
              accessibilityLabel="Max live session length in minutes"
              hint={`${SERVER_METRICS_LIVE_MIN_MINUTES}–${SERVER_METRICS_LIVE_MAX_MINUTES} minutes per session.`}
            />
            <ButtonRow>
              <Button
                label="Save session length"
                variant="primary"
                busy={mutation.isPending}
                disabled={pending || minutesDraft == null}
                onPress={saveDraft}
              />
            </ButtonRow>
          </>
        ) : null}
      </SectionPanel>
    </View>
  )
}

function statusLabel(
  loading: boolean,
  enabled: boolean,
  maxMinutes: number | undefined,
): string {
  if (loading) return 'Loading…'
  if (enabled) return `Live sessions enabled · up to ${maxMinutes} minutes`
  return 'Live sessions disabled'
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
})
