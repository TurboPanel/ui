import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { PlatformBadge } from '@/components/org/platform-badge'
import { ReadOnlyYamlBlock } from '@/components/org/readonly-yaml-block'
import { SectionPanel } from '@/components/org/section-panel'
import { useProjectContext } from '@/components/org/project/project-context'
import { OverviewEnvironmentsPanel } from '@/components/org/project/overview-environments-panel'
import {
  SYSTEM_COMPONENT_NOT_PROVISIONED_ERROR,
  SYSTEM_RECONCILE_UNAVAILABLE_ERROR,
  SYSTEM_RESOURCE_IMMUTABLE_ERROR,
  UNKNOWN_SYSTEM_COMPONENT_ERROR,
  type ContainerRecord,
  type ServiceRecord,
} from '@/lib/instance-api'
import { serviceStatusTone } from '@/lib/container-status'
import { useCan, queryKeys } from '@/lib/query-client'
import {
  isTerminalCommandStatus,
  useCommandsBatch,
  type TrackedCommandEntry,
} from '@/lib/queries/commands'
import { useContainers, useServices } from '@/lib/queries'
import { useRestartSystemComponent } from '@/lib/queries/system'
import {
  composeDocumentToYaml,
  hideComposeTurbopanelExtensions,
  normalizeCompose,
} from '@/lib/compose'
import {
  isSystemOperateComponent,
  systemComponentLabel,
  TURBOPANEL_WORKSPACE_DESCRIPTION,
} from '@/lib/system-inventory'
import { colors, spacing } from '@/lib/theme'

export function systemRestartErrorMessage(
  error: string | null | undefined,
): string {
  if (!error) return 'Restart failed'
  if (error.includes(SYSTEM_COMPONENT_NOT_PROVISIONED_ERROR)) {
    return 'Hosting proxy is not provisioned on this server yet.'
  }
  if (error.includes(SYSTEM_RECONCILE_UNAVAILABLE_ERROR)) {
    return 'System reconcile is temporarily unavailable.'
  }
  if (error.includes(UNKNOWN_SYSTEM_COMPONENT_ERROR)) {
    return 'Unknown system component.'
  }
  if (error.includes(SYSTEM_RESOURCE_IMMUTABLE_ERROR)) {
    return 'Platform managed — read only'
  }
  return error
}

type RestartPollEntry = TrackedCommandEntry & {
  environmentId: string
}

function useSystemRestartPoll(orgId: string) {
  const queryClient = useQueryClient()
  const [pollError, setPollError] = useState<string | null>(null)
  const [pollCommands, setPollCommands] = useState<readonly RestartPollEntry[]>(
    [],
  )
  const processedCommandIdsRef = useRef<Set<string>>(new Set())

  const batchEntries = useMemo(
    () =>
      pollCommands.map((entry) => ({
        serverId: entry.serverId,
        commandId: entry.commandId,
      })),
    [pollCommands],
  )
  const commandsQuery = useCommandsBatch(orgId, batchEntries)

  useEffect(() => {
    const records = commandsQuery.data
    if (!records || records.length === 0) return

    for (let index = 0; index < pollCommands.length; index += 1) {
      const entry = pollCommands[index]
      const record = records[index]
      if (!entry || !record) continue
      if (!isTerminalCommandStatus(record.status)) continue
      if (processedCommandIdsRef.current.has(entry.commandId)) continue

      processedCommandIdsRef.current.add(entry.commandId)
      if (record.status === 'succeeded') {
        setPollError(null)
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).containers.list({
            environmentId: entry.environmentId,
          }),
        })
      } else {
        setPollError(record.error ?? `Restart ${record.status}`)
      }
      setPollCommands((prev) =>
        prev.filter((item) => item.commandId !== entry.commandId),
      )
    }
  }, [commandsQuery.data, pollCommands, orgId, queryClient])

  useEffect(() => {
    if (!commandsQuery.error || pollCommands.length === 0) return
    setPollError(
      commandsQuery.error instanceof Error
        ? commandsQuery.error.message
        : 'Failed to poll restart command',
    )
    setPollCommands([])
  }, [commandsQuery.error, pollCommands.length])

  const registerRestart = (
    serverId: string,
    commandId: string,
    environmentId: string,
  ) => {
    processedCommandIdsRef.current.delete(commandId)
    setPollCommands((prev) =>
      prev.some((item) => item.commandId === commandId)
        ? prev
        : [...prev, { serverId, commandId, environmentId }],
    )
  }

  return {
    pollError,
    setPollError,
    restartInFlight: pollCommands.length > 0,
    registerRestart,
  }
}

function SystemServiceRows({
  services,
  containers,
  loading,
}: Readonly<{
  services: readonly ServiceRecord[]
  containers: readonly ContainerRecord[]
  loading: boolean
}>) {
  if (services.length === 0 && !loading) {
    return <Text style={orgPanelStyles.muted}>No services yet.</Text>
  }

  return (
    <>
      {services.map((service) => {
        const serviceContainers = containers.filter(
          (row) => row.serviceId === service.id,
        )
        const tone = serviceStatusTone(
          serviceContainers.length > 0
            ? [...serviceContainers]
            : [...containers],
        )
        const containerName =
          serviceContainers[0]?.containerName ??
          service.composeServiceName ??
          service.name ??
          service.id
        return (
          <View key={service.id} style={styles.serviceRow}>
            <View
              style={[styles.statusDot, { backgroundColor: tone.color }]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <View style={styles.serviceText}>
              <Text style={styles.serviceLabel}>
                {service.name?.trim() ||
                  service.composeServiceName ||
                  'Service'}
              </Text>
              <Text style={styles.mono} numberOfLines={1}>
                {containerName}
              </Text>
              <Text style={styles.statusLabel}>{tone.label}</Text>
            </View>
          </View>
        )
      })}
    </>
  )
}

function SystemRestartAction({
  showRestart,
  operateAllowed,
  disabled,
  inFlight,
  onRestart,
}: Readonly<{
  showRestart: boolean
  operateAllowed: boolean
  disabled: boolean
  inFlight: boolean
  onRestart: () => void
}>) {
  if (!showRestart) {
    return (
      <Text style={orgPanelStyles.muted}>
        {operateAllowed
          ? 'Select a server-backed environment to restart this component.'
          : 'This platform component is read only — restart is not available.'}
      </Text>
    )
  }

  return (
    <Pressable
      style={[
        orgPanelStyles.toolbarBtnPrimary,
        disabled && styles.disabled,
        webPointer,
      ]}
      disabled={disabled}
      onPress={onRestart}
      accessibilityRole="button"
      accessibilityLabel="Restart platform component"
    >
      <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
        {inFlight ? 'Restarting…' : 'Restart'}
      </Text>
    </Pressable>
  )
}

/**
 * Read-only platform panel for system (hosting-ingress) projects.
 * No compose editor, no lifecycle chrome — Restart only when the component is
 * allowlisted and a server-backed environment is selected.
 */
export function SystemProjectOverviewPanel() {
  const {
    orgId,
    project,
    selectedEnvironment,
    systemComponent,
    baseSelected,
  } = useProjectContext()
  const canOperate = useCan('organization', orgId, 'system:operate')
  const environmentId = selectedEnvironment?.id ?? null
  const serverId = selectedEnvironment?.serverId ?? null

  const servicesQuery = useServices(orgId, environmentId ?? undefined, {
    enabled: environmentId != null && !baseSelected,
  })
  const containersQuery = useContainers(
    orgId,
    environmentId ? { environmentId } : undefined,
    {
      enabled: environmentId != null && !baseSelected,
      observeUntilHostDeployed: true,
    },
  )

  const services = servicesQuery.data?.services ?? []
  const containers = containersQuery.data?.containers ?? []
  const restart = useRestartSystemComponent(orgId, serverId ?? '')
  const [localError, setLocalError] = useState<string | null>(null)
  const { pollError, setPollError, restartInFlight, registerRestart } =
    useSystemRestartPoll(orgId)

  const componentKey = systemComponent
  const operateAllowed =
    componentKey != null && isSystemOperateComponent(componentKey)
  const showRestart =
    operateAllowed && serverId != null && environmentId != null && !baseSelected

  const composeYaml = useMemo(() => {
    const doc =
      selectedEnvironment?.options?.compose ?? project?.options?.compose
    if (!doc) return null
    try {
      return composeDocumentToYaml(
        hideComposeTurbopanelExtensions(normalizeCompose(doc)).document,
      )
    } catch {
      return null
    }
  }, [project?.options?.compose, selectedEnvironment?.options?.compose])

  const busy = restartInFlight || restart.isPending

  const handleRestart = async () => {
    if (
      !serverId ||
      !environmentId ||
      componentKey == null ||
      !isSystemOperateComponent(componentKey)
    ) {
      return
    }
    setLocalError(null)
    setPollError(null)
    const result = await restart.run(componentKey)
    if (!result.ok) {
      setLocalError(systemRestartErrorMessage(result.error))
      return
    }
    registerRestart(serverId, result.value.commandId, environmentId)
  }

  const actionError = localError ?? pollError

  return (
    <View style={styles.root}>
      <OverviewEnvironmentsPanel />

      <SectionPanel title="Platform component" hint="Read only">
        <View style={styles.badgeRow}>
          <PlatformBadge />
          <Text style={orgPanelStyles.muted}>{TURBOPANEL_WORKSPACE_DESCRIPTION}</Text>
        </View>

        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Component: </Text>
          <Text style={styles.mono}>
            {systemComponentLabel(componentKey)}
          </Text>
        </Text>

        {serverId ? (
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Target server: </Text>
            <Text style={styles.mono}>{serverId}</Text>
          </Text>
        ) : (
          <Text style={orgPanelStyles.muted}>
            No environment selected — pick a server environment above.
          </Text>
        )}

        {!baseSelected && environmentId ? (
          <View style={styles.serviceList}>
            <SystemServiceRows
              services={services}
              containers={containers}
              loading={servicesQuery.isLoading}
            />
          </View>
        ) : null}

        <SystemRestartAction
          showRestart={showRestart}
          operateAllowed={operateAllowed}
          disabled={!canOperate || busy}
          inFlight={busy}
          onRestart={() => {
            void handleRestart()
          }}
        />

        {actionError ? (
          <Text style={orgPanelStyles.error}>{actionError}</Text>
        ) : null}
      </SectionPanel>

      {composeYaml ? (
        <SectionPanel title="Compose" hint="Read only">
          <ReadOnlyYamlBlock value={composeYaml} />
        </SectionPanel>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mono: {
    color: colors.textBody,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  serviceList: {
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  serviceText: {
    flex: 1,
    gap: 2,
  },
  serviceLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  disabled: {
    opacity: 0.5,
  },
})
