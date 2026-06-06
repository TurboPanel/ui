import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import {
  broadcastToDaemon,
  fetchAllDaemonAddresses,
  fetchCommandResults,
  fetchDaemonAddresses,
  fetchDaemonConnections,
  fetchDaemonEvents,
  fetchHealth,
  fetchInstanceAddresses,
  daemonLabel,
  uniqueFleetConnections,
  formatEvent,
  runCommand,
  runCommandOnAll,
  type CommandResult,
  type DaemonConnection,
  type DaemonEvent,
  type ServerAddressEntry,
} from '@/lib/instance-api'

const POLL_MS = 2_000
const ALL_TARGET = '__all__'
const DESKTOP_BREAKPOINT = 768
const MOBILE_PANEL_MAX_WIDTH = 520
const DESKTOP_PANEL_MAX_WIDTH = 1400
const DESKTOP_PANEL_GUTTER = 64

type DiagnosticTab = 'network' | 'shell' | 'connectivity'

const DIAGNOSTIC_TABS: { id: DiagnosticTab; label: string; hint: string }[] = [
  { id: 'network', label: 'Network', hint: 'Interface addresses on physical NICs' },
  { id: 'shell', label: 'Shell', hint: 'Run commands on selected servers' },
  { id: 'connectivity', label: 'Connectivity', hint: 'WebSocket echo and traffic log' },
]

export function DaemonTestPanel() {
  const { width } = useWindowDimensions()
  const panelMaxWidth = width >= DESKTOP_BREAKPOINT
    ? Math.min(DESKTOP_PANEL_MAX_WIDTH, width - DESKTOP_PANEL_GUTTER)
    : MOBILE_PANEL_MAX_WIDTH
  const [healthOk, setHealthOk] = useState<boolean | null>(null)
  const [connections, setConnections] = useState<DaemonConnection[]>([])
  const [events, setEvents] = useState<DaemonEvent[]>([])
  const [commands, setCommands] = useState<CommandResult[]>([])
  const [target, setTarget] = useState<string>(ALL_TARGET)
  const [activeTab, setActiveTab] = useState<DiagnosticTab>('network')
  const [command, setCommand] = useState('uname -a')
  const [echo, setEcho] = useState('Hello from UI')
  const [running, setRunning] = useState(false)
  const [sending, setSending] = useState(false)
  const [fetchingAddresses, setFetchingAddresses] = useState(false)
  const [addressResults, setAddressResults] = useState<ServerAddressEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [health, conn, ev, cmd] = await Promise.all([
        fetchHealth(),
        fetchDaemonConnections(),
        fetchDaemonEvents(),
        fetchCommandResults(),
      ])
      setHealthOk(health.ok)
      setConnections(conn.connections)
      setEvents(ev.events)
      setCommands(cmd.commands)
      setError(null)
    } catch (err) {
      setHealthOk(false)
      setError(err instanceof Error ? err.message : 'Failed to reach instance')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const fleet = useMemo(() => uniqueFleetConnections(connections), [connections])

  const targetExists = useMemo(
    () => target === ALL_TARGET || fleet.some((c) => c.id === target),
    [target, fleet],
  )

  useEffect(() => {
    if (!targetExists) setTarget(ALL_TARGET)
  }, [targetExists])

  const onRunCommand = async () => {
    const trimmed = command.trim()
    if (!trimmed) return
    setRunning(true)
    try {
      if (target === ALL_TARGET) {
        await runCommandOnAll(trimmed)
      } else {
        await runCommand(target, trimmed)
      }
      await refresh()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed')
    } finally {
      setRunning(false)
    }
  }

  const onBroadcast = async () => {
    setSending(true)
    try {
      await broadcastToDaemon({ text: echo, from: 'ui' })
      await refresh()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Broadcast failed')
    } finally {
      setSending(false)
    }
  }

  const onFetchAddresses = async () => {
    setFetchingAddresses(true)
    try {
      const results: ServerAddressEntry[] = []

      if (target === ALL_TARGET) {
        const [instance, daemons] = await Promise.all([
          fetchInstanceAddresses(),
          fetchAllDaemonAddresses(),
        ])
        results.push({
          source: instance.source,
          addresses: instance.addresses,
        })
        for (const server of daemons.servers) {
          results.push({
            source: server.hostname?.trim() ||
              daemonLabel(server.daemonId, connections),
            addresses: server.addresses,
            error: server.error,
          })
        }
      } else {
        const response = await fetchDaemonAddresses(target)
        results.push({
          source: response.hostname?.trim() ||
            daemonLabel(target, connections),
          addresses: response.addresses,
        })
      }

      setAddressResults(results)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch addresses')
    } finally {
      setFetchingAddresses(false)
    }
  }

  const targetLabel = target === ALL_TARGET
    ? 'all servers'
    : daemonLabel(target, connections)
  const canRun = !running && healthOk === true && fleet.length > 0
  const canFetchAddresses = !fetchingAddresses && healthOk === true &&
    (target === ALL_TARGET || fleet.some((c) => c.id === target))
  const activeTabMeta = DIAGNOSTIC_TABS.find((tab) => tab.id === activeTab)!
  const staleCount = connections.length - fleet.length

  return (
    <View style={[styles.panel, { maxWidth: panelMaxWidth }]}>
      <Text style={styles.panelTitle}>Admin control panel</Text>
      <Text style={styles.panelHint}>Temporary dev-only console · no auth</Text>

      <DiagnosticArea title="Fleet" hint="Instance health and target selection for diagnostics below">
        <View style={styles.row}>
          <View style={[styles.dot, healthOk ? styles.dotOk : styles.dotBad]} />
          <Text style={styles.rowText}>
            API {healthOk === null ? 'checking…' : healthOk ? 'healthy' : 'unreachable'}
          </Text>
          <Text style={styles.fleetCount}>
            {fleet.length} server{fleet.length === 1 ? '' : 's'}
            {staleCount > 0 ? ` (${staleCount} stale sockets clearing…)` : ''}
          </Text>
        </View>

        <Text style={styles.inlineLabel}>Target</Text>
        <View style={styles.targets}>
          <TargetChip
            label="All"
            active={target === ALL_TARGET}
            onPress={() => setTarget(ALL_TARGET)}
          />
          {fleet.map((conn) => (
            <TargetChip
              key={conn.id}
              label={daemonLabel(conn.id, connections)}
              active={target === conn.id}
              onPress={() => setTarget(conn.id)}
            />
          ))}
        </View>
        {fleet.length === 0 ? (
          <Text style={styles.muted}>No daemon connected yet</Text>
        ) : (
          <Text style={styles.muted}>Diagnostics run against: {targetLabel}</Text>
        )}
      </DiagnosticArea>

      <Text style={styles.diagnosticsHeading}>Diagnostics</Text>
      <View style={styles.tabBar}>
        {DIAGNOSTIC_TABS.map((tab) => (
          <Pressable
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'network' ? (
        <DiagnosticArea title="Network" hint={activeTabMeta.hint}>
          <Pressable
            style={[styles.buttonSecondary, !canFetchAddresses && styles.buttonDisabled]}
            onPress={() => void onFetchAddresses()}
            disabled={!canFetchAddresses}
          >
            {fetchingAddresses ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonSecondaryText}>Get IP addresses</Text>
            )}
          </Pressable>
          {addressResults ? (
            <View style={styles.addressResults}>
              {addressResults.map((entry) => (
                <AddressCard key={entry.source} entry={entry} />
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>Reads IPs assigned to physical interfaces only</Text>
          )}
        </DiagnosticArea>
      ) : null}

      {activeTab === 'shell' ? (
        <DiagnosticArea title="Shell" hint={activeTabMeta.hint}>
          <TextInput
            value={command}
            onChangeText={setCommand}
            style={styles.input}
            placeholderTextColor="#666"
            placeholder="Shell command, e.g. ls -la"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => void onRunCommand()}
          />
          <Pressable
            style={[styles.button, !canRun && styles.buttonDisabled]}
            onPress={() => void onRunCommand()}
            disabled={!canRun}
          >
            {running ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>Run on {targetLabel}</Text>
            )}
          </Pressable>

          <Text style={styles.inlineLabel}>Results</Text>
          <ScrollView style={styles.results} nestedScrollEnabled>
            {commands.length === 0 ? (
              <Text style={styles.muted}>No commands run yet</Text>
            ) : (
              [...commands].reverse().map((result) => (
                <CommandRow key={result.id} result={result} connections={connections} />
              ))
            )}
          </ScrollView>
        </DiagnosticArea>
      ) : null}

      {activeTab === 'connectivity' ? (
        <DiagnosticArea title="Connectivity" hint={activeTabMeta.hint}>
          <Text style={styles.inlineLabel}>Broadcast echo</Text>
          <TextInput
            value={echo}
            onChangeText={setEcho}
            style={styles.input}
            placeholderTextColor="#666"
            placeholder="Message to broadcast"
          />
          <Pressable
            style={[styles.buttonSecondary, sending && styles.buttonDisabled]}
            onPress={() => void onBroadcast()}
            disabled={sending || !healthOk}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonSecondaryText}>Broadcast to all daemons</Text>
            )}
          </Pressable>

          <Text style={styles.inlineLabel}>Activity</Text>
          <ScrollView style={styles.log} nestedScrollEnabled>
            {events.length === 0 ? (
              <Text style={styles.muted}>Waiting for websocket traffic…</Text>
            ) : (
              [...events].reverse().map((event, index) => (
                <Text key={`${event.at}-${index}`} style={styles.logLine}>
                  {formatEvent(event, connections)}
                </Text>
              ))
            )}
          </ScrollView>
        </DiagnosticArea>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

function DiagnosticArea({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <View style={styles.area}>
      <View style={styles.areaHeader}>
        <Text style={styles.areaTitle}>{title}</Text>
        {hint ? <Text style={styles.areaHint}>{hint}</Text> : null}
      </View>
      <View style={styles.areaBody}>{children}</View>
    </View>
  )
}

function TargetChip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

function AddressCard({ entry }: { entry: ServerAddressEntry }) {
  if (entry.error) {
    return (
      <View style={styles.addressCard}>
        <Text style={styles.addressSource}>{entry.source}</Text>
        <Text style={styles.resultErr}>{entry.error}</Text>
      </View>
    )
  }

  if (!entry.addresses) return null

  return (
    <View style={styles.addressCard}>
      <Text style={styles.addressSource}>{entry.source}</Text>
      <AddressLine label="Private IPv4" values={entry.addresses.privateIpv4} />
      <AddressLine label="Private IPv6" values={entry.addresses.privateIpv6} />
      <AddressLine label="Public IPv4" values={entry.addresses.publicIpv4} />
      <AddressLine label="Public IPv6" values={entry.addresses.publicIpv6} />
    </View>
  )
}

function AddressLine({ label, values }: { label: string; values: string[] }) {
  return (
    <Text style={styles.addressLine}>
      <Text style={styles.addressLabel}>{label}: </Text>
      {values.length > 0 ? values.join(', ') : '—'}
    </Text>
  )
}

function CommandRow({
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
  panel: {
    width: '100%',
    marginTop: 32,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#0a0a0a',
  },
  panelTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  panelHint: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  diagnosticsHeading: {
    color: '#666',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#111',
    alignItems: 'center',
  },
  tabActive: {
    borderColor: '#3dd68c',
    backgroundColor: '#10241a',
  },
  tabText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#3dd68c',
  },
  area: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    backgroundColor: '#080808',
    overflow: 'hidden',
  },
  areaHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    backgroundColor: '#0d0d0d',
  },
  areaTitle: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '600',
  },
  areaHint: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  areaBody: {
    padding: 14,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotOk: {
    backgroundColor: '#3dd68c',
  },
  dotBad: {
    backgroundColor: '#ff6b6b',
  },
  rowText: {
    color: '#ccc',
    fontSize: 14,
    flex: 1,
  },
  fleetCount: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  inlineLabel: {
    color: '#777',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  muted: {
    color: '#555',
    fontSize: 13,
  },
  targets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#111',
  },
  chipActive: {
    borderColor: '#3dd68c',
    backgroundColor: '#10241a',
  },
  chipText: {
    color: '#bbb',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  chipTextActive: {
    color: '#3dd68c',
  },
  input: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: '#111',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  button: {
    marginTop: 2,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonSecondary: {
    marginTop: 2,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
  results: {
    maxHeight: 280,
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
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
    backgroundColor: '#3dd68c',
  },
  statusFail: {
    backgroundColor: '#ff6b6b',
  },
  statusPending: {
    backgroundColor: '#e0b341',
  },
  resultMeta: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  resultCommand: {
    color: '#9ad2ff',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  resultOut: {
    color: '#cfd3d6',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  resultErr: {
    color: '#ff9a9a',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  log: {
    maxHeight: 280,
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  logLine: {
    color: '#9aa0a6',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
    marginTop: 10,
  },
  addressResults: {
    marginTop: 4,
    gap: 8,
  },
  addressCard: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  addressSource: {
    color: '#3dd68c',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  addressLine: {
    color: '#cfd3d6',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  addressLabel: {
    color: '#888',
  },
})
