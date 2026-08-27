import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { FormSelect } from '@/components/org/form-select'
import { DeployKeySource } from '@/components/org/git-sources/deploy-key-source'
import { Button, FormField, InlineNotice, LoadingState } from '@/components/ui'
import { type GitRepositorySummary, type RepositoryRecord } from '@/lib/instance-api'
import { useForges } from '@/lib/queries/admin'
import { useAttachRepository, useGitConnections, useConnectionRepositories } from '@/lib/queries/releases'
import { spacing } from '@/lib/theme'

/**
 * Pick a repository as **application → account → repository**.
 *
 * That hierarchy is not decoration: an operator with two GitHub Apps, each
 * installed on several accounts, cannot tell two `acme/api` repositories apart
 * from a flat list — and picking the wrong one binds a project to a repository
 * it may not even be able to clone. Each level narrows the next.
 *
 * No new provider data is needed for it. A GitHub installation is scoped to
 * exactly one account, so `connection.accountLogin` *is* the owner for every
 * repository it returns, and `forgeId` on the connection gives the top level.
 *
 * Choosing a repository resolves it to a `repository` row through
 * `POST /repositories/attach` — idempotent, so picking the same repository from a
 * second project reuses the first project's binding rather than creating a
 * rival one with its own auto-deploy policy.
 */
export function RepositoryPicker({
  orgId,
  disabled = false,
  onPick,
  onNeedsApp,
}: Readonly<{
  orgId: string
  disabled?: boolean
  /**
   * Receives the resolved `source.id` once the repository is bound. The summary
   * is `null` on the deploy-key lane, where the instance never saw the provider
   * — all it was given is a clone URL. The attached row is passed when attach
   * fetched it, so callers that gate on `useRepositories()` do not wait on a
   * list that still lacks the new id.
   */
  onPick: (
    sourceId: string,
    repository: GitRepositorySummary | null,
    record?: RepositoryRecord,
  ) => void
  /** Nothing to pick from yet — the caller decides where to send the operator. */
  onNeedsApp?: () => void
}>) {
  const appsQuery = useForges('org')
  const connectionsQuery = useGitConnections(orgId, { enabled: orgId.length > 0 })
  const attach = useAttachRepository(orgId)

  const [deployKeyLane, setDeployKeyLane] = useState(false)
  const [appId, setAppId] = useState('')
  const [connectionId, setConnectionId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const apps = useMemo(() => appsQuery.data ?? [], [appsQuery.data])
  const connections = useMemo(
    () => connectionsQuery.data?.connections ?? [],
    [connectionsQuery.data],
  )

  /** Only apps that actually have a connected account can offer repositories. */
  const usableApps = useMemo(
    () => apps.filter((app) => connections.some((row) => row.forgeId === app.id)),
    [apps, connections],
  )
  const accounts = useMemo(
    () => connections.filter((row) => row.forgeId === appId && !row.suspended),
    [connections, appId],
  )

  // Collapse the single-option cases so the common setup is one click, not three.
  useEffect(() => {
    if (!appId && usableApps.length === 1) setAppId(usableApps[0]!.id)
  }, [appId, usableApps])
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
    if (!repo) return
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
        onPick(result.value.id, repo, result.value.repository)
      })
  }

  // A self-hosted GitLab or a plain SSH remote has no App to enumerate, so the
  // deploy-key lane is offered beside the App lane rather than behind it.
  if (deployKeyLane) {
    return (
      <DeployKeySource
        orgId={orgId}
        disabled={disabled}
        onConnect={(sourceId) => onPick(sourceId, null)}
        onCancel={() => setDeployKeyLane(false)}
      />
    )
  }

  if (appsQuery.isLoading || connectionsQuery.isLoading) {
    return <LoadingState label="Loading Git applications…" />
  }

  if (usableApps.length === 0) {
    return (
      <InlineNotice
        title="No repositories available yet"
        body={apps.length === 0
          ? 'No Git application is registered for this organization. Register one under Git sources, then install it on the account that owns your repositories.'
          : 'A Git application is registered but has no connected account yet. Finish installing it under Git sources.'}
        actions={
          <>
            {onNeedsApp
              ? <Button label="Open Git sources" size="sm" onPress={onNeedsApp} />
              : null}
            <Button
              label="Use a clone URL instead"
              variant="ghost"
              size="sm"
              onPress={() => setDeployKeyLane(true)}
            />
          </>
        }
      />
    )
  }

  const attaching = attach.isPending
  const busy = disabled || attaching

  return (
    <View style={styles.root}>
      {error ? <InlineNotice tone="warning" title="Could not attach" body={error} /> : null}

      <FormField label="Application">
        <FormSelect
          value={appId}
          options={usableApps.map((app) => ({
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

      <Button
        label="Use a clone URL and deploy key instead"
        variant="ghost"
        size="sm"
        disabled={busy}
        onPress={() => setDeployKeyLane(true)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
})
