import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { FormSelect } from '@/components/org/form-select'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  CopyButton,
  FormField,
  InlineNotice,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import type { RepositoryRecord } from '@/lib/instance-api'
import { useCreateGitlabDeployKey, useCreateRepository } from '@/lib/queries/releases'
import { spacing } from '@/lib/theme'

/** `git@host:owner/repo.git` — the scp-like form git accepts. */
const SCP_LIKE_SSH_RE = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s]+$/

/**
 * Mirror of the instance's `isSshCloneUrl`, kept here so the form can decide
 * which lanes are open before it posts anything.
 */
function isSshCloneUrl(url: string): boolean {
  return url.startsWith('ssh://') || SCP_LIKE_SSH_RE.test(url)
}

/**
 * How the instance will authenticate the clone.
 *
 * `public` is a real binding, not an absence of one: the row is written with a
 * null `secret_id` and deploy-prep sends no credential, which is exactly what
 * an anonymous https clone needs.
 */
type RepositoryAccess = 'public' | 'private'

type GeneratedDeployKey = {
  secretId: string
  publicKey: string
}

/**
 * The clone-URL lane: paste a URL and bind the repository, with or without a key.
 *
 * This is the escape hatch from the App flow, and it is not going away with it.
 * A self-hosted GitLab, a Gitea, or a plain SSH remote has no App to install and
 * no installation to enumerate — the only thing the instance can be given is a
 * URL and, when the repository is private, a key that may read it.
 *
 * **Access is a choice, not an assumption.** A public repository clones
 * anonymously — `repository.secret_id` stays null and deploy-prep sends no
 * credential at all (`deploy-sources.ts`, lane 2) — so requiring a deploy key
 * for one is asking the operator to add a key to a repository that does not
 * need it, on a provider that may not even offer deploy keys for public repos.
 * An **ssh** URL is the one case with no choice: publickey auth has no
 * anonymous form, so picking one forces the key lane
 * (`source_ssh_requires_credential` is what the API answers otherwise).
 *
 * On the key lane the order is the point. The key is generated **first**, so the
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
  /**
   * Receives the resolved `source.id` and its row once the binding exists —
   * the row, not just the id, is what lets the picked-repository card show
   * the same label and access badge the connected-account lane shows
   * immediately, rather than waiting on a list refetch. `reused` is true when
   * the organization already held this clone URL — the create is idempotent,
   * so no second row was made — and callers say so rather than letting the
   * operator believe a duplicate now exists.
   */
  onConnect: (sourceId: string, record: RepositoryRecord, reused?: boolean) => void
  onCancel?: () => void
}>) {
  const [provider, setProvider] = useState<'gitlab' | 'git'>('git')
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [access, setAccess] = useState<RepositoryAccess>('public')
  const [deployKey, setDeployKey] = useState<GeneratedDeployKey | null>(null)
  const createDeployKeyMutation = useCreateGitlabDeployKey(orgId)
  const createRepositoryMutation = useCreateRepository(orgId)

  const trimmedUrl = repositoryUrl.trim()
  // An ssh remote has no anonymous lane, so the choice collapses to `private`
  // the moment one is typed — rather than letting the operator submit a pair
  // the API will reject with `source_ssh_requires_credential`.
  const sshOnly = isSshCloneUrl(trimmedUrl)
  const effectiveAccess: RepositoryAccess = sshOnly ? 'private' : access
  const busy = disabled || createDeployKeyMutation.isPending ||
    createRepositoryMutation.isPending

  const generate = async () => {
    if (trimmedUrl.length === 0) return
    const created = await createDeployKeyMutation.run({ name: trimmedUrl })
    if (!created.ok) return
    setDeployKey({
      secretId: created.value.secretId,
      publicKey: created.value.publicKey,
    })
  }

  const connect = async () => {
    if (trimmedUrl.length === 0) return
    if (effectiveAccess === 'private' && !deployKey) return
    const created = await createRepositoryMutation.run({
      // The public lane is generic-git by definition: a `gitlab` row with
      // neither a connection nor a key has no way to reach the GitLab API, and
      // the instance rejects that pair (`source_installation_required`).
      provider: effectiveAccess === 'public' ? 'git' : provider,
      repositoryUrl: trimmedUrl,
      // Null, not omitted: a public repository binds with no credential at all
      // and clones anonymously. The default branch is always detected on
      // connect — github.com over anonymous REST, other remotes via the daemon.
      secretId: effectiveAccess === 'private' ? deployKey!.secretId : null,
      defaultBranch: null,
    })
    if (!created.ok) return
    onConnect(created.value.id, created.value.repository, created.value.reused)
  }

  return (
    <View style={styles.block}>
      <TextField
        label="Clone URL"
        value={repositoryUrl}
        onChangeText={setRepositoryUrl}
        editable={!busy && deployKey === null}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://github.com/acme/app.git"
        mono
        hint="An https or ssh URL. An ssh URL always needs a deploy key."
      />

      <FormField
        label="Access"
        hint={effectiveAccess === 'public'
          ? 'Cloned anonymously — nothing to add on the provider.'
          : 'A read-only deploy key is generated below and added to the repository.'}
      >
        <SegmentedControl
          options={[
            { value: 'public', label: 'Public', disabled: sshOnly },
            { value: 'private', label: 'Private' },
          ]}
          value={effectiveAccess}
          disabled={busy || deployKey !== null}
          accessibilityLabel="Repository access"
          onChange={setAccess}
        />
      </FormField>

      {sshOnly && access === 'public'
        ? (
          <InlineNotice
            title="ssh needs a key"
            body="An ssh remote has no anonymous clone, so this one uses a deploy key. Paste the https URL instead to clone a public repository without one."
          />
        )
        : null}

      {effectiveAccess === 'private'
        ? (
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
        )
        : null}

      <DeployKeyConnectAction
        access={effectiveAccess}
        deployKey={deployKey}
        busy={busy}
        urlEmpty={trimmedUrl.length === 0}
        generatePending={createDeployKeyMutation.isPending}
        connectPending={createRepositoryMutation.isPending}
        onGenerate={() => void generate()}
        onConnect={() => void connect()}
      />

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
          <Text style={panelStyles.error}>
            {createDeployKeyMutation.actionError}
          </Text>
        )
        : null}
      {createRepositoryMutation.actionError
        ? <Text style={panelStyles.error}>{createRepositoryMutation.actionError}</Text>
        : null}
    </View>
  )
}

/**
 * Public clones connect immediately. Private ones generate the key first so the
 * public half is on screen before the binding exists.
 */
function DeployKeyConnectAction({
  access,
  deployKey,
  busy,
  urlEmpty,
  generatePending,
  connectPending,
  onGenerate,
  onConnect,
}: Readonly<{
  access: RepositoryAccess
  deployKey: GeneratedDeployKey | null
  busy: boolean
  urlEmpty: boolean
  generatePending: boolean
  connectPending: boolean
  onGenerate: () => void
  onConnect: () => void
}>) {
  if (access === 'public') {
    return (
      <Button
        label="Connect repo to organization"
        busyLabel="Connecting…"
        variant="primary"
        busy={connectPending}
        disabled={busy || urlEmpty}
        onPress={onConnect}
      />
    )
  }
  if (deployKey === null) {
    return (
      <Button
        label="Generate a read-only deploy key"
        busyLabel="Generating deploy key…"
        variant="primary"
        busy={generatePending}
        disabled={busy || urlEmpty}
        onPress={onGenerate}
      />
    )
  }
  return (
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
        label="I've added the key — connect repo to organization"
        busyLabel="Connecting…"
        variant="primary"
        busy={connectPending}
        disabled={busy}
        onPress={onConnect}
      />
    </>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
})
