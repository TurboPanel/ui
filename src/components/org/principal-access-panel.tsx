import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Button,
  ConfirmButton,
  CopyButton,
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
  useDisablePrincipalPassword,
  usePrincipalSshKeys,
  useSetPrincipalPassword,
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
      return 'Cannot sign in. Credentials stay on file, so access can be restored without re-adding them.'
  }
}

export function PrincipalAccessPanel({
  orgId,
  projectId,
  principalId,
  username,
  access,
  passwordAuth,
  canManage,
  onChangeAccess,
  savingAccess,
}: Readonly<{
  orgId: string
  projectId: string
  principalId: string
  username: string
  access: PrincipalAccessLevel
  passwordAuth: boolean
  canManage: boolean
  onChangeAccess: (next: PrincipalAccessLevel) => void
  savingAccess: boolean
}>) {
  const keysQuery = usePrincipalSshKeys(orgId, projectId, principalId)

  const keys = orEmptyArray(keysQuery.data?.keys)
  const loading = keysQuery.isLoading

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
          hunting through sshd logs: "set to Shell but holds no credential" is
          not the same as "set to No access". */}
      {access !== 'none' && keys.length === 0 && !passwordAuth && !loading ? (
        <InlineNotice
          tone="warning"
          title="No credentials yet"
          body={`${username} cannot sign in until a key is added or password sign-in is enabled.`}
        />
      ) : null}

      {loading ? <LoadingState /> : null}
      <PrincipalKeysSection
        orgId={orgId}
        projectId={projectId}
        principalId={principalId}
        keys={keys}
        loading={loading}
        canManage={canManage}
      />
      <PrincipalPasswordSection
        orgId={orgId}
        projectId={projectId}
        principalId={principalId}
        username={username}
        passwordAuth={passwordAuth}
        canManage={canManage}
      />
    </View>
  )
}

type PrincipalKey = {
  id: string
  name: string
  fingerprint: string
  keyType: string
  bits: number | null
  comment: string | null
}

/**
 * Keys on file as a compact list; the paste form stays hidden behind one
 * "Add key" action, because most visits to this row are not about enrolling a
 * new device.
 */
function PrincipalKeysSection({
  orgId,
  projectId,
  principalId,
  keys,
  loading,
  canManage,
}: Readonly<{
  orgId: string
  projectId: string
  principalId: string
  keys: readonly PrincipalKey[]
  loading: boolean
  canManage: boolean
}>) {
  const addKey = useAddPrincipalSshKey(orgId, projectId, principalId)
  const removeKey = useDeletePrincipalSshKey(orgId, projectId, principalId)

  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [error, setError] = useState<string | null>(null)

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
    setFormOpen(false)
  }

  const handleRemove = async (keyId: string) => {
    setError(null)
    const result = await removeKey.run(keyId)
    if (!result.ok) {
      setError(removeKey.actionError ?? 'That key could not be removed.')
    }
  }

  return (
    <View style={styles.credentialBlock}>
      <View style={styles.credentialHeader}>
        <Text style={panelStyles.detailLabel}>
          SSH keys{keys.length > 0 ? ` · ${keys.length}` : ''}
        </Text>
        {canManage && !formOpen ? (
          <Button
            label="Add key"
            variant="secondary"
            size="sm"
            onPress={() => setFormOpen(true)}
          />
        ) : null}
      </View>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {!loading && keys.length === 0 && !formOpen ? (
        <Text style={panelStyles.muted}>No keys on file.</Text>
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

      {canManage && formOpen ? (
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
          <View style={styles.formActions}>
            <Button
              label="Add key"
              busyLabel="Adding…"
              size="sm"
              busy={addKey.isPending}
              onPress={() => {
                void handleAdd()
              }}
            />
            <Button
              label="Cancel"
              variant="secondary"
              size="sm"
              disabled={addKey.isPending}
              onPress={() => {
                setFormOpen(false)
                setError(null)
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}

/**
 * Password sign-in for one account.
 *
 * The server stores only the crypt hash, so a generated password is shown
 * exactly once, here, and can only ever be rotated — never read back. Custom
 * passwords are accepted for the operator who must match an existing tool,
 * but Generate is the offered default.
 */
function PrincipalPasswordSection({
  orgId,
  projectId,
  principalId,
  username,
  passwordAuth,
  canManage,
}: Readonly<{
  orgId: string
  projectId: string
  principalId: string
  username: string
  passwordAuth: boolean
  canManage: boolean
}>) {
  const setPassword = useSetPrincipalPassword(orgId, projectId, principalId)
  const disablePassword = useDisablePrincipalPassword(
    orgId,
    projectId,
    principalId,
  )

  const [formOpen, setFormOpen] = useState(false)
  const [customPassword, setCustomPassword] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  const busy = setPassword.isPending || disablePassword.isPending
  const hasCustomPassword = customPassword.length > 0
  const submitLabel = hasCustomPassword ? 'Set password' : 'Generate'
  const submitBody = hasCustomPassword ? { password: customPassword } : {}

  const submit = async (body: { password?: string }) => {
    setError(null)
    const result = await setPassword.run(body)
    if (!result.ok) {
      setError(setPassword.actionError ?? 'The password was not accepted.')
      return
    }
    setGeneratedPassword(result.value.generatedPassword ?? null)
    setCustomPassword('')
    setFormOpen(false)
  }

  const handleDisable = async () => {
    setError(null)
    setGeneratedPassword(null)
    const result = await disablePassword.run()
    if (!result.ok) {
      setError(
        disablePassword.actionError ?? 'Password sign-in could not be disabled.',
      )
    }
  }

  return (
    <View style={styles.credentialBlock}>
      <View style={styles.credentialHeader}>
        <Text style={panelStyles.detailLabel}>
          Password sign-in{passwordAuth ? ' · on' : ''}
        </Text>
        {canManage && !formOpen ? (
          <View style={styles.formActions}>
            <Button
              label={passwordAuth ? 'Rotate' : 'Enable'}
              variant="secondary"
              size="sm"
              disabled={busy}
              onPress={() => {
                setGeneratedPassword(null)
                setFormOpen(true)
              }}
            />
            {passwordAuth ? (
              <ConfirmButton
                label="Disable"
                prompt={`Disable password sign-in for ${username}?`}
                confirmLabel="Disable"
                size="sm"
                busy={disablePassword.isPending}
                onConfirm={() => {
                  void handleDisable()
                }}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {!passwordAuth && !formOpen && generatedPassword === null ? (
        <Text style={panelStyles.muted}>
          Off — this account signs in with keys only.
        </Text>
      ) : null}

      {generatedPassword !== null ? (
        <>
          <View style={styles.generatedRow}>
            <MonoText style={styles.generatedPassword}>
              {generatedPassword}
            </MonoText>
            <CopyButton value={generatedPassword} />
            <Button
              label="Done"
              variant="secondary"
              size="sm"
              onPress={() => setGeneratedPassword(null)}
            />
          </View>
          <Text style={panelStyles.muted}>
            Shown once — only a hash is stored. Copy it now; later you can only
            rotate it.
          </Text>
        </>
      ) : null}

      {canManage && formOpen ? (
        <View style={styles.form}>
          <TextField
            label="Password"
            value={customPassword}
            onChangeText={setCustomPassword}
            placeholder="Leave empty to generate"
            hint="8–128 characters. Leave empty and Generate makes a strong one, shown once."
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <View style={styles.formActions}>
            <Button
              label={submitLabel}
              busyLabel="Saving…"
              size="sm"
              busy={setPassword.isPending}
              onPress={() => {
                void submit(submitBody)
              }}
            />
            <Button
              label="Cancel"
              variant="secondary"
              size="sm"
              disabled={setPassword.isPending}
              onPress={() => {
                setFormOpen(false)
                setCustomPassword('')
                setError(null)
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  credentialBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  credentialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  generatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  generatedPassword: {
    color: colors.text,
    fontSize: 14,
  },
})
