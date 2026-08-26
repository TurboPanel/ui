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
import { githubAppInstallUrl, gitlabOauthConnectUrl, type GitAppSummary } from '@/lib/instance-api'
import { usePublicUrlsOptional, useGitApps, useSyncGitApp } from '@/lib/queries/admin'
import { useGitInstallations } from '@/lib/queries/releases'
import { colors, spacing } from '@/lib/theme'

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

/**
 * One registered application: what it is, where its deliveries arrive, and —
 * when it has no connected accounts yet — the step that is still missing.
 *
 * Registering an App and *installing* it are two different acts on GitHub's
 * side, and an App with no installation looks fully set up while being unable
 * to see a single repository. That gap is what the empty state below names.
 */
export function GitAppDetailSection({
  orgId,
  appId,
  scope = 'org',
}: Readonly<{ orgId: string; appId: string; scope?: 'admin' | 'org' }>) {
  const appsQuery = useGitApps(scope)
  const installationsQuery = useGitInstallations(orgId, { enabled: orgId.length > 0 })
  const publicUrls = usePublicUrlsOptional()
  const sync = useSyncGitApp(scope)
  const params = useLocalSearchParams<{ installed?: string; error?: string }>()
  const [error, setError] = useState<string | null>(null)
  const [synced, setSynced] = useState<string | null>(null)

  const app = (appsQuery.data ?? []).find((entry) => entry.id === appId)
  const installations = (installationsQuery.data?.installations ?? []).filter(
    (row) => row.appId === appId
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

  const connectUrl = app.provider === 'github' ? githubAppInstallUrl : gitlabOauthConnectUrl
  const installLabel =
    app.provider === 'github' ? 'Install repositories' : 'Connect a GitLab account'

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
        Installations are recorded per organization, so an instance-wide view
        has no account list to show — offering one would either be empty or
        another organization's.
      */}
      {orgId ? (
        <SectionPanel
          title="Repository access"
          hint="Which accounts this application can read repositories from"
        >
          {installationsQuery.isLoading ? <LoadingState /> : null}

          {!installationsQuery.isLoading && installations.length === 0 ? (
            <InlineNotice
              title="Complete GitHub installation"
              body="Repository access has not been installed yet. Complete this step before attaching the source to an application."
              actions={
                <Button
                  label={installLabel}
                  variant="primary"
                  size="sm"
                  disabled={app.provider === 'github' && !app.appSlug}
                  onPress={() => {
                    void Linking.openURL(connectUrl(app.id)).catch(() => {
                      setError('Could not open the provider consent page.')
                    })
                  }}
                />
              }
            />
          ) : null}

          {installations.map((row) => (
            <View key={row.id} style={styles.account}>
              <MonoText>{row.accountLogin ?? row.externalInstallationId}</MonoText>
              {row.accountType ? <Badge label={row.accountType} tone="muted" /> : null}
              {row.suspended ? <Badge label="Suspended" tone="danger" /> : null}
            </View>
          ))}

          {installations.length > 0 ? (
            <ButtonRow align="end">
              <Button
                label={
                  app.provider === 'github' ? 'Add another account' : 'Connect another account'
                }
                variant="secondary"
                size="sm"
                onPress={() => {
                  void Linking.openURL(connectUrl(app.id)).catch(() => {
                    setError('Could not open the provider consent page.')
                  })
                }}
              />
            </ButtonRow>
          ) : null}
        </SectionPanel>
      ) : null}

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
        {publicUrls.data && app.webhookUrl
          ? (() => {
              const hint = gitWebhookHint(
                publicUrls.data.urls,
                app.provider,
                app.webhookRef,
                app.baseUrl
              )
              return hint.note ? (
                <InlineNotice
                  tone="warning"
                  title="Deliveries may not reach this instance"
                  body={hint.note}
                />
              ) : null
            })()
          : null}
      </SectionPanel>

      {app.provider === 'github' && !app.readOnly ? (
        <SectionPanel
          title="Provider record"
          hint="What GitHub currently holds for this application"
        >
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
                setError(null)
                setSynced(null)
                sync.mutate(app.id, {
                  onSuccess: (data) => {
                    setSynced(`Synced. GitHub calls this app "${data.app.name}".`)
                  },
                  onError: (err) => {
                    setError(err instanceof Error ? err.message : 'Sync failed')
                  },
                })
              }}
            />
          </ButtonRow>
        </SectionPanel>
      ) : null}
    </View>
  )
}

export type { GitAppSummary }

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
