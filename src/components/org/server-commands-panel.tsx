import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  ConfirmButton,
  LoadingState,
  TextField,
} from '@/components/ui'
import {
  type CommandRecord,
  type PingLatencyBreakdown,
  type OrgServerRecord,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'
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
  return <LoadingState label={message} />
}

function PingLatencyBlock({
  latency,
}: Readonly<{ latency: PingLatencyBreakdown }>) {
  return (
    <View style={panelStyles.detailCard}>
      <Text style={panelStyles.detailTitle}>Latency breakdown</Text>
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
  onConfirm,
}: Readonly<{
  connected: boolean
  commandInFlight: boolean
  rebootRunning: boolean
  onConfirm: () => void
}>) {
  if (rebootRunning) {
    return (
      <Button
        label="Rebooting…"
        variant="danger"
        busy
        disabled
        onPress={() => {}}
      />
    )
  }

  return (
    <ConfirmButton
      label="Reboot server"
      confirmLabel="Confirm"
      prompt="Confirm reboot?"
      size="md"
      disabled={!connected || commandInFlight}
      onConfirm={onConfirm}
    />
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
      <TextField
        label="Change hostname"
        value={hostnameInput}
        onChangeText={onHostnameInputChange}
        placeholder="hostname.example"
        autoCapitalize="none"
        autoCorrect={false}
        editable={connected && !hostnameRunning && !commandInFlight}
        error={hostnameError}
      />
      <Button
        label={actionButtonLabel(
          hostnameRunning,
          connected,
          'Applying…',
          'Apply hostname',
        )}
        variant="primary"
        busy={hostnameRunning}
        disabled={disabled}
        onPress={() => onSetHostname(trimmedHostname)}
      />
      {showProgress ? (
        <CommandProgressRow
          message={`Applying hostname (${commandRecord.status})…`}
        />
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
      <Text style={panelStyles.detailTitle}>Commands</Text>

      <ButtonRow>
        <Button
          label={actionButtonLabel(
            pingRunning,
            server.connected,
            'Pinging…',
            'Ping daemon',
          )}
          variant="primary"
          busy={pingRunning}
          disabled={pingDisabled}
          onPress={onPing}
        />

        {canManage && showReboot ? (
          <RebootControls
            connected={server.connected}
            commandInFlight={commandInFlight}
            rebootRunning={rebootRunning}
            onConfirm={onReboot}
          />
        ) : null}
      </ButtonRow>

      {showRebootProgress ? (
        <CommandProgressRow
          message={`Rebooting… (${commandRecord.status})`}
        />
      ) : null}

      {showReboot && rebootError ? (
        <Text style={panelStyles.error}>{rebootError}</Text>
      ) : null}

      {showPingProgress ? (
        <CommandProgressRow
          message={`Waiting for daemon (${commandRecord.status})…`}
        />
      ) : null}

      {showPingLatency && commandRecord.latency ? (
        <PingLatencyBlock latency={commandRecord.latency} />
      ) : null}

      {pingError ? <Text style={panelStyles.error}>{pingError}</Text> : null}

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
  hostnameBlock: {
    marginTop: spacing.xs,
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderArea,
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
