import { useState } from 'react'
import { Button, ConfirmButton, InlineNotice, MonoText } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { useServerDeletePreview } from '@/lib/queries/servers'
import {
  blockedDatabaseMessages,
  environmentForgetCopy,
  forgottenResourceGroups,
  hasBlockedDatabases,
  membersForgetCopy,
  moreLabel,
  SERVER_DELETE_FORGET_CONFIRM_LABEL,
  SERVER_DELETE_FORGET_COPY,
  SERVER_DELETE_FORGET_REVEAL_LABEL,
  serverDeleteBlockerMessages,
  shouldShowServerForgetPath,
  type ForgottenResourceGroup,
} from '@/lib/server-delete-preview'
import { spacing } from '@/lib/theme'
import { StyleSheet, Text, View } from 'react-native'
import { ServerBlockerItemsFromRow } from '@/components/org/server-blocker-items'
import { formatServerDeleteBlocker } from '@/lib/server-delete-blockers'

function ForgetResourceGroups({
  groups,
}: Readonly<{ groups: ForgottenResourceGroup[] }>) {
  return (
    <>
      {groups.map((group) => (
        <View key={group.heading} style={styles.group}>
          <Text style={panelStyles.detailTitle}>{group.heading}</Text>
          {group.names.map((name) => (
            <MonoText key={name}>{name}</MonoText>
          ))}
          {group.more > 0 ? (
            <Text style={panelStyles.muted}>{moreLabel(group.more)}</Text>
          ) : null}
        </View>
      ))}
    </>
  )
}

function ForgetWarningBody({
  preview,
}: Readonly<{ preview: unknown }>) {
  const environmentCopy = environmentForgetCopy(preview)
  const membersCopy = membersForgetCopy(preview)
  const groups = forgottenResourceGroups(preview)
  return (
    <View style={styles.group}>
      <InlineNotice title="Host is gone" body={SERVER_DELETE_FORGET_COPY} tone="warning" />
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
  onConfirm: (forgetResources: boolean) => void
}>) {
  const previewQuery = useServerDeletePreview(orgId, serverId)
  const preview = previewQuery.data
  const showForget = shouldShowServerForgetPath(preview, { serverConnected })
  const blockedLines = blockedDatabaseMessages(preview)
  const blockerLines = serverDeleteBlockerMessages(preview)
  const forgetBlocked = hasBlockedDatabases(preview) || !showForget
  const [forgetArmed, setForgetArmed] = useState(false)
  const busy = deleting
  const showError =
    Boolean(deleteError) &&
    blockerLines.length === 0 &&
    blockedLines.length === 0 &&
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
      {blockedLines.map((line) => (
        <Text key={line} style={[panelStyles.error, styles.wrapText]}>
          {line}
        </Text>
      ))}
      {showForget && forgetArmed ? <ForgetWarningBody preview={preview} /> : null}
      <ConfirmButton
        label={busy ? 'Deleting…' : 'Delete server'}
        confirmLabel="Confirm delete"
        prompt="Permanently remove this server from the organization?"
        busy={busy}
        disabled={busy}
        onConfirm={() => onConfirm(false)}
      />
      {showForget && !forgetArmed ? (
        <Button
          label={SERVER_DELETE_FORGET_REVEAL_LABEL}
          variant="danger"
          size="sm"
          disabled={busy || forgetBlocked}
          onPress={() => setForgetArmed(true)}
        />
      ) : null}
      {showForget && forgetArmed ? (
        <Button
          label={busy ? 'Deleting…' : SERVER_DELETE_FORGET_CONFIRM_LABEL}
          variant="danger"
          size="sm"
          busy={busy}
          disabled={busy || forgetBlocked}
          onPress={() => onConfirm(true)}
        />
      ) : null}
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
