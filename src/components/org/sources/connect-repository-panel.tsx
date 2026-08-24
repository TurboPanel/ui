import { useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { FormSelect } from '@/components/org/form-select'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  Button,
  ButtonRow,
  CopyButton,
  FormField,
  InlineNotice,
  LoadingState,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import {
  githubAppInstallUrl,
  gitlabOauthConnectUrl,
  SOURCE_PROVIDER_OPTIONS,
  type SourceProvider,
  type SourceRecord,
} from '@/lib/instance-api'
import {
  useCreateGitlabDeployKey,
  useCreateSource,
  useGitInstallations,
  useInstallationRepositories,
} from '@/lib/queries/releases'
import { spacing } from '@/lib/theme'

/** `https://github.com/owner/repo(.git)` → `owner/repo`, else the URL itself. */
export function repositoryLabel(row: SourceRecord): string {
  const trimmed = row.repositoryUrl.replace(/\.git$/, '')
  const segments = trimmed.split(/[/:]/).filter((part) => part.length > 0)
  if (segments.length < 2) return row.repositoryUrl
  return `${segments.at(-2)}/${segments.at(-1)}`
}

/**
 * A 302 to the provider's consent page: the operator has to *land* there to
 * approve the grant, so these navigate rather than fetch.
 */
function openProviderConsent(url: string): void {
  Linking.openURL(url).catch(() => {
    // Ignore failures opening the provider consent page.
  })
}

/**
 * Connect a repository to the organization.
 *
 * The `source` row is org-owned on purpose: several services may share one
 * repository, and the auto-deploy policy lives on the row rather than on any
 * compose binding, which stores only its id. This control therefore belongs to
 * the organization's Sources page — a service editor that wants a repository
 * picks an already-connected one.
 *
 * The provider chooses the sub-flow, because the three are genuinely different
 * shapes rather than one form with different labels:
 *
 * - **GitHub App** — pick an installation, then a repository it can already
 *   read. Nothing is typed.
 * - **GitLab** — either the same picker against an OAuth-connected account, or
 *   paste a project URL and mint a read-only deploy key for it.
 * - **Other Git host** — a clone URL plus a deploy key. No provider API exists
 *   to enumerate anything.
 */
export function ConnectRepositoryControl({
  orgId,
  disabled,
  onConnect,
}: Readonly<{
  orgId: string
  disabled: boolean
  onConnect: (sourceId: string) => void
}>) {
  const [provider, setProvider] = useState<SourceProvider>('github')

  return (
    <View style={styles.block}>
      <FormField
        label="Git provider"
        hint={
          SOURCE_PROVIDER_OPTIONS.find((option) => option.value === provider)
            ?.hint
        }
      >
        <SegmentedControl
          options={SOURCE_PROVIDER_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={provider}
          disabled={disabled}
          onChange={setProvider}
          accessibilityLabel="Git provider"
        />
      </FormField>

      {provider === 'git' ? (
        <DeployKeyRepositoryControl
          orgId={orgId}
          provider="git"
          disabled={disabled}
          onConnect={onConnect}
        />
      ) : (
        <InstallationRepositoryControl
          orgId={orgId}
          provider={provider}
          disabled={disabled}
          onConnect={onConnect}
        />
      )}
    </View>
  )
}

/**
 * The picker flow: choose a connection, then a repository it can already read.
 *
 * Shared by GitHub and by an OAuth-connected GitLab account — the repository
 * list is the same shape for both, because the instance narrows each provider's
 * payload to it before answering.
 */
function InstallationRepositoryControl({
  orgId,
  provider,
  disabled,
  onConnect,
}: Readonly<{
  orgId: string
  provider: 'github' | 'gitlab'
  disabled: boolean
  onConnect: (sourceId: string) => void
}>) {
  const [installationId, setInstallationId] = useState('')
  const [useDeployKey, setUseDeployKey] = useState(false)
  const installationsQuery = useGitInstallations(orgId)
  const repositoriesQuery = useInstallationRepositories(orgId, installationId, {
    // Every read mints a short-lived provider credential on the instance — do
    // not spend one until a connection has actually been chosen.
    enabled: installationId.length > 0,
  })
  const createSourceMutation = useCreateSource(orgId)

  const installations = (installationsQuery.data?.installations ?? []).filter(
    (row) => row.provider === provider,
  )
  const repositories = repositoriesQuery.data?.repositories ?? []
  const providerLabel = provider === 'github' ? 'GitHub' : 'GitLab'

  // A GitLab project can also be reached with a deploy key instead of a
  // connection, so an organization with no OAuth grant is not a dead end there.
  if (useDeployKey) {
    return (
      <DeployKeyRepositoryControl
        orgId={orgId}
        provider="gitlab"
        disabled={disabled}
        onConnect={onConnect}
        onBack={() => setUseDeployKey(false)}
      />
    )
  }

  if (installationsQuery.isLoading) {
    return <LoadingState label={`Loading ${providerLabel} connections…`} />
  }

  if (installations.length === 0) {
    return (
      <NoConnectionState
        provider={provider}
        disabled={disabled}
        onUseDeployKey={() => setUseDeployKey(true)}
      />
    )
  }

  const connect = async (repositoryUrl: string, defaultBranch: string | null) => {
    const repo = repositories.find(
      (row) => repositoryCloneUrl(row, provider) === repositoryUrl,
    )
    const created = await createSourceMutation.run({
      provider,
      repositoryUrl,
      installationId,
      defaultBranch,
      // The provider-side id is what webhook matching keys on: a repository can
      // be renamed or moved, and only the id survives it.
      ...(repo?.id ? { repositoryExternalId: repo.id } : {}),
    })
    if (!created.ok) return
    onConnect(created.value.id)
  }

  return (
    <View style={styles.block}>
      <FormField label={`${providerLabel} connection`}>
        <FormSelect
          value={installationId}
          placeholder="Select a connection…"
          options={installations.map((row) => ({
            value: row.id,
            label: row.suspended
              ? `${row.accountLogin ?? row.externalInstallationId} (suspended)`
              : (row.accountLogin ?? row.externalInstallationId),
          }))}
          disabled={disabled}
          accessibilityLabel={`${providerLabel} connection`}
          onChange={setInstallationId}
        />
      </FormField>

      {installationId.length === 0 ? null : (
        <FormField label="Repository">
          {repositoriesQuery.isLoading ? (
            <LoadingState label="Loading repositories…" />
          ) : (
            <FormSelect
              value=""
              placeholder="Select a repository…"
              options={repositories.map((repo) => ({
                value: repositoryCloneUrl(repo, provider),
                label: repo.private
                  ? `${repo.fullName} (private)`
                  : repo.fullName,
              }))}
              disabled={disabled || createSourceMutation.isPending}
              accessibilityLabel="Repository"
              onChange={(cloneUrl) => {
                const repo = repositories.find(
                  (row) => repositoryCloneUrl(row, provider) === cloneUrl,
                )
                void connect(cloneUrl, repo?.defaultBranch ?? null)
              }}
            />
          )}
        </FormField>
      )}

      {provider === 'gitlab' ? (
        <Button
          label="Use a deploy key instead"
          size="sm"
          disabled={disabled}
          onPress={() => setUseDeployKey(true)}
        />
      ) : null}

      {createSourceMutation.actionError ? (
        <Text style={orgPanelStyles.error}>
          {createSourceMutation.actionError}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * No connection for this provider yet.
 *
 * The two providers are not symmetric and the copy must not pretend they are:
 * a GitHub App install is the only way in for GitHub, while GitLab always keeps
 * the deploy-key lane open beside its OAuth grant.
 */
function NoConnectionState({
  provider,
  disabled,
  onUseDeployKey,
}: Readonly<{
  provider: 'github' | 'gitlab'
  disabled: boolean
  onUseDeployKey: () => void
}>) {
  if (provider === 'github') {
    return (
      <InlineNotice
        title="No GitHub account connected yet"
        body="Install the GitHub App on the account or organization that owns the repository, then pick it here."
        actions={
          <Button
            label="Connect GitHub account"
            variant="primary"
            size="sm"
            disabled={disabled}
            onPress={() => openProviderConsent(githubAppInstallUrl())}
          />
        }
      />
    )
  }

  return (
    <InlineNotice
      title="No GitLab account connected yet"
      body="Connect an account over OAuth, or skip it and authorize a single project with a generated read-only deploy key."
      actions={
        <ButtonRow>
          <Button
            label="Connect GitLab account"
            variant="primary"
            size="sm"
            disabled={disabled}
            onPress={() => openProviderConsent(gitlabOauthConnectUrl())}
          />
          <Button
            label="Use a deploy key instead"
            size="sm"
            disabled={disabled}
            onPress={onUseDeployKey}
          />
        </ButtonRow>
      }
    />
  )
}

/** A provider that answered no clone URL still has a conventional one. */
function repositoryCloneUrl(
  repo: Readonly<{ fullName: string; cloneUrl: string | null }>,
  provider: 'github' | 'gitlab',
): string {
  if (repo.cloneUrl) return repo.cloneUrl
  const host = provider === 'github' ? 'github.com' : 'gitlab.com'
  return `https://${host}/${repo.fullName}`
}

/**
 * The deploy-key flow: paste a clone URL, mint a key, add it to the project.
 *
 * Two steps, and the order is the point. The key is generated **first**, so the
 * public half is on screen before the source exists — an operator who creates
 * the source first would have a binding that cannot clone until they go and
 * find the key again, and the public half is only ever returned once.
 *
 * A generated key is also the recommended path over pasting one: it belongs to
 * the project rather than to a person, so nobody leaving the organization
 * breaks its deploys, and the private half never exists outside the instance.
 */
function DeployKeyRepositoryControl({
  orgId,
  provider,
  disabled,
  onConnect,
  onBack,
}: Readonly<{
  orgId: string
  provider: 'gitlab' | 'git'
  disabled: boolean
  onConnect: (sourceId: string) => void
  onBack?: () => void
}>) {
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

      {deployKey === null ? (
        <Button
          label="Generate a read-only deploy key"
          busyLabel="Generating deploy key…"
          variant="primary"
          busy={createDeployKeyMutation.isPending}
          disabled={busy || trimmedUrl.length === 0}
          onPress={() => void generate()}
        />
      ) : (
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

      {onBack ? (
        <Button
          label="Back to connected accounts"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={onBack}
        />
      ) : null}

      {createDeployKeyMutation.actionError ? (
        <Text style={orgPanelStyles.error}>
          {createDeployKeyMutation.actionError}
        </Text>
      ) : null}
      {createSourceMutation.actionError ? (
        <Text style={orgPanelStyles.error}>
          {createSourceMutation.actionError}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
})
