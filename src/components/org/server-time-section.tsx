import { useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { Button, MonoText, TextField } from '@/components/ui'
import { ServerTimezonePicker } from '@/components/org/server-timezone-picker'
import {
  type CommandEnqueueResponse,
  type NtpSetInput,
  type ServerDetailRecord,
} from '@/lib/instance-api'
import { formatLocalDateTime } from '@/lib/format-datetime'
import {
  configuredSourceLabel,
  formatNtpHostList,
} from '@/lib/host-defaults'
import { datacenterHref, orgRouteHref } from '@/lib/org-navigation'
import {
  useSetServerNtp,
  useSetServerTimezone,
  useTimezones,
} from '@/lib/queries/servers'
import { chrome, colors, spacing } from '@/lib/theme'

type TimeSyncMaybe = ServerDetailRecord['timeSync']

function parseHostList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function timezoneDisabledReason(
  canManage: boolean,
  connected: boolean,
  enforceServerTimezone: boolean,
  datacenterEnforceServerTimezone: boolean,
): string | null {
  if (!canManage) return 'Organization manage permission required.'
  if (!connected) return 'Daemon must be online to change timezone.'
  if (datacenterEnforceServerTimezone) {
    return 'Datacenter enforces its default timezone for member servers.'
  }
  if (enforceServerTimezone) {
    return 'Organization enforces its default timezone for all servers.'
  }
  return null
}

function ntpSyncLabel(synced: boolean | undefined): string {
  if (synced === true) return 'Synced'
  if (synced === false) return 'Not synced'
  return 'Unknown'
}

function initialNtpEnabled(server: ServerDetailRecord): boolean {
  if (server.timeSync?.ntpEnabled != null) return server.timeSync.ntpEnabled
  return server.ntpDefaults?.enabled === true
}

function initialNtpHosts(
  observed: string[] | undefined,
  inherited: string[] | undefined,
): string {
  if (observed && observed.length > 0) return observed.join(', ')
  return formatNtpHostList(inherited)
}

function ntpDisabledReason(canManage: boolean, connected: boolean): string | null {
  if (!canManage) return 'Organization manage permission required.'
  if (!connected) return 'Daemon must be online to change NTP settings.'
  return null
}

function buildNtpPayload(
  ntpEnabled: boolean,
  ntpServersText: string,
  fallbackText: string,
  timeSync: TimeSyncMaybe,
): NtpSetInput | null {
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
    return null
  }
  return payload
}

function HostListLine({
  label,
  hosts,
}: Readonly<{ label: string; hosts: string[] | undefined }>) {
  if (!hosts || hosts.length === 0) return null
  return (
    <Text style={orgPanelStyles.detailLine}>
      <Text style={orgPanelStyles.detailLabel}>{label}: </Text>
      <MonoText>{hosts.join(', ')}</MonoText>
    </Text>
  )
}

function TimeSyncStatusPanel({
  timeSync,
}: Readonly<{ timeSync: TimeSyncMaybe }>) {
  if (!timeSync) {
    return (
      <SectionPanel title="Time sync status" hint="Facts from the last daemon heartbeat">
        <Text style={orgPanelStyles.muted}>
          No time facts reported yet — waiting for the daemon.
        </Text>
      </SectionPanel>
    )
  }

  return (
    <SectionPanel title="Time sync status" hint="Facts from the last daemon heartbeat">
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
      <HostListLine label="Servers" hosts={timeSync.ntpServers} />
      <HostListLine label="Fallback" hosts={timeSync.fallbackNtpServers} />
      {timeSync.capturedAt ? (
        <Text style={orgPanelStyles.muted}>
          Captured{' '}
          {formatLocalDateTime(timeSync.capturedAt, {
            timeZoneName: 'short',
          })}
        </Text>
      ) : null}
    </SectionPanel>
  )
}

function TimezoneSettingsPanel({
  orgId,
  server,
  pickedTimezone,
  timezoneOptions,
  formsDisabled,
  disabledReason,
  submitting,
  commandInFlight,
  localError,
  pollError,
  onPickTimezone,
  onApply,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  pickedTimezone: string | null
  timezoneOptions: string[]
  formsDisabled: boolean
  disabledReason: string | null
  submitting: boolean
  commandInFlight: boolean
  localError: string | null
  pollError: string | null
  onPickTimezone: (value: string | null) => void
  onApply: () => void
}>) {
  const router = useRouter()
  const applyDisabled = formsDisabled || !pickedTimezone || Boolean(disabledReason)
  const datacenterId = server.datacenters[0]?.id

  return (
    <SectionPanel title="Timezone" hint="Effective timezone on this host">
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Effective: </Text>
        <MonoText>{server.timezone ?? 'Not set'}</MonoText>
      </Text>
      <Text style={orgPanelStyles.muted}>
        Source: {configuredSourceLabel(server.timezoneSource)}
      </Text>

      {disabledReason ? (
        <Text style={orgPanelStyles.muted}>{disabledReason}</Text>
      ) : null}
      {server.datacenterEnforceServerTimezone && datacenterId ? (
        <Pressable
          onPress={() =>
            router.push(datacenterHref(orgId, datacenterId))
          }
          style={webPointer}
          accessibilityRole="link"
        >
          <Text style={styles.linkText}>Open datacenter timezone settings</Text>
        </Pressable>
      ) : null}
      {!server.datacenterEnforceServerTimezone &&
      server.enforceServerTimezone ? (
        <Pressable
          onPress={() =>
            router.push(orgRouteHref(orgId, 'servers', 'settings') as `/${string}/servers/settings`)
          }
          style={webPointer}
          accessibilityRole="link"
        >
          <Text style={styles.linkText}>Open fleet timezone settings</Text>
        </Pressable>
      ) : null}

      {localError ? <Text style={orgPanelStyles.error}>{localError}</Text> : null}
      {pollError ? <Text style={orgPanelStyles.error}>{pollError}</Text> : null}

      <ServerTimezonePicker
        value={pickedTimezone}
        options={timezoneOptions}
        disabled={formsDisabled || Boolean(disabledReason)}
        placeholder="Select timezone…"
        onChange={onPickTimezone}
      />

      <Button
        label="Apply timezone"
        variant="primary"
        busy={submitting || commandInFlight}
        disabled={applyDisabled}
        onPress={onApply}
      />
      {commandInFlight ? (
        <Text style={orgPanelStyles.muted}>Waiting for command to finish…</Text>
      ) : null}
    </SectionPanel>
  )
}

function NtpSettingsPanel({
  ntpEnabled,
  ntpServersText,
  fallbackText,
  defaultsHint,
  formsDisabled,
  disabledReason,
  submitting,
  commandInFlight,
  localError,
  pollError,
  onToggleEnabled,
  onServersChange,
  onFallbackChange,
  onApply,
}: Readonly<{
  ntpEnabled: boolean
  ntpServersText: string
  fallbackText: string
  defaultsHint: string
  formsDisabled: boolean
  disabledReason: string | null
  submitting: boolean
  commandInFlight: boolean
  localError: string | null
  pollError: string | null
  onToggleEnabled: () => void
  onServersChange: (value: string) => void
  onFallbackChange: (value: string) => void
  onApply: () => void
}>) {
  return (
    <SectionPanel title="NTP configuration" hint="Pushed to the daemon via command">
      <Text style={orgPanelStyles.muted}>{defaultsHint}</Text>
      {disabledReason ? (
        <Text style={orgPanelStyles.muted}>{disabledReason}</Text>
      ) : null}
      {localError ? <Text style={orgPanelStyles.error}>{localError}</Text> : null}
      {pollError ? <Text style={orgPanelStyles.error}>{pollError}</Text> : null}

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>NTP client enabled</Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{
            checked: ntpEnabled,
            disabled: formsDisabled,
          }}
          disabled={formsDisabled}
          onPress={onToggleEnabled}
          style={[
            styles.toggle,
            ntpEnabled ? styles.toggleOn : styles.toggleOff,
            formsDisabled && styles.btnDisabled,
          ]}
        >
          <Text style={styles.toggleText}>{ntpEnabled ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>

      <TextField
        label="NTP servers"
        mono
        value={ntpServersText}
        onChangeText={onServersChange}
        editable={!formsDisabled}
        placeholder="pool.ntp.org, time.google.com"
      />

      <TextField
        label="Fallback servers"
        mono
        value={fallbackText}
        onChangeText={onFallbackChange}
        editable={!formsDisabled}
        placeholder="Optional fallback hosts"
      />

      <Button
        label="Apply NTP"
        variant="secondary"
        busy={submitting || commandInFlight}
        disabled={formsDisabled}
        onPress={onApply}
      />
      {commandInFlight ? (
        <Text style={orgPanelStyles.muted}>Waiting for command to finish…</Text>
      ) : null}
    </SectionPanel>
  )
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
  const timeSync = server.timeSync
  const timezonesQuery = useTimezones()
  const timezoneMutation = useSetServerTimezone(orgId, server.id)
  const ntpMutation = useSetServerNtp(orgId, server.id)

  const [pickedTimezone, setPickedTimezone] = useState<string | null>(
    server.timezone,
  )
  const [timezoneError, setTimezoneError] = useState<string | null>(null)
  const [timezoneSubmitting, setTimezoneSubmitting] = useState(false)

  const [ntpEnabled, setNtpEnabled] = useState(() => initialNtpEnabled(server))
  const [ntpServersText, setNtpServersText] = useState(() =>
    initialNtpHosts(timeSync?.ntpServers, server.ntpDefaults?.servers),
  )
  const [fallbackText, setFallbackText] = useState(() =>
    initialNtpHosts(
      timeSync?.fallbackNtpServers,
      server.ntpDefaults?.fallbackServers,
    ),
  )
  const [ntpError, setNtpError] = useState<string | null>(null)
  const [ntpSubmitting, setNtpSubmitting] = useState(false)

  const tzDisabledReason = useMemo(
    () =>
      timezoneDisabledReason(
        canManage,
        server.connected,
        Boolean(server.enforceServerTimezone),
        Boolean(server.datacenterEnforceServerTimezone),
      ),
    [
      canManage,
      server.connected,
      server.enforceServerTimezone,
      server.datacenterEnforceServerTimezone,
    ],
  )

  const timezoneFormsDisabled =
    timezoneCommandInFlight ||
    timezoneSubmitting ||
    ntpSubmitting ||
    Boolean(tzDisabledReason)

  const ntpReason = useMemo(
    () => ntpDisabledReason(canManage, server.connected),
    [canManage, server.connected],
  )

  const ntpDefaultsHint = server.ntpDefaultsSource
    ? `Desired default from ${configuredSourceLabel(server.ntpDefaultsSource).toLowerCase()}.`
    : 'No inherited NTP default.'

  const ntpFormsDisabled =
    ntpCommandInFlight ||
    ntpSubmitting ||
    timezoneSubmitting ||
    Boolean(ntpReason)

  const applyTimezone = () => {
    if (!pickedTimezone || timezoneFormsDisabled) return
    setTimezoneError(null)
    setTimezoneSubmitting(true)
    timezoneMutation.mutate(pickedTimezone, {
      onSuccess: (result) => {
        onEnqueueCommand(result, 'timezone')
      },
      onError: (err) => {
        setTimezoneError(
          err instanceof Error ? err.message : 'Failed to apply timezone',
        )
      },
      onSettled: () => {
        setTimezoneSubmitting(false)
      },
    })
  }

  const applyNtp = () => {
    if (ntpFormsDisabled) return
    const payload = buildNtpPayload(
      ntpEnabled,
      ntpServersText,
      fallbackText,
      timeSync,
    )
    if (!payload) {
      setNtpError('Change at least one NTP setting before applying.')
      return
    }
    setNtpError(null)
    setNtpSubmitting(true)
    ntpMutation.mutate(payload, {
      onSuccess: (result) => {
        onEnqueueCommand(result, 'ntp')
      },
      onError: (err) => {
        setNtpError(
          err instanceof Error ? err.message : 'Failed to apply NTP settings',
        )
      },
      onSettled: () => {
        setNtpSubmitting(false)
      },
    })
  }

  return (
    <View style={styles.root}>
      <TimeSyncStatusPanel timeSync={timeSync} />
      <TimezoneSettingsPanel
        orgId={orgId}
        server={server}
        pickedTimezone={pickedTimezone}
        timezoneOptions={timezonesQuery.data?.timezones ?? []}
        formsDisabled={timezoneFormsDisabled}
        disabledReason={tzDisabledReason}
        submitting={timezoneSubmitting}
        commandInFlight={timezoneCommandInFlight}
        localError={timezoneError}
        pollError={timezonePollError}
        onPickTimezone={setPickedTimezone}
        onApply={() => applyTimezone()}
      />
      <NtpSettingsPanel
        ntpEnabled={ntpEnabled}
        ntpServersText={ntpServersText}
        fallbackText={fallbackText}
        defaultsHint={ntpDefaultsHint}
        formsDisabled={ntpFormsDisabled}
        disabledReason={ntpReason}
        submitting={ntpSubmitting}
        commandInFlight={ntpCommandInFlight}
        localError={ntpError}
        pollError={ntpPollError}
        onToggleEnabled={() => setNtpEnabled((on) => !on)}
        onServersChange={setNtpServersText}
        onFallbackChange={setFallbackText}
        onApply={() => applyNtp()}
      />
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
  linkText: {
    color: chrome.accent,
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
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
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
  btnDisabled: {
    opacity: 0.5,
  },
})
