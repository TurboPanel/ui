import { useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { HeaderChevron } from '@/components/header-chevron'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import {
  ConnectRepositoryControl,
  repositoryLabel,
} from '@/components/org/sources/connect-repository-panel'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  EmptyState,
  FormField,
  InlineNotice,
  LoadingState,
  MonoText,
  SegmentedControl,
} from '@/components/ui'
import { adminAreaHref } from '@/lib/admin-navigation'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import {
  githubAppInstallUrl,
  gitlabOauthConnectUrl,
  SOURCE_AUTO_DEPLOY_OPTIONS,
  SOURCE_REFERENCED_BY_COMPOSE_ERROR,
  type GitInstallationRecord,
  type SourceAutoDeploy,
  type SourceRecord,
} from '@/lib/instance-api'
import {
  useDeleteSource,
  useGitInstallations,
  useSourceDetail,
  useSources,
  useUpdateSource,
} from '@/lib/queries/releases'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function providerLabel(provider: string): string {
  if (provider === 'github') return 'GitHub'
  if (provider === 'gitlab') return 'GitLab'
  return 'Git'
}

function queryErrorMessage(
  query: Readonly<{ isError: boolean; error: unknown }>,
  fallback: string,
): string | null {
  if (!query.isError) return null
  return query.error instanceof Error ? query.error.message : fallback
}

/**
 * A 302 to the provider's consent page — the operator has to land there to
 * approve the grant, so this navigates rather than fetches.
 */
function openProviderConsent(url: string): void {
  Linking.openURL(url).catch(() => {
    // Ignore failures opening the provider consent page.
  })
}

/**
 * The instance refuses to drop a source a stored compose still names, and that
 * is a state to fix rather than an error to retry — say what to do instead of
 * echoing the code.
 */
function disconnectFailureCopy(message: string): string {
  if (message.includes(SOURCE_REFERENCED_BY_COMPOSE_ERROR)) {
    return 'This repository is still connected to a service — disconnect it from the project first.'
  }
  return message
}

/**
 * Provider connections this organization can read repositories through.
 *
 * Listed above the repositories on purpose: a repository cannot be picked until
 * an account is connected, so the empty state here is the explanation for the
 * empty state below.
 */
function ConnectedAccountsPanel({
  orgId,
  canManage,
}: Readonly<{ orgId: string; canManage: boolean }>) {
  const { session } = useAuth()
  const router = useRouter()
  const installationsQuery = useGitInstallations(orgId)

  const installations = installationsQuery.data?.installations ?? []
  const loadError = queryErrorMessage(
    installationsQuery,
    'Failed to load connected accounts',
  )

  return (
    <SectionPanel
      title="Connected accounts"
      hint="Provider connections this organization reads repositories through"
      headerRight={
        <ButtonRow align="end">
          <Button
            label="Connect GitHub account"
            size="sm"
            disabled={!canManage}
            onPress={() => openProviderConsent(githubAppInstallUrl())}
          />
          <Button
            label="Connect GitLab account"
            size="sm"
            disabled={!canManage}
            onPress={() => openProviderConsent(gitlabOauthConnectUrl())}
          />
        </ButtonRow>
      }
    >
      {loadError ? <Text style={orgPanelStyles.error}>{loadError}</Text> : null}

      {installationsQuery.isLoading ? (
        <LoadingState label="Loading connected accounts…" />
      ) : null}

      {!installationsQuery.isLoading && installations.length === 0 ? (
        <InlineNotice
          title="No Git accounts connected yet"
          body="Connect an account above. GitHub only offers the App when an instance administrator has registered it first — if the install page reports the App does not exist, that registration is the missing step."
          actions={
            isAdminSession(session) ? (
              <Button
                label="Open Git providers"
                size="sm"
                onPress={() => router.push(adminAreaHref('git') as Href)}
              />
            ) : null
          }
        />
      ) : null}

      <View style={styles.list}>
        {installations.map((row) => (
          <InstallationRow key={row.id} installation={row} />
        ))}
      </View>
    </SectionPanel>
  )
}

function InstallationRow({
  installation,
}: Readonly<{ installation: GitInstallationRecord }>) {
  const account =
    installation.accountLogin ?? installation.externalInstallationId
  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.rowHeader}>
        <MonoText selectable>{account}</MonoText>
        <View style={styles.badgeRow}>
          <Badge label={providerLabel(installation.provider)} />
          {installation.accountType ? (
            <Badge label={installation.accountType} />
          ) : null}
          {installation.suspended ? (
            <Badge label="Suspended" tone="pending" />
          ) : null}
        </View>
      </View>
      {installation.suspended ? (
        <Text style={orgPanelStyles.muted}>
          The provider suspended this installation, so repositories cannot be
          read through it. Reinstalling the App on the account clears the
          suspension — every repository already connected through it survives.
        </Text>
      ) : null}
    </View>
  )
}

/** `1 repository` / `3 repositories` — the count with its irregular plural. */
function repositoryCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'repository' : 'repositories'}`
}

/**
 * Repositories this organization has connected, and what a push to each one
 * does.
 */
function ConnectedRepositoriesPanel({
  orgId,
  canManage,
}: Readonly<{ orgId: string; canManage: boolean }>) {
  const [connecting, setConnecting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const sourcesQuery = useSources(orgId)
  const deleteMutation = useDeleteSource(orgId)

  const sources = sourcesQuery.data?.sources ?? []
  const loadError = queryErrorMessage(
    sourcesQuery,
    'Failed to load connected repositories',
  )

  const disconnect = (sourceId: string) => {
    setDeleteError(null)
    deleteMutation.mutate(sourceId, {
      onError: (error) => {
        setDeleteError(
          disconnectFailureCopy(
            error instanceof Error
              ? error.message
              : 'Failed to disconnect repository',
          ),
        )
      },
    })
  }

  return (
    <SectionPanel
      title="Connected repositories"
      hint={
        sourcesQuery.isLoading ? 'Loading…' : repositoryCount(sources.length)
      }
      headerRight={
        <Button
          label={connecting ? 'Cancel' : '+ Connect repository'}
          variant={connecting ? 'ghost' : 'primary'}
          size="sm"
          disabled={!canManage}
          onPress={() => setConnecting((prev) => !prev)}
        />
      }
    >
      {loadError ? <Text style={orgPanelStyles.error}>{loadError}</Text> : null}
      {deleteError ? (
        <Text style={orgPanelStyles.error}>{deleteError}</Text>
      ) : null}

      {connecting ? (
        <View style={orgPanelStyles.expandedSection}>
          <ConnectRepositoryControl
            orgId={orgId}
            disabled={!canManage}
            onConnect={() => setConnecting(false)}
          />
        </View>
      ) : null}

      {sourcesQuery.isLoading ? (
        <LoadingState label="Loading connected repositories…" />
      ) : null}

      {!sourcesQuery.isLoading && sources.length === 0 ? (
        <EmptyState title="No repositories connected yet." />
      ) : null}

      <View style={styles.list}>
        {sources.map((row) => (
          <SourceRow
            key={row.id}
            orgId={orgId}
            source={row}
            canManage={canManage}
            deleting={
              deleteMutation.isPending && deleteMutation.variables === row.id
            }
            onDisconnect={disconnect}
          />
        ))}
      </View>
    </SectionPanel>
  )
}

/**
 * One connected repository, expanding in place.
 *
 * The reachability note behind the expander is the only reason this row reads
 * `GET /sources/:id`, and that read re-resolves the instance public-URL list
 * every time — so it is only issued while the row is actually open.
 */
function SourceRow({
  orgId,
  source,
  canManage,
  deleting,
  onDisconnect,
}: Readonly<{
  orgId: string
  source: SourceRecord
  canManage: boolean
  deleting: boolean
  onDisconnect: (sourceId: string) => void
}>) {
  const [expanded, setExpanded] = useState(false)
  const updateMutation = useUpdateSource(orgId)
  const detailQuery = useSourceDetail(orgId, source.id, { enabled: expanded })

  const reachabilityNote = detailQuery.data?.source.reachabilityNote ?? null
  const label = repositoryLabel(source)

  return (
    <View style={orgPanelStyles.detailCard}>
      <Pressable
        style={[styles.rowHeader, webPointer]}
        onPress={() => setExpanded((prev) => !prev)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? `Collapse ${label}` : `Expand ${label}`}
      >
        <View style={styles.rowTitle}>
          <MonoText selectable>{label}</MonoText>
          <Text style={orgPanelStyles.muted}>
            {source.defaultBranch
              ? `Default branch ${source.defaultBranch}`
              : 'Every branch'}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          <Badge label={providerLabel(source.provider)} />
          <HeaderChevron size={12} color={colors.textMuted} open={expanded} />
        </View>
      </Pressable>

      {expanded ? (
        <View style={orgPanelStyles.expandedSection}>
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Clone URL: </Text>
            {source.repositoryUrl}
          </Text>

          <FormField
            label="Deploy on push"
            hint="A property of the repository — this policy applies to every service bound to it."
            error={updateMutation.actionError}
          >
            <SegmentedControl
              options={SOURCE_AUTO_DEPLOY_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              value={source.autoDeploy}
              disabled={!canManage || updateMutation.isPending}
              onChange={(next: SourceAutoDeploy) => {
                if (next === source.autoDeploy) return
                updateMutation.mutate({
                  sourceId: source.id,
                  patch: { autoDeploy: next },
                })
              }}
              accessibilityLabel="Deploy on push"
            />
          </FormField>
          <Text style={orgPanelStyles.muted}>
            {
              SOURCE_AUTO_DEPLOY_OPTIONS.find(
                (option) => option.value === source.autoDeploy,
              )?.hint
            }
          </Text>

          {detailQuery.isLoading ? (
            <LoadingState label="Checking webhook delivery…" />
          ) : null}
          {reachabilityNote ? (
            <InlineNotice
              tone="warning"
              title="Pushes may not reach this instance"
              body={reachabilityNote}
            />
          ) : null}

          <ConfirmButton
            label={deleting ? 'Disconnecting…' : 'Disconnect'}
            confirmLabel="Disconnect repository"
            prompt="Disconnect this repository?"
            busy={deleting}
            disabled={!canManage}
            onConfirm={() => onDisconnect(source.id)}
          />
        </View>
      ) : null}
    </View>
  )
}

/**
 * Organization → Projects → **Sources**.
 *
 * Connecting a repository is an organization act, not a property of the compose
 * service that happens to build from it: the `source` row is org-owned, several
 * services may share one, and the auto-deploy policy lives on the row. This is
 * where those rows are created, retired, and re-policied.
 */
export function SourcesOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Sources</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Git accounts this organization can read, and the repositories connected
        through them. A service binds to a repository listed here; the
        deploy-on-push policy belongs to the repository, not to the service.
      </Text>

      <ConnectedAccountsPanel orgId={orgId} canManage={canManage} />
      <ConnectedRepositoriesPanel orgId={orgId} canManage={canManage} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  list: {
    gap: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowTitle: {
    flex: 1,
    minWidth: 200,
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
})
