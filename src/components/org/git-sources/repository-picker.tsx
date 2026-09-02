import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { FormSelect } from '@/components/org/form-select'
import { DeployKeySource } from '@/components/org/git-sources/deploy-key-source'
import { Button, FormField, InlineNotice, LoadingState, Select } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  type ForgeSummary,
  type GitConnectionRecord,
  type GitRepositorySummary,
  type RepositoryRecord,
} from '@/lib/instance-api'
import { useForges } from '@/lib/queries/admin'
import {
  useAttachRepository,
  useGitConnections,
  useConnectionRepositories,
  useRepositories,
} from '@/lib/queries/releases'
import { repositoryLabel } from '@/lib/repository-label'
import { spacing } from '@/lib/theme'

/**
 * Pick a repository: what the organization already holds, or something new.
 *
 * Three lanes, always presented together rather than gated behind each other,
 * because each covers a real starting point:
 *
 * 1. **Connected repositories** — a searchable select over the org's existing
 *    `repository` rows. A repository added once (on another project, or on the
 *    org Repositories screen) is pickable directly; requiring a Git App to see
 *    it again was the bug this lane fixes.
 * 2. **Browse a connected account** — **application → account → repository**.
 *    That hierarchy is not decoration: an operator with two GitHub Apps, each
 *    installed on several accounts, cannot tell two `acme/api` repositories
 *    apart from a flat list. A GitHub installation is scoped to exactly one
 *    account, so `connection.accountLogin` *is* the owner for every repository
 *    it returns, and `forgeId` on the connection gives the top level. Choosing
 *    one resolves it through `POST /repositories/attach` — idempotent, so
 *    picking the same repository from a second project reuses the first
 *    project's binding rather than creating a rival one with its own
 *    auto-deploy policy.
 * 3. **Clone URL / add an app** — quiet ghost actions at the bottom, not an
 *    alarm-toned empty state: missing a Git App is a normal starting point,
 *    not an error to warn about.
 */
export function RepositoryPicker({
  orgId,
  disabled = false,
  onPick,
  onNeedsApp,
  onCloneUrlLaneChange,
}: Readonly<{
  orgId: string
  disabled?: boolean
  /**
   * Receives the resolved `source.id` once the repository is bound. The summary
   * is `null` on the deploy-key lane, where the instance never saw the provider
   * — all it was given is a clone URL. The attached row is passed when attach
   * fetched it, so callers that gate on `useRepositories()` do not wait on a
   * list that still lacks the new id. `reused` is true when an existing binding
   * answered a lane that *creates* bindings — both are idempotent — so callers
   * can say the repository was already connected instead of implying a new row
   * appeared. Picking from the connected-repositories lane passes `false`:
   * choosing an existing row on purpose is not news worth a notice.
   */
  onPick: (
    sourceId: string,
    repository: GitRepositorySummary | null,
    record?: RepositoryRecord,
    reused?: boolean,
  ) => void
  /** Nothing to pick from yet — the caller decides where to send the operator. */
  onNeedsApp?: () => void
  /**
   * Fires whenever the clone-URL lane opens or closes, including once on
   * mount. A caller with its own footer (the project-create wizard) uses this
   * to hide its Continue/Back while the lane owns the screen — that lane ends
   * in its own Connect and Back, and a wizard footer stacked on top of those
   * is what read as sloppy.
   */
  onCloneUrlLaneChange?: (open: boolean) => void
}>) {
  const appsQuery = useForges('org')
  const connectionsQuery = useGitConnections(orgId, { enabled: orgId.length > 0 })
  const repositoriesQuery = useRepositories(orgId)
  const attach = useAttachRepository(orgId)

  const [deployKeyLane, setDeployKeyLane] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reports on mount too (the effect runs once with the initial `false`), so a
  // caller's stale "lane open" from a previous mount is corrected rather than
  // left stuck hiding its own footer.
  useEffect(() => {
    onCloneUrlLaneChange?.(deployKeyLane)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCloneUrlLaneChange is a setState setter, stable enough not to re-run on
  }, [deployKeyLane])

  const apps = useMemo(() => appsQuery.data ?? [], [appsQuery.data])
  const connections = useMemo(
    () => connectionsQuery.data?.connections ?? [],
    [connectionsQuery.data],
  )
  const connected = useMemo(
    () => repositoriesQuery.data?.repositories ?? [],
    [repositoriesQuery.data],
  )
  // Two rows can share an `owner/repo` label across hosts; the URL on the
  // detail line is what tells them apart, and the filter matches it too.
  const connectedOptions = useMemo(
    () =>
      connected.map((row) => ({
        value: row.id,
        label: repositoryLabel(row),
        detail: row.repositoryUrl,
      })),
    [connected],
  )

  /** Only apps that actually have a connected account can offer repositories. */
  const usableApps = useMemo(
    () => apps.filter((app) => connections.some((row) => row.forgeId === app.id)),
    [apps, connections],
  )

  const pickConnected = (id: string | null) => {
    const row = connected.find((entry) => entry.id === id)
    if (row) onPick(row.id, null, row, false)
  }

  const attachAndPick = (connectionId: string, repo: GitRepositorySummary) => {
    setError(null)
    // Resolve to a repository row *before* the caller saves anything that names it:
    // an unknown sourceId fails the compose lint outright.
    void attach
      .run({
        connectionId,
        repositoryExternalId: repo.id,
        repositoryUrl: repo.cloneUrl ?? '',
        defaultBranch: repo.defaultBranch,
      })
      .then((result) => {
        if (!result.ok) {
          if (result.error) setError(result.error)
          return
        }
        onPick(result.value.id, repo, result.value.repository, result.value.reused)
      })
  }

  // A self-hosted GitLab, a plain SSH remote, or any public repository has no
  // App to enumerate, so the clone-URL lane is offered beside the App lane
  // rather than behind it. It covers both access shapes: anonymous for a public
  // repository, a generated deploy key for a private one.
  if (deployKeyLane) {
    return (
      <DeployKeySource
        orgId={orgId}
        disabled={disabled}
        onConnect={(sourceId, record, reused) => onPick(sourceId, null, record, reused)}
        onCancel={() => setDeployKeyLane(false)}
      />
    )
  }

  if (
    appsQuery.isLoading || connectionsQuery.isLoading ||
    repositoriesQuery.isLoading
  ) {
    return <LoadingState label="Loading repositories…" />
  }

  const attaching = attach.isPending
  const busy = disabled || attaching
  const hasConnected = connectedOptions.length > 0
  const hasApps = usableApps.length > 0

  return (
    <View style={styles.root}>
      {error ? <InlineNotice tone="warning" title="Could not attach" body={error} /> : null}

      {hasConnected
        ? (
          <FormField
            label="Connected repositories"
            hint="Repositories this organization already uses."
          >
            <Select
              value={null}
              options={connectedOptions}
              placeholder="Pick a connected repository…"
              searchPlaceholder="Search repositories"
              mono
              disabled={busy}
              accessibilityLabel="Connected repository"
              onChange={pickConnected}
            />
          </FormField>
        )
        : null}

      {hasApps && hasConnected
        ? (
          <Text style={panelStyles.muted}>
            Or browse a connected account for a new one:
          </Text>
        )
        : null}

      {hasApps
        ? (
          <BrowseAccountsLane
            orgId={orgId}
            apps={usableApps}
            connections={connections}
            busy={busy}
            attaching={attaching}
            onPickRepository={attachAndPick}
          />
        )
        : null}

      {!hasApps && !hasConnected
        ? (
          <Text style={panelStyles.muted}>
            Nothing is connected yet — paste a clone URL below, or add a Git
            application to browse the repositories its account can read.
          </Text>
        )
        : null}

      <View style={styles.actions}>
        <Button
          label="Use a clone URL instead"
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={() => setDeployKeyLane(true)}
        />
        {onNeedsApp
          ? (
            <Button
              label={apps.length === 0
                ? 'Add a GitHub or GitLab app'
                : 'Manage Git sources'}
              variant="ghost"
              size="sm"
              disabled={busy}
              onPress={onNeedsApp}
            />
          )
          : null}
      </View>
    </View>
  )
}

/**
 * The **application → account → repository** browse lane. Single-option levels
 * collapse so the common setup is one click, not three; choosing a repository
 * hands the (connection, summary) pair up for the parent to attach.
 */
function BrowseAccountsLane({
  orgId,
  apps,
  connections,
  busy,
  attaching,
  onPickRepository,
}: Readonly<{
  orgId: string
  /** Already filtered to apps with at least one connected account. */
  apps: ForgeSummary[]
  connections: GitConnectionRecord[]
  busy: boolean
  attaching: boolean
  onPickRepository: (connectionId: string, repository: GitRepositorySummary) => void
}>) {
  const [appId, setAppId] = useState('')
  const [connectionId, setConnectionId] = useState('')

  const accounts = useMemo(
    () => connections.filter((row) => row.forgeId === appId && !row.suspended),
    [connections, appId],
  )

  // Collapse the single-option cases so the common setup is one click, not three.
  useEffect(() => {
    if (!appId && apps.length === 1) setAppId(apps[0]!.id)
  }, [appId, apps])
  useEffect(() => {
    if (accounts.length === 1) setConnectionId(accounts[0]!.id)
    else if (!accounts.some((row) => row.id === connectionId)) setConnectionId('')
  }, [accounts, connectionId])

  const reposQuery = useConnectionRepositories(orgId, connectionId, {
    enabled: connectionId.length > 0,
  })
  const repositories = reposQuery.data?.repositories ?? []

  const pick = (repositoryExternalId: string) => {
    const repo = repositories.find((entry) => entry.id === repositoryExternalId)
    if (repo) onPickRepository(connectionId, repo)
  }

  return (
    <>
      <FormField label="Application">
        <FormSelect
          value={appId}
          options={apps.map((app) => ({
            value: app.id,
            label: app.organizationId === null ? `${app.name} (shared)` : app.name,
          }))}
          placeholder="Select an application…"
          disabled={busy}
          accessibilityLabel="Git application"
          onChange={setAppId}
        />
      </FormField>

      {appId
        ? (
          <FormField label="Account">
            <FormSelect
              value={connectionId}
              options={accounts.map((row) => ({
                value: row.id,
                label: row.accountLogin ?? row.externalInstallationId,
              }))}
              placeholder="Select an account…"
              disabled={busy}
              accessibilityLabel="GitHub account"
              onChange={setConnectionId}
            />
          </FormField>
        )
        : null}

      {connectionId
        ? (
          <FormField
            label="Repository"
            hint={reposQuery.isLoading ? 'Loading repositories…' : undefined}
          >
            <FormSelect
              value=""
              options={repositories.map((repo) => ({
                value: repo.id,
                label: repo.private ? `${repo.fullName} (private)` : repo.fullName,
              }))}
              placeholder={attaching ? 'Attaching…' : 'Select a repository…'}
              disabled={busy || reposQuery.isLoading}
              mono
              accessibilityLabel="Repository"
              onChange={pick}
            />
          </FormField>
        )
        : null}
    </>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
})
