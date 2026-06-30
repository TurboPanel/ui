import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  type CommandRecord,
  type CommandStatus,
  type OrgServerRecord,
  type PingLatencyBreakdown,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

export const COMMAND_POLL_MS = 2_000

const TERMINAL_COMMAND_STATUSES: ReadonlySet<CommandStatus> = new Set([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
])

export function isTerminalCommandStatus(status: CommandStatus): boolean {
  return TERMINAL_COMMAND_STATUSES.has(status)
}

function formatLatencyMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'n/a'
  return `${Math.round(value)} ms`
}

const LATENCY_ROWS: Array<{
  key: keyof PingLatencyBreakdown
  label: string
}> = [
  { key: 'apiToConsumerMs', label: 'API → consumer' },
  { key: 'consumerToCellMs', label: 'Outbox wait' },
  { key: 'cellToDaemonMs', label: 'Cell → daemon' },
  { key: 'daemonProcessingMs', label: 'Daemon processing' },
  { key: 'daemonToRecordedMs', label: 'Daemon → recorded' },
  { key: 'totalRoundTripMs', label: 'Total' },
]

export type ActiveCommand = {
  commandId: string
  kind: 'ping' | 'hostname'
}

export type ServerCommandState = {
  pingRunning: boolean
  hostnameRunning: boolean
  activeCommand: ActiveCommand | null
  commandRecord: CommandRecord | null
  pingError: string | null
  hostnameError: string | null
}

export const defaultServerCommandState = (): ServerCommandState => ({
  pingRunning: false,
  hostnameRunning: false,
  activeCommand: null,
  commandRecord: null,
  pingError: null,
  hostnameError: null,
})

type ServerCommandsPanelProps = {
  server: OrgServerRecord
  canManage: boolean
  commandState: ServerCommandState
  onPing: () => void
  onSetHostname: (hostname: string) => void
}

export function ServerCommandsPanel({
  server,
  canManage,
  commandState,
  onPing,
  onSetHostname,
}: ServerCommandsPanelProps) {
  const [hostnameInput, setHostnameInput] = useState(server.hostname ?? '')

  const {
    pingRunning,
    hostnameRunning,
    activeCommand,
    commandRecord,
    pingError,
    hostnameError,
  } = commandState

  useEffect(() => {
    setHostnameInput(server.hostname ?? '')
  }, [server.hostname])

  const commandInFlight = activeCommand !== null
  const showPingLatency =
    commandRecord?.type === 'daemon.ping' &&
    commandRecord.status === 'succeeded' &&
    commandRecord.latency !== undefined

  return (
    <View style={styles.root}>
      <Text style={styles.sectionHeading}>Commands</Text>

      <View style={styles.commandRow}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            (!server.connected || pingRunning || commandInFlight) &&
              styles.actionButtonDisabled,
          ]}
          onPress={onPing}
          disabled={!server.connected || pingRunning || commandInFlight}
        >
          {pingRunning ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : null}
          <Text style={styles.actionButtonText}>
            {pingRunning ? 'Pinging…' : !server.connected ? 'Offline' : 'Ping daemon'}
          </Text>
        </TouchableOpacity>
      </View>

      {pingRunning && commandRecord && !isTerminalCommandStatus(commandRecord.status) ? (
        <View style={styles.cellRow}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={orgPanelStyles.muted}>
            Waiting for daemon ({commandRecord.status})…
          </Text>
        </View>
      ) : null}

      {showPingLatency && commandRecord.latency ? (
        <View style={styles.latencyBlock}>
          {LATENCY_ROWS.map(({ key, label }) => (
            <Text key={key} style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>{label}: </Text>
              {formatLatencyMs(commandRecord.latency?.[key])}
            </Text>
          ))}
        </View>
      ) : null}

      {pingError ? <Text style={styles.errorText}>{pingError}</Text> : null}

      {canManage ? (
        <View style={styles.hostnameBlock}>
          <Text style={styles.label}>Change hostname</Text>
          <TextInput
            value={hostnameInput}
            onChangeText={(text) => {
              setHostnameInput(text)
            }}
            placeholder="hostname.example"
            autoCapitalize="none"
            autoCorrect={false}
            editable={server.connected && !hostnameRunning && !commandInFlight}
            style={[
              styles.input,
              (!server.connected || hostnameRunning || commandInFlight) &&
                styles.inputDisabled,
            ]}
          />
          <TouchableOpacity
            style={[
              styles.actionButton,
              (!server.connected ||
                hostnameRunning ||
                commandInFlight ||
                !hostnameInput.trim()) &&
                styles.actionButtonDisabled,
            ]}
            onPress={() => onSetHostname(hostnameInput.trim())}
            disabled={
              !server.connected ||
              hostnameRunning ||
              commandInFlight ||
              !hostnameInput.trim()
            }
          >
            {hostnameRunning ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : null}
            <Text style={styles.actionButtonText}>
              {hostnameRunning
                ? 'Applying…'
                : !server.connected
                  ? 'Offline'
                  : 'Apply hostname'}
            </Text>
          </TouchableOpacity>
          {hostnameRunning &&
          commandRecord &&
          !isTerminalCommandStatus(commandRecord.status) ? (
            <View style={styles.cellRow}>
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Text style={orgPanelStyles.muted}>
                Applying hostname ({commandRecord.status})…
              </Text>
            </View>
          ) : null}
          {hostnameError ? (
            <Text style={styles.errorText}>{hostnameError}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  sectionHeading: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  commandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgActive,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  cellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  latencyBlock: {
    gap: 2,
    marginTop: spacing.xs,
  },
  errorText: {
    color: colors.errorText,
    fontSize: 12,
  },
  hostnameBlock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
  },
  inputDisabled: {
    opacity: 0.5,
  },
})
