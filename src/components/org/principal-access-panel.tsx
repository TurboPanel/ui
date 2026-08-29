import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Button,
  ConfirmButton,
  EmptyState,
  InlineNotice,
  LoadingState,
  MonoText,
  SegmentedControl,
  TextField,
  type SegmentedOption,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { PrincipalAccessLevel } from '@/lib/instance-api'
import {
  useAddPrincipalSshKey,
  useDeletePrincipalSshKey,
  usePrincipalSshKeys,
} from '@/lib/queries/projects'
import { orEmptyArray } from '@/lib/or-empty-array'
import { colors, spacing } from '@/lib/theme'

/**
 * Three levels, and only three, so this is a segmented control rather than a
 * picker.
 *
 * The operator picks a *level*; the server stores it as the account's shell.
 * There is deliberately no shell field anywhere in this UI — a filesystem path
 * is an implementation detail of the decision, not the decision, and offering
 * one would put an arbitrary executable path into a security control.
 */
const ACCESS_OPTIONS: readonly SegmentedOption<PrincipalAccessLevel>[] = [
  { value: 'none', label: 'No access' },
  { value: 'sftp', label: 'Files only' },
  { value: 'shell', label: 'Shell' },
]

function accessExplanation(level: PrincipalAccessLevel): string {
  switch (level) {
    case 'shell':
      return 'Sign in over SSH and transfer files. Commands run as this user, so it can only run the runtimes granted above.'
    case 'sftp':
      return 'Transfer files over SFTP. No shell, no port forwarding.'
    default:
      return 'Cannot sign in. Keys stay on file, so access can be restored without re-adding them.'
  }
}

export function PrincipalAccessPanel({
  orgId,
  projectId,
  principalId,
  username,
  access,
  canManage,
  onChangeAccess,
  savingAccess,
}: Readonly<{
  orgId: string
  projectId: string
  principalId: string
  username: string
  access: PrincipalAccessLevel
  canManage: boolean
  onChangeAccess: (next: PrincipalAccessLevel) => void
  savingAccess: boolean
}>) {
  const keysQuery = usePrincipalSshKeys(orgId, projectId, principalId)
  const addKey = useAddPrincipalSshKey(orgId, projectId, principalId)
  const removeKey = useDeletePrincipalSshKey(orgId, projectId, principalId)

  const [name, setName] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const keys = orEmptyArray(keysQuery.data?.keys)
  const loading = keysQuery.isLoading

  const handleAdd = async () => {
    const trimmedName = name.trim()
    const trimmedKey = publicKey.trim()
    if (!trimmedName || !trimmedKey) {
      setError('A name and a public key are both required.')
      return
    }
    setError(null)
    const result = await addKey.run({
      name: trimmedName,
      publicKey: trimmedKey,
    })
    if (!result.ok) {
      // The server's own sentence, not a generic "invalid key": a pasted
      // options field, a DSA key, and the private half by mistake each have a
      // different fix, and the API says which.
      setError(addKey.actionError ?? 'That key was not accepted.')
      return
    }
    setName('')
    setPublicKey('')
  }

  const handleRemove = async (keyId: string) => {
    setError(null)
    const result = await removeKey.run(keyId)
    if (!result.ok) {
      setError(removeKey.actionError ?? 'That key could not be removed.')
    }
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.detailLabel}>Access</Text>
      <SegmentedControl
        options={ACCESS_OPTIONS}
        value={access}
        onChange={onChangeAccess}
        disabled={!canManage || savingAccess}
        accessibilityLabel={`SSH access for ${username}`}
      />
      <Text style={panelStyles.muted}>{accessExplanation(access)}</Text>

      {/* Two different states, and conflating them is what sends an operator
          hunting through sshd logs: "set to Shell but holds no key" is not the
          same as "set to No access". */}
      {access !== 'none' && keys.length === 0 && !loading ? (
        <InlineNotice
          tone="warning"
          title="No keys yet"
          body={`${username} cannot sign in until a key is added. Password sign-in is off for these accounts.`}
        />
      ) : null}

      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {loading ? <LoadingState /> : null}
      {!loading && keys.length === 0 ? (
        <EmptyState title="No keys on file." />
      ) : null}

      {keys.map((key) => (
        <View key={key.id} style={styles.keyRow}>
          <View style={styles.keyText}>
            <Text style={panelStyles.detailTitle}>{key.name}</Text>
            {/* The fingerprint, not the key body: it is what `ssh-keygen -lf`
                prints, so the operator can compare it against their agent. */}
            <MonoText style={styles.fingerprint}>{key.fingerprint}</MonoText>
            <Text style={panelStyles.muted}>
              {key.keyType}
              {key.bits ? ` · ${key.bits} bits` : ''}
              {key.comment ? ` · ${key.comment}` : ''}
            </Text>
          </View>
          {canManage ? (
            <ConfirmButton
              label="Remove"
              // The armed prompt carries which key, so the confirmation names
              // the thing being revoked rather than repeating "Are you sure?"
              // once per row.
              prompt={`Remove ${key.name}?`}
              confirmLabel="Remove"
              size="sm"
              busy={removeKey.isPending}
              onConfirm={() => {
                void handleRemove(key.id)
              }}
            />
          ) : null}
        </View>
      ))}

      {canManage ? (
        <View style={styles.form}>
          <TextField
            label="Key name"
            value={name}
            onChangeText={setName}
            placeholder="Alice's laptop"
            autoCapitalize="none"
          />
          <TextField
            label="Public key"
            value={publicKey}
            onChangeText={setPublicKey}
            placeholder="ssh-ed25519 AAAA…"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <Text style={panelStyles.muted}>
            Paste the contents of your <MonoText>.pub</MonoText> file — the
            public half. Keys are managed here, not in the account&apos;s own{' '}
            <MonoText>~/.ssh</MonoText>, so removing one here removes it on the
            server.
          </Text>
          <Button
            label="Add key"
            busyLabel="Adding…"
            size="sm"
            busy={addKey.isPending}
            onPress={() => {
              void handleAdd()
            }}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  keyText: {
    flex: 1,
    gap: 2,
  },
  fingerprint: {
    color: colors.textDim,
  },
  form: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
})
