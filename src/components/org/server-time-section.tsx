import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { ServerTimezonePicker } from '@/components/org/server-timezone-picker'
import {
  type CommandEnqueueResponse,
  fetchTimezones,
  type NtpSetInput,
  type ServerDetailRecord,
  setServerNtp,
  setServerTimezone,
} from '@/lib/instance-api'
import { formatLocalDateTime } from '@/lib/format-datetime'
import { orgRouteHref } from '@/lib/org-navigation'
import { useQuery } from '@tanstack/react-query'
import { colors, spacing } from '@/lib/theme'

function parseHostList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function timezoneSourceLabel(source: ServerDetailRecord['timezoneSource']): string {
  if (source === 'server') return 'Server override'
  if (source === 'organization') return 'Organization default'
  return 'Not set'
}

function ntpSyncLabel(synced: boolean | undefined): string {
  if (synced === true) return 'Synced'
  if (synced === false) return 'Not synced'
  return 'Unknown'
}

export function ServerTimeSection({
  orgId,
  server,
  canManage,
  timezoneCommandInFlight,
  timezonePollError,
  ntpCommandInFlight,
  ntpPollError,
  onEnqueueCommand,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  canManage: boolean
  timezoneCommandInFlight: boolean
  timezonePollError: string | null
  ntpCommandInFlight: boolean
  ntpPollError: string | null
  onEnqueueCommand: (response: CommandEnqueueResponse, kind: 'timezone' | 'ntp') => void
}>) {
  const router = useRouter()
  const timeSync = server.timeSync
  const timezonesQuery = useQuery({
    queryKey: ['timezones'],
    queryFn: fetchTimezones,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const [pickedTimezone, setPickedTimezone] = useState<string | null>(
    server.timezone,
  )
  const [timezoneError, setTimezoneError] = useState<string | null>(null)
  const [timezoneSubmitting, setTimezoneSubmitting] = useState(false)

  const [ntpEnabled, setNtpEnabled] = useState(timeSync?.ntpEnabled === true)
  const [ntpServersText, setNtpServersText] = useState(
    (timeSync?.ntpServers ?? []).join(', '),
  )
  const [fallbackText, setFallbackText] = useState(
    (timeSync?.fallbackNtpServers ?? []).join(', '),
  )
  const [ntpError, setNtpError] = useState<string | null>(null)
  const [ntpSubmitting, setNtpSubmitting] = useState(false)

  const timezoneDisabledReason = useMemo(() => {
    if (!canManage) return 'Organization manage permission required.'
    if (!server.connected) return 'Daemon must be online to change timezone.'
    if (server.enforceServerTimezone) {
      return 'Organization enforces its default timezone for all servers.'
    }
    return null
  }, [canManage, server.connected, server.enforceServerTimezone])

  const timezoneFormsDisabled =
    timezoneCommandInFlight ||
    timezoneSubmitting ||
    ntpSubmitting ||
    Boolean(timezoneDisabledReason)

  const ntpDisabledReason = useMemo(() => {
    if (!canManage) return 'Organization manage permission required.'
    if (!server.connected) return 'Daemon must be online to change NTP settings.'
    return null
  }, [canManage, server.connected])

  const ntpFormsDisabled =
    ntpCommandInFlight ||
    ntpSubmitting ||
    timezoneSubmitting ||
    Boolean(ntpDisabledReason)

  const applyTimezone = async () => {
    if (!pickedTimezone || timezoneFormsDisabled) return
    setTimezoneError(null)
    setTimezoneSubmitting(true)
    try {
      const result = await setServerTimezone(server.id, pickedTimezone)
      onEnqueueCommand(result, 'timezone')
    } catch (err) {
      setTimezoneError(err instanceof Error ? err.message : 'Failed to apply timezone')
    } finally {
      setTimezoneSubmitting(false)
    }
  }

  const applyNtp = async () => {
    if (ntpFormsDisabled) return
    const payload: NtpSetInput = {}
    if (ntpEnabled !== (timeSync?.ntpEnabled === true)) {
      payload.enabled = ntpEnabled
    }
    const servers = parseHostList(ntpServersText)
    const fallback = parseHostList(fallbackText)
    const prevServers = timeSync?.ntpServers ?? []
    const prevFallback = timeSync?.fallbackNtpServers ?? []
    if (servers.join(',') !== prevServers.join(',')) {
      payload.servers = servers
    }
    if (fallback.join(',') !== prevFallback.join(',')) {
      payload.fallbackServers = fallback
    }
    if (
      payload.enabled === undefined &&
      payload.servers === undefined &&
      payload.fallbackServers === undefined
    ) {
      setNtpError('Change at least one NTP setting before applying.')
      return
    }
    setNtpError(null)
    setNtpSubmitting(true)
    try {
      const result = await setServerNtp(server.id, payload)
      onEnqueueCommand(result, 'ntp')
    } catch (err) {
      setNtpError(err instanceof Error ? err.message : 'Failed to apply NTP settings')
    } finally {
      setNtpSubmitting(false)
    }
  }

  return (
    <View style={styles.root}>
      <SectionPanel title="Time sync status" hint="Facts from the last daemon heartbeat">
        {!timeSync ? (
          <Text style={orgPanelStyles.muted}>
            No time facts reported yet — waiting for the daemon.
          </Text>
        ) : (
          <>
            <View style={styles.statusRow}>
              <View style={styles.statusPair}>
                <View
                  style={[
                    styles.dot,
                    timeSync.ntpEnabled ? styles.dotOn : styles.dotOff,
                  ]}
                />
                <Text style={styles.statusText}>
                  NTP client {timeSync.ntpEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
              <View style={styles.statusPair}>
                <View
                  style={[
                    styles.dot,
                    timeSync.ntpSynced ? styles.dotOn : styles.dotMuted,
                  ]}
                />
                <Text style={styles.statusText}>
                  {ntpSyncLabel(timeSync.ntpSynced)}
                </Text>
              </View>
            </View>
            {timeSync.ntpServers && timeSync.ntpServers.length > 0 ? (
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>Servers: </Text>
                <Text style={styles.mono}>{timeSync.ntpServers.join(', ')}</Text>
              </Text>
            ) : null}
            {timeSync.fallbackNtpServers &&
            timeSync.fallbackNtpServers.length > 0 ? (
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>Fallback: </Text>
                <Text style={styles.mono}>
                  {timeSync.fallbackNtpServers.join(', ')}
                </Text>
              </Text>
            ) : null}
            {timeSync.capturedAt ? (
              <Text style={orgPanelStyles.muted}>
                Captured{' '}
                {formatLocalDateTime(timeSync.capturedAt, {
                  timeZoneName: 'short',
                })}
              </Text>
            ) : null}
          </>
        )}
      </SectionPanel>

      <SectionPanel title="Timezone" hint="Effective timezone on this host">
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Effective: </Text>
          <Text style={styles.mono}>{server.timezone ?? 'Not set'}</Text>
        </Text>
        <Text style={orgPanelStyles.muted}>
          Source: {timezoneSourceLabel(server.timezoneSource)}
        </Text>

        {timezoneDisabledReason ? (
          <Text style={orgPanelStyles.muted}>{timezoneDisabledReason}</Text>
        ) : null}
        {server.enforceServerTimezone ? (
          <Pressable
            onPress={() =>
              router.push(orgRouteHref(orgId, 'servers', 'settings') as `/${string}/servers/settings`)
            }
            style={webPointer}
          >
            <Text style={styles.linkText}>Open fleet timezone settings</Text>
          </Pressable>
        ) : null}

        {timezoneError ? (
          <Text style={orgPanelStyles.error}>{timezoneError}</Text>
        ) : null}
        {timezonePollError ? (
          <Text style={orgPanelStyles.error}>{timezonePollError}</Text>
        ) : null}

        <ServerTimezonePicker
          value={pickedTimezone}
          options={timezonesQuery.data?.timezones ?? []}
          disabled={timezoneFormsDisabled || Boolean(timezoneDisabledReason)}
          placeholder="Select timezone…"
          onChange={setPickedTimezone}
        />

        <Pressable
          disabled={
            timezoneFormsDisabled || !pickedTimezone || Boolean(timezoneDisabledReason)
          }
          onPress={() => void applyTimezone()}
          style={({ pressed }) => [
            orgPanelStyles.toolbarBtnPrimary,
            (timezoneFormsDisabled || !pickedTimezone) && styles.btnDisabled,
            pressed && styles.btnPressed,
            webPointer,
          ]}
        >
          {timezoneSubmitting || timezoneCommandInFlight ? (
            <ActivityIndicator size="small" color={colors.buttonText} />
          ) : null}
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Apply timezone</Text>
        </Pressable>
        {timezoneCommandInFlight ? (
          <Text style={orgPanelStyles.muted}>Waiting for command to finish…</Text>
        ) : null}
      </SectionPanel>

      <SectionPanel title="NTP configuration" hint="Pushed to the daemon via command">
        {ntpDisabledReason ? (
          <Text style={orgPanelStyles.muted}>{ntpDisabledReason}</Text>
        ) : null}
        {ntpError ? <Text style={orgPanelStyles.error}>{ntpError}</Text> : null}
        {ntpPollError ? <Text style={orgPanelStyles.error}>{ntpPollError}</Text> : null}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>NTP client enabled</Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{
              checked: ntpEnabled,
              disabled: ntpFormsDisabled,
            }}
            disabled={ntpFormsDisabled}
            onPress={() => setNtpEnabled((on) => !on)}
            style={[
              styles.toggle,
              ntpEnabled ? styles.toggleOn : styles.toggleOff,
              ntpFormsDisabled && styles.btnDisabled,
            ]}
          >
            <Text style={styles.toggleText}>{ntpEnabled ? 'On' : 'Off'}</Text>
          </Pressable>
        </View>

        <Text style={orgPanelStyles.detailLabel}>NTP servers</Text>
        <TextInput
          value={ntpServersText}
          onChangeText={setNtpServersText}
          editable={!ntpFormsDisabled}
          placeholder="pool.ntp.org, time.google.com"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        <Text style={orgPanelStyles.detailLabel}>Fallback servers</Text>
        <TextInput
          value={fallbackText}
          onChangeText={setFallbackText}
          editable={!ntpFormsDisabled}
          placeholder="Optional fallback hosts"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        <Pressable
          disabled={ntpFormsDisabled}
          onPress={() => void applyNtp()}
          style={({ pressed }) => [
            orgPanelStyles.toolbarBtnSecondary,
            ntpFormsDisabled && styles.btnDisabled,
            pressed && styles.btnPressed,
            webPointer,
          ]}
        >
          {ntpSubmitting || ntpCommandInFlight ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : null}
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Apply NTP</Text>
        </Pressable>
        {ntpCommandInFlight ? (
          <Text style={orgPanelStyles.muted}>Waiting for command to finish…</Text>
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  statusPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOn: {
    backgroundColor: colors.accent,
  },
  dotOff: {
    backgroundColor: colors.textFaint,
    borderWidth: 1,
    borderColor: colors.borderChip,
  },
  dotMuted: {
    backgroundColor: colors.pending,
  },
  statusText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  settingsLink: {
    marginTop: spacing.xs,
  },
  linkText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  toggle: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  toggleOn: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  toggleOff: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  toggleText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: spacing.sm,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.88,
  },
})
