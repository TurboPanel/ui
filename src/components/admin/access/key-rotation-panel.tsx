import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  InlineNotice,
  LoadingState,
  SectionPanel,
} from '@/components/ui'
import { FingerprintLine } from '@/components/ui/fingerprint-line'
import type {
  KeysetChangeRequest,
  KeyRotationState,
  PreparedKeysetStatement,
  RotationPasskey,
} from '@/lib/instance-api'
import { fetchKeysetStatement } from '@/lib/instance-api'
import {
  HA_ROTATE_HELP,
  MARK_ONLY_OWN_HELP,
  NO_DEVICE_BOUND_WARNING,
  NOT_ROTATABLE_HELP,
  passkeyKindLabel,
  REVOKE_HELP,
  ROTATE_HELP,
  ROTATION_PASSKEYS_HELP,
  statementKindLabel,
} from '@/lib/key-rotation'
import {
  useApproveKeysetStatement,
  useKeyRotation,
  usePrepareKeysetStatement,
} from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

/** Save a statement as a file (web only; the control plane UI is a browser page). */
async function downloadStatement(keyset: number): Promise<void> {
  const envelope = await fetchKeysetStatement(keyset)
  if (typeof document === 'undefined') return
  const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `key-set-${keyset}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function PasskeyRow({
  passkey,
  busy,
  onChange,
}: Readonly<{
  passkey: RotationPasskey
  busy: boolean
  onChange: (request: KeysetChangeRequest) => void
}>) {
  let action = null
  if (passkey.isMarked && passkey.rotationId) {
    const rotationId = passkey.rotationId
    action = (
      <Button
        label="Unmark"
        size="sm"
        disabled={busy}
        onPress={() => onChange({ kind: 'passkeys', unmark: [rotationId] })}
      />
    )
  } else if (passkey.canApprove && passkey.isOwn) {
    action = (
      <Button
        label="Mark"
        size="sm"
        disabled={busy}
        onPress={() => onChange({ kind: 'passkeys', mark: [passkey.passkeyId] })}
      />
    )
  }
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.name}>{passkey.name ?? 'Passkey'}</Text>
        <Text style={panelStyles.muted}>
          {passkey.ownerEmail} · {passkeyKindLabel(passkey.isDeviceBound)}
          {passkey.canApprove ? '' : " · This passkey's type can't approve key changes"}
        </Text>
      </View>
      {passkey.isMarked ? <Badge label="Rotation" tone="info" /> : null}
      {action}
    </View>
  )
}

function PreparedChange({
  prepared,
  busy,
  onApprove,
  onCancel,
}: Readonly<{
  prepared: PreparedKeysetStatement
  busy: boolean
  onApprove: () => void
  onCancel: () => void
}>) {
  const keyChanges = prepared.kind !== 'passkeys'
  return (
    <View style={styles.details}>
      <FingerprintLine label="Key Set" value={String(prepared.keyset)} copy={false} />
      <FingerprintLine label="Current Key" value={prepared.oldFingerprint} />
      {keyChanges ? <FingerprintLine label="New Key" value={prepared.newFingerprint} /> : null}
      <Text style={panelStyles.muted}>
        {keyChanges
          ? 'Check the new key before you approve. Your browser then asks for a marked passkey.'
          : 'Your browser asks for each passkey this change needs.'}
      </Text>
      <ButtonRow>
        <Button
          label="Approve With Passkey"
          variant="primary"
          busy={busy}
          disabled={busy}
          onPress={onApprove}
        />
        <Button label="Cancel" disabled={busy} onPress={onCancel} />
      </ButtonRow>
    </View>
  )
}

function KeyChangeButtons({
  state,
  linkRequest,
  busy,
  onChange,
}: Readonly<{
  state: KeyRotationState
  linkRequest: KeysetChangeRequest | null
  busy: boolean
  onChange: (request: KeysetChangeRequest) => void
}>) {
  const hosted = state.runtime === 'workers'
  const disabled = busy || !state.canRotate
  if (hosted) {
    return (
      <View style={styles.details}>
        <Text style={panelStyles.muted}>{HA_ROTATE_HELP}</Text>
        {linkRequest ? (
          <Button
            label={linkRequest.kind === 'revoke' ? 'Emergency Revoke' : 'Rotate Key'}
            variant="primary"
            disabled={disabled}
            onPress={() => onChange(linkRequest)}
          />
        ) : null}
      </View>
    )
  }
  return (
    <View style={styles.details}>
      <Text style={panelStyles.muted}>{ROTATE_HELP}</Text>
      <ButtonRow>
        <ConfirmButton
          stacked
          variant="secondary"
          label="Rotate Key"
          confirmLabel="Continue"
          prompt="Make a new key and ask for a passkey to approve it?"
          disabled={disabled}
          onConfirm={() => onChange({ kind: 'rotate' })}
        />
        <ConfirmButton
          stacked
          label="Emergency Revoke"
          confirmLabel="Continue"
          prompt={REVOKE_HELP}
          disabled={disabled}
          onConfirm={() => onChange({ kind: 'revoke' })}
        />
      </ButtonRow>
    </View>
  )
}

function StatementList({ state }: Readonly<{ state: KeyRotationState }>) {
  const [error, setError] = useState<string | null>(null)
  if (state.statements.length === 0) return null
  return (
    <View style={styles.details}>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {state.statements.map((statement) => (
        <View key={statement.keyset} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.name}>
              Key Set {statement.keyset}: {statementKindLabel(statement.kind)}
            </Text>
            <Text style={panelStyles.muted}>
              {statement.createdAt}
              {statement.state === 'awaiting_key' ? ' · Waiting for the new key' : ''}
            </Text>
          </View>
          <Button
            label="Download Statement"
            size="sm"
            onPress={() => {
              setError(null)
              downloadStatement(statement.keyset).catch((err: unknown) => {
                setError(userErrorMessage(err, 'Failed to download the statement'))
              })
            }}
          />
        </View>
      ))}
    </View>
  )
}

/**
 * Rotation passkeys, Rotate Key and Emergency Revoke (superadmin). Every
 * change is prepared by the control plane, shown with its fingerprints, then
 * approved with passkeys in this browser.
 */
export function KeyRotationPanel({
  linkRequest = null,
  notRotatable = [],
}: Readonly<{ linkRequest?: KeysetChangeRequest | null; notRotatable?: readonly string[] }>) {
  const query = useKeyRotation()
  const prepare = usePrepareKeysetStatement()
  const approve = useApproveKeysetStatement()
  const [prepared, setPrepared] = useState<PreparedKeysetStatement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const busy = prepare.isPending || approve.isPending
  const state = query.data

  const onChange = (request: KeysetChangeRequest) => {
    setError(null)
    setNotice(null)
    void prepare.run(request).then((result) => {
      if (result.ok) setPrepared(result.value)
      else setError(result.error ?? 'Failed to prepare the change')
    })
  }

  const onApprove = () => {
    if (!prepared) return
    setError(null)
    void approve.run(prepared).then(async (result) => {
      if (!result.ok) {
        setError(result.error ?? 'The change was not approved')
        return
      }
      setPrepared(null)
      setNotice(
        result.value.state === 'awaiting_key'
          ? `Key set ${result.value.keyset} approved. Finish the command in your terminal.`
          : `Key set ${result.value.keyset} approved.`
      )
      await query.refetch()
    })
  }

  return (
    <SectionPanel title="Rotation Passkeys" hint="Superadmin only">
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load the rotation passkeys')}
        </Text>
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.saved}>{notice}</Text> : null}
      {state ? (
        <View style={styles.details}>
          <Text style={panelStyles.muted}>{ROTATION_PASSKEYS_HELP}</Text>
          <FingerprintLine label="Approves On" value={state.rpId} copy={false} />
          {state.markedCount > 0 && !state.hasDeviceBound ? (
            <InlineNotice tone="warning" title="No Security Key" body={NO_DEVICE_BOUND_WARNING} />
          ) : null}
          {notRotatable.length > 0 ? (
            <InlineNotice
              tone="warning"
              title="Not Rotatable Yet"
              body={`${notRotatable.join(', ')}. ${NOT_ROTATABLE_HELP}`}
            />
          ) : null}
          {state.passkeys.map((passkey) => (
            <PasskeyRow
              key={passkey.passkeyId}
              passkey={passkey}
              busy={busy || prepared !== null}
              onChange={onChange}
            />
          ))}
          <Text style={panelStyles.muted}>{MARK_ONLY_OWN_HELP}</Text>
          {prepared ? (
            <PreparedChange
              prepared={prepared}
              busy={approve.isPending}
              onApprove={onApprove}
              onCancel={() => setPrepared(null)}
            />
          ) : (
            <KeyChangeButtons
              state={state}
              linkRequest={linkRequest}
              busy={busy}
              onChange={onChange}
            />
          )}
          {state.markedCount < 2 ? (
            <Text style={panelStyles.muted}>Rotate Key needs at least two marked passkeys.</Text>
          ) : null}
          <StatementList state={state} />
        </View>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  details: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 14, fontWeight: '600' },
  saved: { color: colors.ok, fontSize: 13, fontWeight: '600', lineHeight: 18 },
})
