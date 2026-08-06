import { useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  ContainerRoleBadge,
  ContainerStatusBadge,
} from '@/components/org/managed/container-status-badge'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type { ContainerRecord } from '@/lib/instance-api'
import {
  managedStatusLabel,
  type ManagedStatus,
} from '@/lib/managed-services'
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

/** Engine (service) first, then ingress. */
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
}: Readonly<{
  orgId: string
  environmentId: string
  status: ManagedStatus
  host: string | null
  port: number | null
  containers: ContainerRecord[]
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
        {host && port != null ? (
          <Text style={orgPanelStyles.muted}>
            {host}:{port}
          </Text>
        ) : null}
      </View>

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
          <Text style={orgPanelStyles.muted}>No containers reported yet.</Text>
        ) : null}
      </View>

      <Text style={orgPanelStyles.detailLabel}>Logs</Text>
      <View style={orgPanelStyles.segmentGroup}>
        {TAIL_OPTIONS.map((option) => (
          <Pressable
            key={option}
            style={[
              styles.segment,
              tail === option && styles.segmentActive,
              webPointer,
            ]}
            onPress={() => setTail(option)}
          >
            <Text
              style={[
                styles.segmentText,
                tail === option && styles.segmentTextActive,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            webPointer,
            loadingLogs && styles.disabled,
          ]}
          disabled={loadingLogs}
          onPress={() => {
            void refreshLogs()
          }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            {loadingLogs ? 'Loading…' : 'Refresh logs'}
          </Text>
        </Pressable>
      </View>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <TextInput
        editable={false}
        multiline
        value={logs || 'Logs load on demand — press Refresh logs.'}
        style={[
          Platform.OS === 'web' ? styles.logsWeb : styles.logs,
        ]}
        textAlignVertical="top"
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
  segment: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  segmentActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.accent,
  },
  logs: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.textBody,
    padding: spacing.sm,
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  logsWeb: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.textBody,
    padding: spacing.sm,
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  disabled: {
    opacity: 0.55,
  },
})
