import { useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import {
  Badge,
  Button,
  ButtonRow,
  CopyButton,
  InlineNotice,
  LoadingState,
  MonoText,
} from '@/components/ui'
import { gitWebhookHint } from '@/lib/git-webhook-url'
import {
  githubAppInstallUrl,
  gitlabOauthConnectUrl,
  type ForgeSummary,
  type GitConnectionRecord,
} from '@/lib/instance-api'
import { usePublicUrlsOptional, useForges, useSyncForge } from '@/lib/queries/admin'
import { useGitConnections } from '@/lib/queries/releases'
import { colors, spacing } from '@/lib/theme'

export type { ForgeSummary } from '@/lib/instance-api'

/** Whatever the panels have to say back to the page header. */
type ReportMessage = (message: string | null) => void

/** Consumed once by the operator's browser after a provider redirect. */
function returnNotice(
  params: Readonly<{ installed?: string; error?: string }>
): { tone: 'info' | 'warning'; title: string; body: string } | null {
  if (params.error) {
    const body: Record<string, string> = {
      state_invalid:
        'The link back from the provider could not be verified. Start the connection again.',
      forbidden: 'You do not have permission to connect an account for this organization.',
      not_configured:
        'This application is missing credentials, so the connection could not be recorded.',
      claimed:
        'Another organization on this instance already connected that account through this application. One account belongs to one organization per app.',
      provider_failed: 'The provider refused the request. Nothing was recorded.',
      unavailable: 'The instance could not complete the connection. Try again.',
      invalid_request: 'The provider sent back an incomplete response.',
    }
    return {
      tone: 'warning',
      title: 'Could not finish connecting',
      body: body[params.error] ?? 'The connection did not complete.',
    }
  }
  if (params.installed) {
    return {
      tone: 'info',
      title: 'Account connected',
      body: 'Repositories from this account can now be attached to a project.',
    }
  }
  return null
}

/** One connected account. */
function ConnectionRow({ row }: Readonly<{ row: GitConnectionRecord }>) {
  return (
    <View style={styles.account}>
      <MonoText>{row.accountLogin ?? row.externalInstallationId}</MonoText>
      {row.accountType ? <Badge label={row.accountType} tone="muted" /> : null}
      {row.suspended ? <Badge label="Suspended" tone="danger" /> : null}
    </View>
  )
}

/**
 * The connected accounts, and — when there are none — the step that is still
 * missing.
 *
 * Registering an App and *installing* it are two different acts on GitHub's
 * side, and an App with no installation looks fully set up while being unable
 * to see a single repository. That gap is what the empty state names.
 */
function RepositoryAccessPanel({
  app,
  connections,
  loading,
  onError,
}: Readonly<{
  app: ForgeSummary
  connections: readonly GitConnectionRecord[]
  loading: boolean
  onError: ReportMessage
}>) {
  const isGithub = app.provider === 'github'
  const connectUrl = isGithub ? githubAppInstallUrl : gitlabOauthConnectUrl
  const openProvider = () => {
    void Linking.openURL(connectUrl(app.id)).catch(() => {
      onError('Could not open the provider consent page.')
    })
  }

  return (
    <SectionPanel
      title="Repository access"
      hint="Which accounts this application can read repositories from"
    >
      {loading ? <LoadingState /> : null}

      {!loading && connections.length === 0 ? (
        <InlineNotice
          title="Complete GitHub installation"
          body="Repository access has not been installed yet. Complete this step before attaching the source to an application."
          actions={
            <Button
              label={isGithub ? 'Install repositories' : 'Connect a GitLab account'}
              variant="primary"
              size="sm"
              disabled={isGithub && !app.appSlug}
              onPress={openProvider}
            />
          }
        />
      ) : null}

      {connections.map((row) => (
        <ConnectionRow key={row.id} row={row} />
      ))}

      {connections.length > 0 ? (
        <ButtonRow align="end">
          <Button
            label={isGithub ? 'Add another account' : 'Connect another account'}
            variant="secondary"
            size="sm"
            onPress={openProvider}
          />
        </ButtonRow>
      ) : null}
    </SectionPanel>
  )
}

/** Where this application's deliveries arrive, and whether they can reach us. */
function WebhookPanel({ app }: Readonly<{ app: ForgeSummary }>) {
  const publicUrls = usePublicUrlsOptional()
  const unreachable =
    publicUrls.data && app.webhookUrl
      ? gitWebhookHint(publicUrls.data.urls, app.provider, app.webhookRef, app.baseUrl).note
      : null

  return (
    <SectionPanel title="Webhook" hint="Where this application's deliveries arrive">
      {app.webhookUrl ? (
        <View style={styles.webhookRow}>
          <MonoText style={styles.webhookUrl} numberOfLines={1}>
            {app.webhookUrl}
          </MonoText>
          <CopyButton value={app.webhookUrl} />
        </View>
      ) : (
        <InlineNotice
          tone="warning"
          title="No public URL configured"
          body="Set an instance public URL before pointing a provider at this application."
        />
      )}
      {unreachable ? (
        <InlineNotice
          tone="warning"
          title="Deliveries may not reach this instance"
          body={unreachable}
        />
      ) : null}
    </SectionPanel>
  )
}

/** Re-read what GitHub holds, because a rename there never reaches us. */
function ProviderRecordPanel({
  app,
  scope,
  onError,
  onSynced,
}: Readonly<{
  app: ForgeSummary
  scope: 'admin' | 'org'
  onError: ReportMessage
  onSynced: ReportMessage
}>) {
  const sync = useSyncForge(scope)

  return (
    <SectionPanel title="Provider record" hint="What GitHub currently holds for this application">
      <Text style={styles.muted}>
        An operator can rename the App on GitHub and nothing tells us. The slug also builds the
        install link, so a rename quietly stops new accounts connecting until this runs.
      </Text>
      <ButtonRow align="end">
        <Button
          label="Sync from GitHub"
          busyLabel="Syncing…"
          variant="secondary"
          size="sm"
          busy={sync.isPending}
          onPress={() => {
            onError(null)
            onSynced(null)
            sync.mutate(app.id, {
              onSuccess: (data) => {
                onSynced(`Synced. GitHub calls this app "${data.app.name}".`)
              },
              onError: (err) => {
                onError(err instanceof Error ? err.message : 'Sync failed')
              },
            })
          }}
        />
      </ButtonRow>
    </SectionPanel>
  )
}

/**
 * One registered application: what it is, where its deliveries arrive, and —
 * when it has no connected accounts yet — the step that is still missing.
 */
export function ForgeDetailSection({
  orgId,
  appId,
  scope = 'org',
}: Readonly<{ orgId: string; appId: string; scope?: 'admin' | 'org' }>) {
  const appsQuery = useForges(scope)
  const connectionsQuery = useGitConnections(orgId, { enabled: orgId.length > 0 })
  const params = useLocalSearchParams<{ installed?: string; error?: string }>()
  const [error, setError] = useState<string | null>(null)
  const [synced, setSynced] = useState<string | null>(null)

  const app = (appsQuery.data ?? []).find((entry) => entry.id === appId)
  const connections = (connectionsQuery.data?.connections ?? []).filter(
    (row) => row.forgeId === appId
  )
  const notice = returnNotice(params)

  if (appsQuery.isLoading) return <LoadingState />
  if (!app) {
    return (
      <InlineNotice
        tone="warning"
        title="Application not found"
        body="It may have been removed, or it belongs to another organization."
      />
    )
  }

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>{app.name}</Text>
      <Text style={orgPanelStyles.pageCopy}>
        {app.provider === 'github' ? 'GitHub App' : 'GitLab OAuth application'} · {app.baseUrl}
      </Text>

      {notice ? <InlineNotice tone={notice.tone} title={notice.title} body={notice.body} /> : null}
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {synced ? <Text style={styles.success}>{synced}</Text> : null}

      {/*
        Connections are recorded per organization, so an instance-wide view
        has no account list to show — offering one would either be empty or
        another organization's.
      */}
      {orgId ? (
        <RepositoryAccessPanel
          app={app}
          connections={connections}
          loading={connectionsQuery.isLoading}
          onError={setError}
        />
      ) : null}

      <WebhookPanel app={app} />

      {app.provider === 'github' && !app.readOnly ? (
        <ProviderRecordPanel app={app} scope={scope} onError={setError} onSynced={setSynced} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 13,
  },
  success: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  webhookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  webhookUrl: {
    flex: 1,
    minWidth: 0,
  },
})
