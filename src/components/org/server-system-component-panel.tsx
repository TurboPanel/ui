import { useState } from 'react'
import { Link, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, MonoText, StatusDot } from '@/components/ui'
import { systemRestartErrorMessage } from '@/components/org/project/system-project-overview-panel'
import type { CommandEnqueueResponse } from '@/lib/instance-api'
import { serviceStatusTone } from '@/lib/container-status'
import { useCan } from '@/lib/query-client'
import {
  useRestartSystemComponent,
  useServerSystemIngress,
} from '@/lib/queries/system'
import {
  SYSTEM_HOSTING_INGRESS_COMPONENT,
} from '@/lib/system-inventory'
import { projectEnvironmentHref } from '@/lib/project-navigation'
import { colors, spacing, webPointer } from '@/lib/theme'

function statusCopy(
  status: ReturnType<typeof useServerSystemIngress>['status'],
  toneLabel: string,
): string {
  switch (status) {
    case 'not_provisioned':
      return 'Not provisioned — hosting is not enabled on this server yet.'
    case 'pending':
      return 'Pending allocation — waiting for a Docker container id.'
    default:
      return toneLabel
  }
}

function SystemWorkspaceLink({
  orgId,
  projectId,
  environmentId,
}: Readonly<{
  orgId: string
  projectId: string | null
  environmentId: string | null
}>) {
  if (!projectId || !environmentId) {
    return null
  }
  return (
    <Link
      href={projectEnvironmentHref(orgId, projectId, environmentId) as Href}
      asChild
    >
      <Pressable
        style={StyleSheet.flatten([styles.linkBtn, webPointer])}
        accessibilityRole="link"
        accessibilityLabel="Open in System workspace"
      >
        <Text style={styles.linkBtnText}>Open in System workspace</Text>
      </Pressable>
    </Link>
  )
}

function ProvisionedIngressStatus({
  orgId,
  ingress,
  tone,
  containerName,
  composeServiceName,
}: Readonly<{
  orgId: string
  ingress: ReturnType<typeof useServerSystemIngress>
  tone: ReturnType<typeof serviceStatusTone>
  containerName: string | null
  composeServiceName: string | null
}>) {
  return (
    <View style={styles.statusBlock}>
      <View style={styles.statusRow}>
        <StatusDot size="md" color={tone.color} />
        <Text style={styles.statusLabel}>
          {statusCopy(ingress.status, tone.label)}
        </Text>
      </View>
      {containerName ? (
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Container: </Text>
          <MonoText>{containerName}</MonoText>
        </Text>
      ) : null}
      {composeServiceName ? (
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Service: </Text>
          <MonoText>{composeServiceName}</MonoText>
        </Text>
      ) : null}
      <SystemWorkspaceLink
        orgId={orgId}
        projectId={ingress.workspaceId ? ingress.projectId : null}
        environmentId={ingress.environment?.id ?? null}
      />
    </View>
  )
}

function IngressStatusBody({
  orgId,
  ingress,
  tone,
  containerName,
  composeServiceName,
}: Readonly<{
  orgId: string
  ingress: ReturnType<typeof useServerSystemIngress>
  tone: ReturnType<typeof serviceStatusTone>
  containerName: string | null
  composeServiceName: string | null
}>) {
  if (ingress.isLoading) {
    return <Text style={panelStyles.muted}>Loading…</Text>
  }
  if (ingress.error) {
    return (
      <Text style={panelStyles.error}>
        {ingress.error instanceof Error
          ? ingress.error.message
          : 'Failed to load system component'}
      </Text>
    )
  }
  if (ingress.status === 'not_provisioned') {
    return (
      <Text style={panelStyles.muted}>
        {statusCopy('not_provisioned', tone.label)}
      </Text>
    )
  }
  return (
    <ProvisionedIngressStatus
      orgId={orgId}
      ingress={ingress}
      tone={tone}
      containerName={containerName}
      composeServiceName={composeServiceName}
    />
  )
}

export function ServerSystemComponentPanel({
  orgId,
  serverId,
  serverConnected,
  restartInFlight,
  pollError,
  onEnqueueRestart,
}: Readonly<{
  orgId: string
  serverId: string
  serverConnected: boolean
  restartInFlight: boolean
  pollError: string | null
  onEnqueueRestart: (
    response: CommandEnqueueResponse,
    environmentId: string | undefined,
  ) => void
}>) {
  const canOperate = useCan('organization', orgId, 'system:operate')
  const ingress = useServerSystemIngress(orgId, serverId)
  const restart = useRestartSystemComponent(orgId, serverId)
  const [actionError, setActionError] = useState<string | null>(null)

  const tone = serviceStatusTone(ingress.containers)
  const container = ingress.containers[0] ?? null
  const containerName =
    container?.containerName ??
    ingress.service?.composeServiceName ??
    ingress.service?.name ??
    null
  const composeServiceName =
    ingress.service?.composeServiceName ??
    container?.composeServiceName ??
    null

  const provisioned = ingress.status !== 'not_provisioned'
  const restartDisabled =
    !canOperate ||
    !serverConnected ||
    !provisioned ||
    restart.isPending ||
    restartInFlight ||
    ingress.isLoading

  const handleRestart = async () => {
    setActionError(null)
    const result = await restart.run(SYSTEM_HOSTING_INGRESS_COMPONENT)
    if (!result.ok) {
      setActionError(systemRestartErrorMessage(result.error))
      return
    }
    onEnqueueRestart(result.value, ingress.environment?.id)
  }

  const body = (
    <IngressStatusBody
      orgId={orgId}
      ingress={ingress}
      tone={tone}
      containerName={containerName}
      composeServiceName={composeServiceName}
    />
  )

  const error = actionError ?? pollError

  return (
    <View style={styles.root}>
      {body}

      <Button
        label="Restart"
        busyLabel="Restarting…"
        variant="primary"
        busy={restart.isPending || restartInFlight}
        disabled={restartDisabled}
        onPress={() => void handleRestart()}
        accessibilityLabel="Restart server proxy"
      />

      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  statusBlock: {
    gap: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
  },
  linkBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  linkBtnText: {
    color: colors.command,
    fontSize: 13,
    fontWeight: '600',
  },
})
