import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { FormSelect } from '@/components/org/form-select'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { Button, CopyButton, FormField, InlineNotice, TextField } from '@/components/ui'
import { useCreateGitlabDeployKey, useCreateSource } from '@/lib/queries/releases'
import { spacing } from '@/lib/theme'

/**
 * The deploy-key lane: paste a clone URL, mint a key, bind the repository.
 *
 * This is the escape hatch from the App flow, and it is not going away with it.
 * A self-hosted GitLab, a Gitea, or a plain SSH remote has no App to install and
 * no installation to enumerate — the only thing the instance can be given is a
 * URL and a key that may read it.
 *
 * Two steps, and the order is the point. The key is generated **first**, so the
 * public half is on screen before the binding exists — an operator who created
 * the binding first would have one that cannot clone until they go and find the
 * key again, and the public half is only ever returned once.
 *
 * A generated key is also the recommended path over pasting one: it belongs to
 * the project rather than to a person, so nobody leaving the organization
 * breaks its deploys, and the private half never exists outside the instance.
 */
export function DeployKeySource({
  orgId,
  disabled = false,
  onConnect,
  onCancel,
}: Readonly<{
  orgId: string
  disabled?: boolean
  /** Receives the resolved `source.id` once the binding exists. */
  onConnect: (sourceId: string) => void
  onCancel?: () => void
}>) {
  const [provider, setProvider] = useState<'gitlab' | 'git'>('git')
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('')
  const [deployKey, setDeployKey] = useState<
    { credentialId: string; publicKey: string } | null
  >(null)
  const createDeployKeyMutation = useCreateGitlabDeployKey(orgId)
  const createSourceMutation = useCreateSource(orgId)

  const trimmedUrl = repositoryUrl.trim()
  const busy = disabled || createDeployKeyMutation.isPending ||
    createSourceMutation.isPending

  const generate = async () => {
    if (trimmedUrl.length === 0) return
    const created = await createDeployKeyMutation.run({ name: trimmedUrl })
    if (!created.ok) return
    setDeployKey({
      credentialId: created.value.credentialId,
      publicKey: created.value.publicKey,
    })
  }

  const connect = async () => {
    if (!deployKey || trimmedUrl.length === 0) return
    const created = await createSourceMutation.run({
      provider,
      repositoryUrl: trimmedUrl,
      credentialId: deployKey.credentialId,
      defaultBranch: defaultBranch.trim().length > 0 ? defaultBranch.trim() : null,
    })
    if (!created.ok) return
    onConnect(created.value.id)
  }

  return (
    <View style={styles.block}>
      <FormField label="Provider">
        <FormSelect
          value={provider}
          options={[
            { value: 'git', label: 'Generic Git' },
            { value: 'gitlab', label: 'GitLab' },
          ]}
          placeholder="Select a provider…"
          disabled={busy || deployKey !== null}
          accessibilityLabel="Provider"
          onChange={(value) => setProvider(value === 'gitlab' ? 'gitlab' : 'git')}
        />
      </FormField>

      <TextField
        label="Clone URL"
        value={repositoryUrl}
        onChangeText={setRepositoryUrl}
        editable={!busy && deployKey === null}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="git@gitlab.com:group/app.git"
        mono
        hint="An https or ssh URL. An ssh URL needs the deploy key below; an https URL works without one only for a public repository."
      />

      <TextField
        label="Default branch"
        value={defaultBranch}
        onChangeText={setDefaultBranch}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="main"
        mono
        hint="Leave empty to watch every branch this repository pushes."
      />

      {deployKey === null
        ? (
          <Button
            label="Generate a read-only deploy key"
            busyLabel="Generating deploy key…"
            variant="primary"
            busy={createDeployKeyMutation.isPending}
            disabled={busy || trimmedUrl.length === 0}
            onPress={() => void generate()}
          />
        )
        : (
          <>
            <TextField
              label="Deploy key (public half)"
              labelRight={<CopyButton value={deployKey.publicKey} />}
              value={deployKey.publicKey}
              editable={false}
              multiline
              mono
            />
            <InlineNotice
              tone="warning"
              title="Add this key before connecting"
              body="Add it to the project as a read-only Deploy Key — it is shown once and cannot be retrieved again. The private half never leaves this instance."
            />
            <Button
              label="I have added the key — connect"
              busyLabel="Connecting…"
              variant="primary"
              busy={createSourceMutation.isPending}
              disabled={busy}
              onPress={() => void connect()}
            />
          </>
        )}

      {onCancel
        ? (
          <Button
            label="Back"
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={onCancel}
          />
        )
        : null}

      {createDeployKeyMutation.actionError
        ? (
          <Text style={orgPanelStyles.error}>
            {createDeployKeyMutation.actionError}
          </Text>
        )
        : null}
      {createSourceMutation.actionError
        ? <Text style={orgPanelStyles.error}>{createSourceMutation.actionError}</Text>
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
})
