import { useState } from 'react'
import { Link, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
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
import { colors, spacing } from '@/lib/theme'

function statusCopy(
  status: ReturnType<typeof useServerSystemIngress>['status'],
  toneLabel: string,
): string {
  switch (status) {
    case 'not_provisioned':
      return 'Not provisioned — hosting is not enabled on this server yet.'
    case 'pending':
      return 'Pending allocation — waiting for a Docker container id.'
    case 'running':
      return toneLabel
    case 'exited':
      return toneLabel
    default:
      return toneLabel
  }
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
    ingress.service?.displayName ??
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

  let body: React.ReactNode
  if (ingress.isLoading) {
    body = <Text style={orgPanelStyles.muted}>Loading…</Text>
  } else if (ingress.error) {
    body = (
      <Text style={orgPanelStyles.error}>
        {ingress.error instanceof Error
          ? ingress.error.message
          : 'Failed to load system component'}
      </Text>
    )
  } else if (ingress.status === 'not_provisioned') {
    body = (
      <Text style={orgPanelStyles.muted}>
        {statusCopy('not_provisioned', tone.label)}
      </Text>
    )
  } else {
    body = (
      <View style={styles.statusBlock}>
        <View style={styles.statusRow}>
          <View
            style={[styles.statusDot, { backgroundColor: tone.color }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.statusLabel}>
            {statusCopy(ingress.status, tone.label)}
          </Text>
        </View>
        {containerName ? (
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Container: </Text>
            <Text style={styles.mono}>{containerName}</Text>
          </Text>
        ) : null}
        {composeServiceName ? (
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Service: </Text>
            <Text style={styles.mono}>{composeServiceName}</Text>
          </Text>
        ) : null}
        {ingress.workspaceId &&
        ingress.projectId &&
        ingress.environment?.id ? (
          <Link
            href={
              projectEnvironmentHref(
                orgId,
                ingress.projectId,
                ingress.environment.id,
              ) as Href
            }
            asChild
          >
            <Pressable
              style={[styles.linkBtn, webPointer]}
              accessibilityRole="link"
              accessibilityLabel="Open in System workspace"
            >
              <Text style={styles.linkBtnText}>Open in System workspace</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    )
  }

  const error = actionError ?? pollError

  return (
    <View style={styles.root}>
      {body}

      <Pressable
        style={[
          orgPanelStyles.toolbarBtnPrimary,
          restartDisabled && styles.disabled,
          webPointer,
        ]}
        disabled={restartDisabled}
        onPress={() => void handleRestart()}
        accessibilityRole="button"
        accessibilityLabel="Restart server proxy"
      >
        <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
          {restart.isPending || restartInFlight ? 'Restarting…' : 'Restart'}
        </Text>
      </Pressable>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
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
  mono: {
    color: colors.textBody,
    fontFamily: 'monospace',
    fontSize: 13,
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
  disabled: {
    opacity: 0.5,
  },
})
