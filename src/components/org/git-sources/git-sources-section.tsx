import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  EmptyState,
  InlineNotice,
  LoadingState,
  MonoText,
  SectionPanel,
  SegmentedControl,
} from '@/components/ui'
import {
  githubManifestReturnNotice,
  readGithubManifestReturn,
} from '@/lib/github-manifest-return'
import type { ForgeSummary } from '@/lib/instance-api'
import { useDeleteForge, useForges } from '@/lib/queries/admin'
import { useGitConnections } from '@/lib/queries/releases'
import { colors, spacing } from '@/lib/theme'
import { ForgeEditor, SealedBadge } from './forge-editor'
import { GithubAppWizard } from './github-app-wizard'

type Provider = 'github' | 'gitlab'
type Scope = 'admin' | 'org'

const PROVIDER_LABEL: Record<Provider, string> = {
  github: 'GitHub App',
  gitlab: 'GitLab OAuth app',
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** One row: what the app is, whether it can see anything yet, and how to open it. */
function GitAppRow({
  app,
  orgId,
  scope,
  installed,
  editing,
  onEdit,
  onCancelEdit,
}: Readonly<{
  app: ForgeSummary
  orgId: string
  scope: Scope
  installed: boolean
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
}>) {
  const router = useRouter()
  const remove = useDeleteForge(scope)
  const [error, setError] = useState<string | null>(null)

  return (
    <SectionPanel
      title={app.name}
      hint={`${PROVIDER_LABEL[app.provider]} · ${app.baseUrl}`}
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      <View style={styles.badges}>
        {app.organizationId === null
          ? <Badge label="Instance-wide" tone="info" />
          : <Badge label="This organization" tone="muted" />}
        {app.readOnly ? <Badge label="Read-only" tone="muted" /> : null}
        {installed
          ? <Badge label="Installed" tone="ok" />
          : <Badge label="Not installed" tone="pending" />}
        <SealedBadge
          configured={app.provider === 'github' ? app.hasPrivateKey : app.hasClientSecret}
        />
      </View>

      {!installed
        ? (
          // The gap that used to be invisible: a registered App with no
          // installation looks configured while being unable to see a single
          // repository.
          <Text style={styles.muted}>
            Repository access has not been installed yet. Open this application to
            finish the setup.
          </Text>
        )
        : null}

      {app.webhookUrl
        ? (
          <MonoText style={styles.webhook} numberOfLines={1}>{app.webhookUrl}</MonoText>
        )
        : null}

      {editing
        ? (
          <ForgeEditor
            provider={app.provider}
            existing={app}
            scope={scope}
            onDone={onCancelEdit}
            onCancel={onCancelEdit}
          />
        )
        : (
          <ButtonRow align="end">
            <Button
              label="Open"
              variant="primary"
              size="sm"
              onPress={() =>
                router.push(
                  (orgId
                    ? `/${orgId}/projects/git-sources/${app.id}`
                    : `/admin/git/${app.id}`) as Href,
                )}
            />
            {app.readOnly
              ? null
              : (
                <>
                  <Button label="Edit" variant="secondary" size="sm" onPress={onEdit} />
                  <ConfirmButton
                    label="Delete"
                    prompt="Delete this application? Accounts connected through it are disconnected."
                    busy={remove.isPending}
                    onConfirm={() => {
                      setError(null)
                      remove.mutate(app.id, {
                        onError: (err) => {
                          setError(errorMessage(err, 'Failed to delete the application'))
                        },
                      })
                    }}
                  />
                </>
              )}
          </ButtonRow>
        )}
    </SectionPanel>
  )
}

/**
 * Git applications this organization can connect repositories through.
 *
 * One screen for both scopes: the admin surface renders it at `/admin/git` for
 * instance-wide applications, and an organization sees its own plus every
 * shared one — the latter marked `readOnly`, usable but not editable.
 *
 * Repositories are deliberately **not** listed here. A repository binding is
 * created when it is attached to a project, so this screen stops at the
 * application and its connected accounts; the accumulated rows are listed and
 * cleaned up on the org-level **Repositories** screen
 * (`repositories-section.tsx`) instead.
 */
export function GitSourcesSection({
  scope = 'admin',
  orgId = '',
}: Readonly<{ scope?: Scope; orgId?: string }> = {}) {
  const query = useForges(scope)
  const connectionsQuery = useGitConnections(orgId, { enabled: orgId.length > 0 })
  const returnParams = useLocalSearchParams<{ created?: string; error?: string }>()
  const returnNotice = githubManifestReturnNotice(readGithubManifestReturn(returnParams))

  const [wizard, setWizard] = useState(false)
  const [adding, setAdding] = useState<Provider | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const apps = useMemo(() => query.data ?? [], [query.data])
  const installedAppIds = useMemo(
    () =>
      new Set(
        (connectionsQuery.data?.connections ?? []).map((row) => row.forgeId),
      ),
    [connectionsQuery.data],
  )

  // A row that disappeared underneath an open editor must not leave the form
  // hanging over nothing.
  useEffect(() => {
    if (editingId && !apps.some((app) => app.id === editingId)) setEditingId(null)
  }, [apps, editingId])

  const loadError = query.isError
    ? errorMessage(query.error, 'Failed to load Git applications')
    : null

  const busy = wizard || adding !== null || editingId !== null

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Git sources</Text>
      <Text style={panelStyles.pageCopy}>
        {scope === 'admin'
          ? 'Applications the whole instance shares. Every organization can connect accounts through these.'
          : 'Applications this organization connects repositories through, plus any the instance shares. Repositories themselves are attached when you create or edit a project, and listed under Repositories.'}
      </Text>

      {returnNotice
        ? (
          <InlineNotice
            tone={returnNotice.tone}
            title={returnNotice.title}
            body={returnNotice.body}
          />
        )
        : null}
      {loadError ? <Text style={panelStyles.error}>{loadError}</Text> : null}
      {query.isLoading ? <LoadingState /> : null}

      {!query.isLoading && apps.length === 0 && !busy
        ? (
          <EmptyState
            panel
            title="No Git applications yet"
            hint="Register a GitHub App to connect repositories. Each one gets its own webhook URL."
          />
        )
        : null}

      {apps.map((app) => (
        <GitAppRow
          key={app.id}
          app={app}
          orgId={orgId}
          scope={scope}
          installed={installedAppIds.has(app.id)}
          editing={editingId === app.id}
          onEdit={() => {
            setWizard(false)
            setAdding(null)
            setEditingId(app.id)
          }}
          onCancelEdit={() => setEditingId(null)}
        />
      ))}

      {wizard
        ? (
          <GithubAppWizard
            scope={scope}
            onCancel={() => setWizard(false)}
          />
        )
        : null}

      {adding
        ? (
          <SectionPanel
            title="Register an existing application"
            hint="For an App you already created, or any GitLab OAuth application."
          >
            <SegmentedControl
              options={[
                { value: 'github', label: 'GitHub' },
                { value: 'gitlab', label: 'GitLab' },
              ]}
              value={adding}
              onChange={(value) => setAdding(value as Provider)}
            />
            <ForgeEditor
              key={adding}
              provider={adding}
              scope={scope}
              onDone={() => setAdding(null)}
              onCancel={() => setAdding(null)}
            />
          </SectionPanel>
        )
        : null}

      {busy
        ? null
        : (
          <ButtonRow>
            <Button
              label="Create a GitHub App"
              variant="primary"
              size="sm"
              onPress={() => {
                setEditingId(null)
                setAdding(null)
                setWizard(true)
              }}
            />
            <Button
              label="Register an existing one"
              variant="secondary"
              size="sm"
              onPress={() => {
                setEditingId(null)
                setWizard(false)
                setAdding('github')
              }}
            />
          </ButtonRow>
        )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 13,
  },
  webhook: {
    color: colors.textMuted,
  },
})
