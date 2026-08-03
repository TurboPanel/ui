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
  type PingLatencyBreakdown,
  type OrgServerRecord,
} from '@/lib/instance-api'
import { chrome, colors, spacing } from '@/lib/theme'
import { isTerminalCommandStatus } from '@/lib/queries/commands'

export { COMMAND_POLL_MS, isTerminalCommandStatus } from '@/lib/queries/commands'

function formatLatencyMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'n/a'
  return `${Math.round(value)} ms`
}

function actionButtonLabel(
  running: boolean,
  connected: boolean,
  runningLabel: string,
  idleLabel: string,
): string {
  if (running) return runningLabel
  if (!connected) return 'Offline'
  return idleLabel
}

const LATENCY_ROWS: {
  key: keyof PingLatencyBreakdown
  label: string
}[] = [
  { key: 'apiToConsumerMs', label: 'API → consumer' },
  { key: 'consumerToCellMs', label: 'Outbox wait' },
  { key: 'cellToDaemonMs', label: 'Cell → daemon' },
  { key: 'daemonProcessingMs', label: 'Daemon processing' },
  { key: 'daemonToRecordedMs', label: 'Daemon → recorded' },
  { key: 'totalRoundTripMs', label: 'Total' },
]

export type ActiveCommand = {
  commandId: string
  kind: 'ping' | 'hostname' | 'reboot'
}

export type ServerCommandState = {
  pingRunning: boolean
  hostnameRunning: boolean
  rebootRunning: boolean
  activeCommand: ActiveCommand | null
  commandRecord: CommandRecord | null
  pingError: string | null
  hostnameError: string | null
  rebootError: string | null
}

export const defaultServerCommandState = (): ServerCommandState => ({
  pingRunning: false,
  hostnameRunning: false,
  rebootRunning: false,
  activeCommand: null,
  commandRecord: null,
  pingError: null,
  hostnameError: null,
  rebootError: null,
})

type ServerCommandsPanelProps = Readonly<{
  server: OrgServerRecord
  canManage: boolean
  showReboot?: boolean
  commandState: ServerCommandState
  onPing: () => void
  onSetHostname: (hostname: string) => void
  onReboot: () => void
}>

function CommandProgressRow({
  message,
}: Readonly<{ message: string }>) {
  return (
    <View style={styles.cellRow}>
      <ActivityIndicator size="small" color={colors.textMuted} />
      <Text style={orgPanelStyles.muted}>{message}</Text>
    </View>
  )
}

function PingLatencyBlock({
  latency,
}: Readonly<{ latency: PingLatencyBreakdown }>) {
  return (
    <View style={orgPanelStyles.detailCard}>
      <Text style={orgPanelStyles.detailTitle}>Latency breakdown</Text>
      <View style={styles.latencyGrid}>
        {LATENCY_ROWS.map(({ key, label }) => (
          <View key={key} style={styles.latencyRow}>
            <Text style={styles.latencyLabel}>{label}</Text>
            <Text style={styles.latencyValue}>
              {formatLatencyMs(latency[key])}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function RebootControls({
  connected,
  commandInFlight,
  rebootRunning,
  confirmingReboot,
  onRequestConfirm,
  onConfirm,
  onCancel,
}: Readonly<{
  connected: boolean
  commandInFlight: boolean
  rebootRunning: boolean
  confirmingReboot: boolean
  onRequestConfirm: () => void
  onConfirm: () => void
  onCancel: () => void
}>) {
  if (rebootRunning) {
    return (
      <TouchableOpacity
        style={[styles.actionButton, styles.actionButtonDisabled]}
        disabled
      >
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.actionButtonText}>Rebooting…</Text>
      </TouchableOpacity>
    )
  }

  if (confirmingReboot) {
    return (
      <View style={styles.confirmRow}>
        <Text style={orgPanelStyles.muted}>Confirm reboot?</Text>
        <TouchableOpacity style={styles.actionButton} onPress={onConfirm}>
          <Text style={styles.actionButtonText}>Confirm</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mutedButton} onPress={onCancel}>
          <Text style={styles.mutedButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        styles.actionButtonDanger,
        (!connected || commandInFlight) && styles.actionButtonDisabled,
      ]}
      onPress={onRequestConfirm}
      disabled={!connected || commandInFlight}
    >
      <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>
        Reboot server
      </Text>
    </TouchableOpacity>
  )
}

function HostnameBlock({
  connected,
  commandInFlight,
  hostnameRunning,
  commandRecord,
  hostnameError,
  hostnameInput,
  onHostnameInputChange,
  onSetHostname,
}: Readonly<{
  connected: boolean
  commandInFlight: boolean
  hostnameRunning: boolean
  commandRecord: CommandRecord | null
  hostnameError: string | null
  hostnameInput: string
  onHostnameInputChange: (text: string) => void
  onSetHostname: (hostname: string) => void
}>) {
  const trimmedHostname = hostnameInput.trim()
  const disabled =
    !connected || hostnameRunning || commandInFlight || !trimmedHostname
  const showProgress =
    hostnameRunning &&
    commandRecord !== null &&
    !isTerminalCommandStatus(commandRecord.status)

  return (
    <View style={styles.hostnameBlock}>
      <Text style={styles.label}>Change hostname</Text>
      <TextInput
        value={hostnameInput}
        onChangeText={onHostnameInputChange}
        placeholder="hostname.example"
        autoCapitalize="none"
        autoCorrect={false}
        editable={connected && !hostnameRunning && !commandInFlight}
        style={[
          styles.input,
          (!connected || hostnameRunning || commandInFlight) &&
            styles.inputDisabled,
        ]}
      />
      <TouchableOpacity
        style={[styles.actionButton, disabled && styles.actionButtonDisabled]}
        onPress={() => onSetHostname(trimmedHostname)}
        disabled={disabled}
      >
        {hostnameRunning ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : null}
        <Text style={styles.actionButtonText}>
          {actionButtonLabel(
            hostnameRunning,
            connected,
            'Applying…',
            'Apply hostname',
          )}
        </Text>
      </TouchableOpacity>
      {showProgress ? (
        <CommandProgressRow
          message={`Applying hostname (${commandRecord.status})…`}
        />
      ) : null}
      {hostnameError ? (
        <Text style={styles.errorText}>{hostnameError}</Text>
      ) : null}
    </View>
  )
}

export function ServerCommandsPanel({
  server,
  canManage,
  showReboot = true,
  commandState,
  onPing,
  onSetHostname,
  onReboot,
}: ServerCommandsPanelProps) {
  const [hostnameInput, setHostnameInput] = useState(server.hostname ?? '')
  const [confirmingReboot, setConfirmingReboot] = useState(false)

  const {
    pingRunning,
    hostnameRunning,
    rebootRunning,
    activeCommand,
    commandRecord,
    pingError,
    hostnameError,
    rebootError,
  } = commandState

  useEffect(() => {
    setHostnameInput(server.hostname ?? '')
  }, [server.hostname])

  useEffect(() => {
    if (rebootRunning) {
      setConfirmingReboot(false)
    }
  }, [rebootRunning])

  const commandInFlight = activeCommand !== null
  const showPingLatency =
    commandRecord?.type === 'daemon.ping' &&
    commandRecord.status === 'succeeded' &&
    commandRecord.latency !== undefined
  const showPingProgress =
    pingRunning &&
    commandRecord !== null &&
    !isTerminalCommandStatus(commandRecord.status)
  const showRebootProgress =
    showReboot &&
    rebootRunning &&
    commandRecord !== null &&
    !isTerminalCommandStatus(commandRecord.status)
  const pingDisabled = !server.connected || pingRunning || commandInFlight

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.detailTitle}>Commands</Text>

      <View style={styles.actionBar}>
        <View style={styles.commandRow}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            pingDisabled && styles.actionButtonDisabled,
          ]}
          onPress={onPing}
          disabled={pingDisabled}
        >
          {pingRunning ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : null}
          <Text style={styles.actionButtonText}>
            {actionButtonLabel(
              pingRunning,
              server.connected,
              'Pinging…',
              'Ping daemon',
            )}
          </Text>
        </TouchableOpacity>

        {canManage && showReboot ? (
          <RebootControls
            connected={server.connected}
            commandInFlight={commandInFlight}
            rebootRunning={rebootRunning}
            confirmingReboot={confirmingReboot}
            onRequestConfirm={() => setConfirmingReboot(true)}
            onConfirm={() => {
              setConfirmingReboot(false)
              onReboot()
            }}
            onCancel={() => setConfirmingReboot(false)}
          />
        ) : null}
        </View>
      </View>

      {showRebootProgress ? (
        <CommandProgressRow
          message={`Rebooting… (${commandRecord.status})`}
        />
      ) : null}

      {showReboot && rebootError ? (
        <Text style={styles.errorText}>{rebootError}</Text>
      ) : null}

      {showPingProgress ? (
        <CommandProgressRow
          message={`Waiting for daemon (${commandRecord.status})…`}
        />
      ) : null}

      {showPingLatency && commandRecord.latency ? (
        <PingLatencyBlock latency={commandRecord.latency} />
      ) : null}

      {pingError ? <Text style={styles.errorText}>{pingError}</Text> : null}

      {canManage ? (
        <HostnameBlock
          connected={server.connected}
          commandInFlight={commandInFlight}
          hostnameRunning={hostnameRunning}
          commandRecord={commandRecord}
          hostnameError={hostnameError}
          hostnameInput={hostnameInput}
          onHostnameInputChange={setHostnameInput}
          onSetHostname={onSetHostname}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  actionBar: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
    padding: spacing.sm,
    gap: spacing.sm,
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
    borderColor: chrome.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: chrome.bgActive,
  },
  actionButtonDanger: {
    borderColor: colors.error,
    backgroundColor: colors.bgSecondary,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonTextDanger: {
    color: colors.error,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  mutedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  mutedButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  cellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  errorText: {
    color: colors.errorText,
    fontSize: 12,
  },
  hostnameBlock: {
    marginTop: spacing.xs,
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderArea,
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
  latencyGrid: {
    gap: spacing.xs,
  },
  latencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
  },
  latencyLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  latencyValue: {
    color: colors.stdout,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
})
