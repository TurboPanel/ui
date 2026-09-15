import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { StepUpPasswordField } from '@/components/account/step-up-password-field'
import {
  Button,
  ButtonRow,
  ConfirmButton,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  InlineNotice,
  TextField,
  type DataTableColumn,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { PasskeyRecord } from '@/lib/instance-api'
import { isPasskeySupported, registerPasskey } from '@/lib/passkey-client'
import { PASSKEY_WEB_ONLY_NOTE } from '@/lib/passkey-client-types'
import {
  useDeletePasskey,
  usePasskeyRegisterOptions,
  usePasskeyRegisterVerify,
} from '@/lib/queries/auth'
import {
  optionalPassword,
  securityActionMessage,
  securityActionNeedsPassword,
} from '@/lib/security-actions'
import {
  SECURITY_STATUS_UNAVAILABLE,
  passkeyCreatedLabel,
  passkeyDeviceLabel,
  passkeyDisplayName,
  resolvePasskeyName,
} from '@/lib/security-display'
import { colors, spacing } from '@/lib/theme'

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'name', header: 'Passkey', flex: 2, minWidth: 160 },
  { key: 'device', header: 'Where it lives', flex: 1, minWidth: 120 },
  { key: 'added', header: 'Added', flex: 1, minWidth: 140 },
  { key: 'actions', header: '', width: 150, align: 'end' },
]

/**
 * Registered WebAuthn credentials for this account.
 *
 * The list is read from the two-factor status projection — there is no separate
 * passkey read — and registration only appears where a ceremony can actually
 * run: a browser talking to a same-origin control plane, over a projection
 * that was actually read (`unavailable`).
 */
export function PasskeysPanel({
  passkeys,
  loading,
  unavailable = false,
}: Readonly<{
  passkeys: readonly PasskeyRecord[]
  loading: boolean
  /** The status projection could not be read — show no passkey actions. */
  unavailable?: boolean
}>) {
  const supported = isPasskeySupported()

  if (unavailable) {
    return (
      <View style={styles.stack}>
        <PasskeyList passkeys={[]} loading={false} readOnly unavailable />
      </View>
    )
  }

  if (!supported) {
    return (
      <View style={styles.stack}>
        <InlineNotice title="Passkeys" body={PASSKEY_WEB_ONLY_NOTE} />
        <PasskeyList passkeys={passkeys} loading={loading} readOnly />
      </View>
    )
  }

  return (
    <View style={styles.stack}>
      <Text style={panelStyles.muted}>
        Sign in with the fingerprint, face, or screen lock you already use. A
        passkey replaces both the password and the code.
      </Text>
      <PasskeyList passkeys={passkeys} loading={loading} />
      <AddPasskey />
    </View>
  )
}

function PasskeyList({
  passkeys,
  loading,
  readOnly = false,
  unavailable = false,
}: Readonly<{
  passkeys: readonly PasskeyRecord[]
  loading: boolean
  readOnly?: boolean
  unavailable?: boolean
}>) {
  const remove = useDeletePasskey()
  const [password, setPassword] = useState('')
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const onDelete = useCallback(
    (id: string) => {
      setMessage(null)
      setPendingId(id)
      remove
        .run({ id, password: optionalPassword(password) })
        .then((result) => {
          setPasswordRequired(securityActionNeedsPassword(result))
          setMessage(securityActionMessage(result))
          if (result.ok) setPassword('')
        })
        .catch(() => {
          // `run` folds rejections into its result shape.
        })
        .finally(() => {
          setPendingId(null)
        })
    },
    [password, remove],
  )

  let body = null
  if (unavailable) {
    body = <DataTableEmpty>{SECURITY_STATUS_UNAVAILABLE}</DataTableEmpty>
  } else if (loading) {
    body = <DataTableEmpty>Loading passkeys…</DataTableEmpty>
  } else if (passkeys.length === 0) {
    body = <DataTableEmpty>No passkeys registered.</DataTableEmpty>
  } else {
    body = passkeys.map((passkey, index) => (
      <DataTableRow
        key={passkey.id}
        alt={index % 2 === 1}
        last={index === passkeys.length - 1}
      >
        <DataTableCell column={COLUMNS[0]}>
          <Text style={styles.name} numberOfLines={1}>
            {passkeyDisplayName(passkey)}
          </Text>
        </DataTableCell>
        <DataTableCell column={COLUMNS[1]}>
          <Text style={panelStyles.muted}>{passkeyDeviceLabel(passkey)}</Text>
        </DataTableCell>
        <DataTableCell column={COLUMNS[2]}>
          <Text style={panelStyles.muted}>{passkeyCreatedLabel(passkey)}</Text>
        </DataTableCell>
        <DataTableCell column={COLUMNS[3]}>
          {readOnly ? null : (
            <ConfirmButton
              label="Remove"
              confirmLabel="Remove"
              prompt="Remove?"
              busy={remove.isPending && pendingId === passkey.id}
              onConfirm={() => onDelete(passkey.id)}
            />
          )}
        </DataTableCell>
      </DataTableRow>
    ))
  }

  return (
    <View style={styles.stack}>
      <DataTable columns={COLUMNS} minWidth={620} bordered>
        {body}
      </DataTable>
      {readOnly ? null : (
        <StepUpPasswordField
          value={password}
          onChangeText={setPassword}
          editable={!remove.isPending}
          required={passwordRequired}
        />
      )}
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
    </View>
  )
}

function AddPasskey() {
  const options = usePasskeyRegisterOptions()
  const verify = usePasskeyRegisterVerify()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [ceremonyBusy, setCeremonyBusy] = useState(false)

  const busy = options.isPending || verify.isPending || ceremonyBusy

  const onAdd = useCallback(() => {
    setMessage(null)
    setCeremonyBusy(true)
    options
      .run({ password: optionalPassword(password) })
      .then(async (started) => {
        setPasswordRequired(securityActionNeedsPassword(started))
        if (!started.ok) {
          setMessage(securityActionMessage(started))
          return
        }
        const ceremony = await registerPasskey(started.value.options)
        if (!ceremony.supported) {
          setMessage(PASSKEY_WEB_ONLY_NOTE)
          return
        }
        const saved = await verify.run({
          challenge: started.value.challenge,
          name: resolvePasskeyName(name),
          credential: ceremony.credential,
        })
        setMessage(securityActionMessage(saved))
        if (saved.ok) {
          setName('')
          setPassword('')
        }
      })
      .catch((err: unknown) => {
        setMessage(
          err instanceof Error ? err.message : 'Passkey registration failed',
        )
      })
      .finally(() => {
        setCeremonyBusy(false)
      })
  }, [name, options, password, verify])

  return (
    <View style={styles.addCard}>
      <TextField
        label="Passkey name"
        hint="Something you will recognise later, like “Work laptop”."
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
        editable={!busy}
      />
      <StepUpPasswordField
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        required={passwordRequired}
      />
      <ButtonRow>
        <Button
          label="Add a passkey"
          variant="primary"
          busy={busy}
          busyLabel="Waiting for passkey…"
          onPress={onAdd}
        />
      </ButtonRow>
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  addCard: {
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
})
