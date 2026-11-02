import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ConfirmButton, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { ReenrollCommandBox } from '@/components/org/reenroll-command-box'
import type { ReenrollTicket, ReissuedLicenseTicket } from '@/lib/instance-api'
import {
  pendingKeyDisplayName,
  pendingKeyExpiryLabel,
  pendingKeyTierLabel,
  unboundPendingKeys,
} from '@/lib/pending-keys'
import {
  useDeleteLicense,
  useIssueServerReenrollTicket,
  useOrgLicenses,
  useReissueLicenseTicket,
  useRevokeServerReenrollTickets,
} from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { reenrollCommandText, REENROLL_TOKEN_HELP } from '@/lib/reenroll-token'
import { spacing } from '@/lib/theme'

type ShownTicket = Readonly<{ command: string; expiresAt: string }>

function toShown(ticket: ReenrollTicket): ShownTicket {
  return { command: reenrollCommandText(ticket), expiresAt: ticket.expiresAt }
}

function reissuedToShown(ticket: ReissuedLicenseTicket): ShownTicket {
  return { command: reenrollCommandText(ticket), expiresAt: ticket.joinExpiresAt }
}

function ReenrollTokenCard({ serverId }: Readonly<{ serverId: string }>) {
  const issue = useIssueServerReenrollTicket(serverId)
  const revoke = useRevokeServerReenrollTickets(serverId)
  const [shown, setShown] = useState<ShownTicket | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const onIssue = async () => {
    setError(null)
    setRevokeError(null)
    const result = await issue.run(undefined)
    if (result.ok) setShown(toShown(result.value))
    else if (result.error !== null) setError(result.error || 'Failed to issue a Re-Enroll Token')
  }

  const onRevoke = async () => {
    setRevokeError(null)
    const result = await revoke.run(undefined)
    if (result.ok) setShown(null)
    else if (result.error !== null) setRevokeError(result.error || 'Failed to revoke the token')
  }

  return (
    <SectionPanel title="Re-Enroll Token" hint="One hour, single use">
      <Text style={panelStyles.muted}>{REENROLL_TOKEN_HELP}</Text>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {shown ? (
        <ReenrollCommandBox
          command={shown.command}
          expiresAt={shown.expiresAt}
          revoking={revoke.isPending}
          revokeError={revokeError}
          onRevoke={() => void onRevoke()}
        />
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Issue Re-Enroll Token"
          busyLabel="Issuing…"
          busy={issue.isPending}
          onPress={() => void onIssue()}
        />
      </View>
    </SectionPanel>
  )
}

function MintedKeysCard({ orgId }: Readonly<{ orgId: string }>) {
  const licensesQuery = useOrgLicenses(orgId)
  const reissue = useReissueLicenseTicket(orgId)
  const burn = useDeleteLicense(orgId)
  const [shown, setShown] = useState<(ShownTicket & { keyName: string; keyId: string }) | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)

  const rows = unboundPendingKeys(licensesQuery.data?.licenses ?? [])

  const onReissue = async (id: string, keyName: string) => {
    setError(null)
    const result = await reissue.run(id)
    if (result.ok) setShown({ ...reissuedToShown(result.value), keyName, keyId: id })
    else if (result.error !== null) setError(result.error || 'Failed to reissue the key')
  }

  const onBurn = async (id: string) => {
    setError(null)
    const result = await burn.run(id)
    if (result.ok) setShown((current) => (current?.keyId === id ? null : current))
    else if (result.error !== null) setError(result.error || 'Failed to burn the key')
  }

  return (
    <SectionPanel title="Keys Minted Before" hint="Unused install keys">
      <Text style={panelStyles.muted}>
        Install keys made earlier that no server has used yet. Reissue replaces a key&apos;s secret
        with a new one-hour command and stops the old one. Burn deletes the key.
      </Text>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {rows.length === 0 ? <Text style={panelStyles.muted}>No unused keys.</Text> : null}
      {rows.map((row) => (
        <View key={row.id} style={styles.keyRow}>
          <Text style={panelStyles.pageCopy}>
            {pendingKeyDisplayName(row)} · {pendingKeyTierLabel(row)} · {pendingKeyExpiryLabel(row)}
          </Text>
          <View style={styles.actions}>
            <Button
              label="Reissue"
              accessibilityLabel={`Reissue key ${pendingKeyDisplayName(row)}`}
              busyLabel="Reissuing…"
              busy={reissue.isPending && reissue.variables === row.id}
              onPress={() => void onReissue(row.id, pendingKeyDisplayName(row))}
            />
            {row.revocable ? (
              <ConfirmButton
                label="Burn"
                confirmLabel="Confirm Burn"
                prompt="Delete this key? Its command stops working."
                busy={burn.isPending && burn.variables === row.id}
                onConfirm={() => void onBurn(row.id)}
              />
            ) : null}
          </View>
        </View>
      ))}
      {shown ? (
        <View style={styles.keyRow}>
          <Text style={panelStyles.detailTitle}>New command for {shown.keyName}</Text>
          <ReenrollCommandBox command={shown.command} expiresAt={shown.expiresAt} />
        </View>
      ) : null}
    </SectionPanel>
  )
}

/** Owner-only: re-enroll token for this server, plus the keys minted before. */
export function ServerReenrollTokenPanel({
  orgId,
  serverId,
}: Readonly<{ orgId: string; serverId: string }>) {
  const canOwn = useCan('organization', orgId, 'organization:own')
  if (!canOwn) return null
  return (
    <>
      <ReenrollTokenCard serverId={serverId} />
      <MintedKeysCard orgId={orgId} />
    </>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  keyRow: { gap: spacing.sm },
})
