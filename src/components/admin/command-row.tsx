import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/lib/admin-theme'
import { daemonLabel, type CommandResult, type DaemonConnection } from '@/lib/instance-api'

export function CommandRow({
  result,
  connections,
}: {
  result: CommandResult
  connections: DaemonConnection[]
}) {
  const pending = result.status === 'pending'
  const failed = !pending && result.exitCode !== 0
  return (
    <View style={styles.resultRow}>
      <View style={styles.resultHeader}>
        <View
          style={[
            styles.statusDot,
            pending ? styles.statusPending : failed ? styles.statusFail : styles.statusOk,
          ]}
        />
        <Text style={styles.resultMeta}>
          {daemonLabel(result.daemonId, connections)}
          {pending ? ' · running…' : ` · exit ${result.exitCode}`}
        </Text>
      </View>
      <Text style={styles.resultCommand}>$ {result.command}</Text>
      {result.stdout ? <Text style={styles.resultOut}>{result.stdout.trimEnd()}</Text> : null}
      {result.stderr ? <Text style={styles.resultErr}>{result.stderr.trimEnd()}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  resultRow: {
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#161616',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 8,
  },
  statusOk: {
    backgroundColor: colors.accent,
  },
  statusFail: {
    backgroundColor: colors.error,
  },
  statusPending: {
    backgroundColor: colors.pending,
  },
  resultMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  resultCommand: {
    color: colors.command,
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  resultOut: {
    color: colors.stdout,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  resultErr: {
    color: colors.errorSoft,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
})
