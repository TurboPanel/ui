import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  ContainerRoleBadge,
  ContainerStatusBadge,
} from '@/components/org/managed/container-status-badge'
import { LogTranscriptView } from '@/components/org/logs/log-transcript-view'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { Button, EmptyState, SegmentedControl } from '@/components/ui'
import type { ContainerRecord } from '@/lib/instance-api'
import {
  managedStatusLabel,
  type ManagedStatus,
} from '@/lib/managed-services'
import { plainTextTranscriptLines } from '@/lib/execution-log-lines'
import { useCommandLog } from '@/lib/queries/execution-logs'
import { useManagedLogs } from '@/lib/queries/managed'
import { colors, spacing } from '@/lib/theme'

const TAIL_OPTIONS = [200, 500, 1000] as const

function statusPillStyle(status: ManagedStatus): {
  borderColor: string
  backgroundColor: string
  color: string
} {
  switch (status) {
    case 'ready':
      return {
        borderColor: colors.accent,
        backgroundColor: colors.bgActive,
        color: colors.accent,
      }
    case 'failed':
      return {
        borderColor: colors.error,
        backgroundColor: colors.bgSecondary,
        color: colors.error,
      }
    case 'stopped':
      return {
        borderColor: colors.borderChip,
        backgroundColor: colors.bgSecondary,
        color: colors.textMuted,
      }
    case 'provisioning':
    case 'applying':
      return {
        borderColor: colors.pending,
        backgroundColor: colors.bgSecondary,
        color: colors.pending,
      }
  }
}

function containerDisplayName(container: ContainerRecord): string {
  if (container.role === 'ingress') {
    return container.containerName || container.id
  }
  return container.containerName || container.composeServiceName || container.id
}

/**
 * Engine (service) first, then tenant Traefik ingress rows. The ingress
 * partition is unreachable here: ProxySQL lives on the `managed-ingress`
 * system service, so `fetchManagedStatus` never returns it.
 */
function partitionContainersForDisplay(
  containers: ContainerRecord[],
): ContainerRecord[] {
  const serviceRows = containers.filter((row) => row.role !== 'ingress')
  const ingressRows = containers.filter((row) => row.role === 'ingress')
  return [...serviceRows, ...ingressRows]
}

export function ManagedStatusPanel({
  orgId,
  environmentId,
  status,
  host,
  port,
  containers,
  version,
  lastError,
  applyCommand,
}: Readonly<{
  orgId: string
  environmentId: string
  status: ManagedStatus
  host: string | null
  port: number | null
  containers: ContainerRecord[]
  /** `PostgreSQL 18 · Alpine` from the release catalog; omitted when uncatalogued. */
  version?: string | null
  lastError?: string | null
  /**
   * Latest tracked `managed.apply` command, when one has been enqueued in this
   * session. Its transcript is a distinct sub-section from the on-demand engine
   * log tail below — one is what TurboPanel did, the other is what the engine
   * container printed.
   */
  applyCommand?: Readonly<{ serverId: string; commandId: string }> | null
}>) {
  const [tail, setTail] = useState<(typeof TAIL_OPTIONS)[number]>(200)
  const [logs, setLogs] = useState('')
  const [error, setError] = useState<string | null>(null)
  const logsQuery = useManagedLogs(orgId, environmentId, {
    enabled: false,
    tail,
  })
  const loadingLogs = logsQuery.isFetching
  const pill = statusPillStyle(status)
  // Engine logs are a `docker logs` tail: no per-line stream, phase, or
  // timestamp, so every row renders as stdout with no phase header.
  const engineLogLines = useMemo(
    () => plainTextTranscriptLines(logs),
    [logs],
  )
  const applyLog = useCommandLog(
    orgId,
    applyCommand?.serverId ?? null,
    applyCommand?.commandId ?? null,
    { enabled: Boolean(applyCommand) },
  )

  const refreshLogs = async () => {
    setError(null)
    try {
      const result = await logsQuery.refetch()
      if (result.error) {
        throw result.error
      }
      setLogs(result.data?.logs ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs')
    }
  }

  return (
    <SectionPanel title="Status & logs" hint="Runtime status and on-demand logs">
      <View style={styles.headerRow}>
        <View
          style={[
            styles.pill,
            { borderColor: pill.borderColor, backgroundColor: pill.backgroundColor },
          ]}
        >
          <Text style={[styles.pillText, { color: pill.color }]}>
            {managedStatusLabel(status)}
          </Text>
        </View>
        {version ? <Text style={styles.version}>{version}</Text> : null}
        {host && port != null ? (
          <Text style={orgPanelStyles.muted}>
            {host}:{port}
          </Text>
        ) : null}
      </View>

      {lastError ? (
        <Text style={orgPanelStyles.error} accessibilityRole="alert">
          {lastError}
        </Text>
      ) : null}

      <View style={styles.containerList}>
        {partitionContainersForDisplay(containers).map((container) => (
          <View
            key={container.id}
            style={[
              styles.containerRow,
              container.role === 'ingress' && styles.containerRowIngress,
            ]}
          >
            <Text style={styles.containerName}>
              {containerDisplayName(container)}
            </Text>
            <ContainerRoleBadge role={container.role} />
            <ContainerStatusBadge status={container.status} />
          </View>
        ))}
        {containers.length === 0 ? (
          <EmptyState title="No containers reported yet." />
        ) : null}
      </View>

      {applyCommand ? (
        <View style={styles.logSection}>
          <Text style={orgPanelStyles.detailLabel}>Apply transcript</Text>
          <LogTranscriptView
            lines={applyLog.snapshot.lines}
            state={applyLog.state}
            title="managed.apply"
            hint="What TurboPanel ran to converge this cluster."
            downloadFileName={`managed-apply-${applyCommand.commandId}.log`}
          />
        </View>
      ) : null}

      <Text style={orgPanelStyles.detailLabel}>Engine logs</Text>
      <View style={styles.logControls}>
        <SegmentedControl
          options={TAIL_OPTIONS.map((option) => ({
            value: String(option),
            label: String(option),
          }))}
          value={String(tail)}
          onChange={(value) =>
            setTail(Number(value) as (typeof TAIL_OPTIONS)[number])
          }
          accessibilityLabel="Log tail lines"
        />
        <Button
          label="Refresh logs"
          busyLabel="Loading…"
          busy={loadingLogs}
          onPress={() => {
            void refreshLogs()
          }}
        />
      </View>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <LogTranscriptView
        lines={engineLogLines}
        state={engineLogLines.length > 0 ? 'sealed' : 'idle'}
        hint="Engine container output — loads on demand, never on a timer."
        downloadFileName={`managed-engine-${environmentId}.log`}
      />
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  version: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  containerList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  containerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  containerRowIngress: {
    marginLeft: spacing.md,
    paddingLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderArea,
  },
  containerName: {
    color: colors.textBody,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  logSection: {
    gap: spacing.sm,
  },
  logControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
})
