import { ConfirmButton, InlineNotice, MonoText } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { useServerDeletePreview } from '@/lib/queries/servers'
import {
  forgottenResourceGroups,
  moreLabel,
  SERVER_DELETE_FORGET_COPY,
  serverDeleteBlockerMessages,
  shouldShowServerForgetPath,
  type ForgottenResourceGroup,
} from '@/lib/server-delete-preview'
import { spacing } from '@/lib/theme'
import { StyleSheet, Text, View } from 'react-native'

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
  const groups = forgottenResourceGroups(preview)
  const blockerLines = serverDeleteBlockerMessages(preview)
  const busy = deleting
  const showError =
    Boolean(deleteError) &&
    blockerLines.length === 0 &&
    !(showForget && deleteBlocked)

  return (
    <View style={styles.root}>
      {showError ? <Text style={panelStyles.error}>{deleteError}</Text> : null}
      {blockerLines.map((line) => (
        <Text key={line} style={panelStyles.error}>
          {line}
        </Text>
      ))}
      {showForget ? (
        <>
          <InlineNotice title="Host is gone" body={SERVER_DELETE_FORGET_COPY} tone="warning" />
          <ForgetResourceGroups groups={groups} />
        </>
      ) : null}
      <ConfirmButton
        label={busy ? 'Deleting…' : 'Delete server'}
        confirmLabel="Confirm delete"
        prompt="Permanently remove this server from the organization?"
        busy={busy}
        disabled={busy}
        onConfirm={() => onConfirm(false)}
      />
      {showForget ? (
        <ConfirmButton
          label={busy ? 'Deleting…' : 'Forget these and delete server'}
          confirmLabel="Confirm forget and delete"
          prompt="Forget the listed records and permanently remove this server?"
          busy={busy}
          disabled={busy}
          onConfirm={() => onConfirm(true)}
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
  },
})
