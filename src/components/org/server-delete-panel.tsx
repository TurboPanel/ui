import { useState } from 'react'
import { ConfirmButton, InlineNotice, MonoText } from '@/components/ui'
import {
  deleteChoices,
  ServerRemovalPrincipals,
  type PrincipalRemovalChoices,
} from '@/components/org/server-removal-principals'
import { panelStyles } from '@/components/ui/panel-styles'
import { isForbiddenError } from '@/lib/fetch-error-detail'
import type { PrincipalRemovalChoice } from '@/lib/instance-api'
import { useServerDeletePreview, useServerPrincipalRemovalPlan } from '@/lib/queries/servers'
import {
  blockedDatabaseMessages,
  blockedEnvironmentMessages,
  environmentForgetCopy,
  forgottenResourceGroups,
  membersForgetCopy,
  moreLabel,
  SERVER_DELETE_FORGET_COPY,
  SERVER_REMOVE_OFFLINE_LABEL,
  serverDeleteBlockerMessages,
  shouldShowServerForgetPath,
  type ForgottenResourceGroup,
} from '@/lib/server-delete-preview'
import { spacing } from '@/lib/theme'
import { StyleSheet, Text, View } from 'react-native'
import { ServerBlockerItemsFromRow } from '@/components/org/server-blocker-items'
import { formatServerDeleteBlocker } from '@/lib/server-delete-blockers'

function ForgetResourceGroups({ groups }: Readonly<{ groups: ForgottenResourceGroup[] }>) {
  return (
    <>
      {groups.map((group) => (
        <View key={group.heading} style={styles.group}>
          <Text style={panelStyles.detailTitle}>{group.heading}</Text>
          {group.names.map((name) => (
            <MonoText key={name}>{name}</MonoText>
          ))}
          {group.more > 0 ? <Text style={panelStyles.muted}>{moreLabel(group.more)}</Text> : null}
        </View>
      ))}
    </>
  )
}

function ForgetWarningBody({ preview }: Readonly<{ preview: unknown }>) {
  const environmentCopy = environmentForgetCopy(preview)
  const membersCopy = membersForgetCopy(preview)
  const groups = forgottenResourceGroups(preview)
  return (
    <View style={styles.group}>
      <InlineNotice
        title="This server is offline"
        body={SERVER_DELETE_FORGET_COPY}
        tone="warning"
      />
      {environmentCopy ? (
        <Text style={[panelStyles.pageCopy, styles.wrapText]}>{environmentCopy}</Text>
      ) : null}
      {membersCopy ? (
        <Text style={[panelStyles.pageCopy, styles.wrapText]}>{membersCopy}</Text>
      ) : null}
      <ForgetResourceGroups groups={groups} />
    </View>
  )
}

export function ServerDeletePanel({
  orgId,
  serverId,
  serverConnected,
  deleting,
  deleteError,
  deleteBlocked,
  onConfirm,
}: Readonly<{
  orgId: string
  serverId: string
  serverConnected: boolean
  deleting: boolean
  deleteError: string | null
  deleteBlocked: boolean
  onConfirm: (forgetResources: boolean, principals: PrincipalRemovalChoice[]) => void
}>) {
  const previewQuery = useServerDeletePreview(orgId, serverId)
  const planQuery = useServerPrincipalRemovalPlan(orgId, serverId)
  const [choices, setChoices] = useState<PrincipalRemovalChoices>({})
  const preview = previewQuery.data
  const showForget = shouldShowServerForgetPath(preview, { serverConnected })
  const blockedDatabaseLines = blockedDatabaseMessages(preview)
  const blockedEnvironmentLines = blockedEnvironmentMessages(preview)
  const blockerLines = serverDeleteBlockerMessages(preview)
  const busy = deleting
  const showError =
    Boolean(deleteError) &&
    blockerLines.length === 0 &&
    blockedDatabaseLines.length === 0 &&
    blockedEnvironmentLines.length === 0 &&
    !(showForget && deleteBlocked)

  return (
    <View style={styles.root}>
      {showError ? <Text style={panelStyles.error}>{deleteError}</Text> : null}
      {preview && !preview.canForget
        ? preview.blockers.map((row) => {
            if (row.count < 1) return null
            const message = formatServerDeleteBlocker(row)
            if (message.length === 0) return null
            return (
              <View key={`${row.kind}-${row.count}`} style={styles.group}>
                <Text style={[panelStyles.error, styles.wrapText]}>{message}</Text>
                <ServerBlockerItemsFromRow orgId={orgId} row={row} />
              </View>
            )
          })
        : null}
      {blockedDatabaseLines.map((line) => (
        <Text key={line} style={[panelStyles.error, styles.wrapText]}>
          {line}
        </Text>
      ))}
      {blockedEnvironmentLines.map((line) => (
        <Text key={line} style={[panelStyles.error, styles.wrapText]}>
          {line}
        </Text>
      ))}
      <ServerRemovalPrincipals
        plan={planQuery.data?.principals}
        loading={planQuery.isLoading}
        error={isForbiddenError(planQuery.error) ? null : planQuery.error}
        choices={choices}
        disabled={busy}
        onChange={(principalId, action) =>
          setChoices((current) => ({ ...current, [principalId]: action }))
        }
      />
      {showForget ? <ForgetWarningBody preview={preview} /> : null}
      {showForget ? (
        <ConfirmButton
          label={busy ? 'Removing…' : SERVER_REMOVE_OFFLINE_LABEL}
          confirmLabel="Confirm remove"
          prompt="Remove this server from the organization? The machine itself is not touched."
          busy={busy}
          disabled={busy}
          onConfirm={() => onConfirm(true, deleteChoices(choices, planQuery.data?.principals))}
        />
      ) : (
        <ConfirmButton
          label={busy ? 'Deleting…' : 'Delete server'}
          confirmLabel="Confirm delete"
          prompt="Permanently remove this server from the organization?"
          busy={busy}
          disabled={busy}
          onConfirm={() => onConfirm(false, deleteChoices(choices, planQuery.data?.principals))}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.sm,
  },
  group: {
    gap: spacing.xs,
    width: '100%',
  },
  wrapText: {
    flexShrink: 1,
    width: '100%',
  },
})
