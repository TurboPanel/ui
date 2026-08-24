import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  Badge,
  Button,
  CopyButton,
  InlineNotice,
  LoadingState,
  MonoText,
  TextField,
} from '@/components/ui'
import { gitWebhookHint, type GitWebhookProvider } from '@/lib/git-webhook-url'
import type {
  GithubAppSettingsUpdate,
  GitlabOauthSettingsUpdate,
} from '@/lib/instance-api'
import {
  useGithubAppSettings,
  useGitlabOauthSettings,
  usePublicUrlsOptional,
  useSaveGithubAppSettings,
  useSaveGitlabOauthSettings,
} from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'

/**
 * A stored secret is never returned by the API — the panel can only report
 * whether one exists, so the badge carries that state in words.
 */
function SealedBadge({ configured }: Readonly<{ configured: boolean }>): ReactNode {
  return (
    <Badge
      label={configured ? 'Configured' : 'Not configured'}
      tone={configured ? 'ok' : 'muted'}
    />
  )
}

/** Empty means "clear this field", which the API spells as an explicit null. */
function nullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Field validation, save failure, and success text for one provider panel.
 * Both panels clear all three at the top of a save, so the trio and its reset
 * live here rather than as two identical closures.
 */
function useSaveFeedback() {
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const clearFeedback = () => {
    setSuccess(null)
    setSaveError(null)
    setFieldError(null)
  }

  return {
    fieldError,
    saveError,
    success,
    setFieldError,
    setSaveError,
    setSuccess,
    clearFeedback,
  }
}

function queryErrorMessage(
  query: Readonly<{ isError: boolean; error: unknown }>,
  fallback: string,
): string | null {
  if (!query.isError) return null
  return query.error instanceof Error ? query.error.message : fallback
}

/**
 * The address to paste into the provider's webhook settings, plus the note
 * explaining when it cannot work (LAN-only instance, or no public URL yet).
 *
 * The hint is only meaningful once the public URL list has actually answered:
 * an unresolved query carries `undefined`, and treating that as "no origins"
 * would tell a correctly configured operator their instance has no public URL.
 * A 403 is different — the hook folds it into an empty list on purpose, so an
 * empty array here is a real answer and does earn the no-URL warning.
 */
function WebhookEndpoint({
  provider,
}: Readonly<{ provider: GitWebhookProvider }>) {
  const publicUrls = usePublicUrlsOptional()
  const urlsError = queryErrorMessage(
    publicUrls,
    'Failed to load the instance public URLs',
  )
  const hint = publicUrls.data
    ? gitWebhookHint(publicUrls.data.urls, provider)
    : null

  let body: ReactNode
  if (urlsError) {
    body = (
      <InlineNotice
        tone="warning"
        title="Could not load the public URL"
        body={`${urlsError} — the webhook address cannot be shown until it loads.`}
      />
    )
  } else if (!hint) {
    body = <LoadingState label="Resolving public URL…" />
  } else {
    body = (
      <>
        {hint.webhookUrl ? (
          <View style={styles.webhookRow}>
            <MonoText style={styles.webhookUrl} numberOfLines={1}>
              {hint.webhookUrl}
            </MonoText>
            <CopyButton value={hint.webhookUrl} />
          </View>
        ) : null}
        {hint.note ? (
          <InlineNotice
            tone="warning"
            title={
              hint.webhookUrl
                ? 'Webhooks cannot reach this instance'
                : 'No public URL configured'
            }
            body={hint.note}
          />
        ) : null}
      </>
    )
  }

  return (
    <View style={styles.webhook}>
      <Text style={styles.webhookLabel}>Webhook URL</Text>
      {body}
    </View>
  )
}

function GithubAppPanel() {
  const query = useGithubAppSettings()
  const save = useSaveGithubAppSettings()

  const [appId, setAppId] = useState('')
  const [appSlug, setAppSlug] = useState('')
  const [clientId, setClientId] = useState('')
  const [privateKeyPem, setPrivateKeyPem] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  // Write-only fields start blank on every load; the flags say whether the
  // operator actually typed into one, so an untouched save omits the key
  // entirely and the stored secret survives.
  const [keyTouched, setKeyTouched] = useState(false)
  const [secretTouched, setSecretTouched] = useState(false)

  const {
    fieldError,
    saveError,
    success,
    setFieldError,
    setSaveError,
    setSuccess,
    clearFeedback,
  } = useSaveFeedback()

  const summary = query.data

  useEffect(() => {
    if (!summary) return
    setAppId(summary.appId ?? '')
    setAppSlug(summary.appSlug ?? '')
    setClientId(summary.clientId ?? '')
    setPrivateKeyPem('')
    setWebhookSecret('')
    setKeyTouched(false)
    setSecretTouched(false)
  }, [summary])

  const onSave = () => {
    clearFeedback()

    const trimmedAppId = appId.trim()
    if (!trimmedAppId) {
      setFieldError('App ID is required.')
      return
    }

    const updates: GithubAppSettingsUpdate = {
      appId: trimmedAppId,
      appSlug: nullable(appSlug),
      clientId: nullable(clientId),
    }
    // A private key has no "clear" verb server-side — send it only when a new
    // one was pasted.
    if (keyTouched && privateKeyPem.trim() !== '') {
      updates.privateKeyPem = privateKeyPem
    }
    if (secretTouched) {
      updates.webhookSecret = nullable(webhookSecret)
    }

    save.mutate(updates, {
      onSuccess: () => {
        setSuccess('GitHub App saved.')
      },
      onError: () => {
        setSaveError(save.actionError ?? 'Failed to save GitHub App settings')
      },
    })
  }

  const displayError =
    fieldError ?? saveError ?? queryErrorMessage(query, 'Failed to load GitHub App settings')

  return (
    <SectionPanel
      title="GitHub App"
      hint="One instance-wide App; every organization connects repositories through it"
    >
      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}

      {query.isLoading ? (
        <LoadingState />
      ) : (
        <>
          <TextField
            label="App ID"
            value={appId}
            onChangeText={(text) => {
              setAppId(text)
              clearFeedback()
            }}
            placeholder="123456"
            hint="Numeric ID from the App's settings page."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!save.isPending}
          />

          <TextField
            label="App slug"
            value={appSlug}
            onChangeText={(text) => {
              setAppSlug(text)
              clearFeedback()
            }}
            placeholder="my-turbopanel"
            hint="URL name of the App — used to link operators to its install page."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!save.isPending}
          />

          <TextField
            label="Client ID"
            value={clientId}
            onChangeText={(text) => {
              setClientId(text)
              clearFeedback()
            }}
            placeholder="Iv1.0123456789abcdef"
            hint="Needed for the user OAuth flow; leave empty to clear."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!save.isPending}
          />

          <TextField
            label="Private key"
            labelRight={<SealedBadge configured={summary?.hasPrivateKey === true} />}
            value={privateKeyPem}
            onChangeText={(text) => {
              setPrivateKeyPem(text)
              setKeyTouched(true)
              clearFeedback()
            }}
            placeholder={'-----BEGIN RSA PRIVATE KEY-----'}
            hint={
              summary?.hasPrivateKey
                ? 'A key is stored and is never shown. Paste a new .pem to replace it; leave empty to keep it.'
                : 'Paste the .pem downloaded when the App key was generated.'
            }
            multiline
            mono
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            editable={!save.isPending}
          />

          <TextField
            label="Webhook secret"
            labelRight={<SealedBadge configured={summary?.hasWebhookSecret === true} />}
            value={webhookSecret}
            onChangeText={(text) => {
              setWebhookSecret(text)
              setSecretTouched(true)
              clearFeedback()
            }}
            hint="Signs GitHub's deliveries. Leave empty to keep the stored one; clear it after typing to remove it."
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            editable={!save.isPending}
          />

          <WebhookEndpoint provider="github" />

          <Button
            label="Save"
            busyLabel="Saving…"
            variant="primary"
            busy={save.isPending}
            onPress={onSave}
          />
        </>
      )}
    </SectionPanel>
  )
}

function GitlabOauthPanel() {
  const query = useGitlabOauthSettings()
  const save = useSaveGitlabOauthSettings()

  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [redirectUri, setRedirectUri] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  const [clientSecretTouched, setClientSecretTouched] = useState(false)
  const [webhookTouched, setWebhookTouched] = useState(false)

  const {
    fieldError,
    saveError,
    success,
    setFieldError,
    setSaveError,
    setSuccess,
    clearFeedback,
  } = useSaveFeedback()

  const summary = query.data

  useEffect(() => {
    if (!summary) return
    setClientId(summary.clientId ?? '')
    setBaseUrl(summary.baseUrl ?? '')
    setRedirectUri(summary.redirectUri ?? '')
    setClientSecret('')
    setWebhookSecret('')
    setClientSecretTouched(false)
    setWebhookTouched(false)
  }, [summary])

  const onSave = () => {
    clearFeedback()

    const trimmedClientId = clientId.trim()
    if (!trimmedClientId) {
      setFieldError('Application ID is required.')
      return
    }

    const updates: GitlabOauthSettingsUpdate = {
      clientId: trimmedClientId,
      baseUrl: nullable(baseUrl),
      redirectUri: nullable(redirectUri),
    }
    // The client secret cannot be cleared, only replaced.
    if (clientSecretTouched && clientSecret.trim() !== '') {
      updates.clientSecret = clientSecret.trim()
    }
    if (webhookTouched) {
      updates.webhookSecret = nullable(webhookSecret)
    }

    save.mutate(updates, {
      onSuccess: () => {
        setSuccess('GitLab OAuth application saved.')
      },
      onError: () => {
        setSaveError(save.actionError ?? 'Failed to save GitLab OAuth settings')
      },
    })
  }

  const displayError =
    fieldError ??
    saveError ??
    queryErrorMessage(query, 'Failed to load GitLab OAuth settings')

  return (
    <SectionPanel
      title="GitLab OAuth application"
      hint="One OAuth app on gitlab.com or a self-managed instance; organizations connect accounts and groups through it"
    >
      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}

      {query.isLoading ? (
        <LoadingState />
      ) : (
        <>
          <TextField
            label="Application ID"
            value={clientId}
            onChangeText={(text) => {
              setClientId(text)
              clearFeedback()
            }}
            placeholder="0123456789abcdef…"
            hint="GitLab calls this the Application ID; the API calls it the client ID."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!save.isPending}
          />

          <TextField
            label="Application secret"
            labelRight={<SealedBadge configured={summary?.hasClientSecret === true} />}
            value={clientSecret}
            onChangeText={(text) => {
              setClientSecret(text)
              setClientSecretTouched(true)
              clearFeedback()
            }}
            hint={
              summary?.hasClientSecret
                ? 'A secret is stored and is never shown. Type a new one to replace it; leave empty to keep it.'
                : 'Shown once when the OAuth application is created.'
            }
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            editable={!save.isPending}
          />

          <TextField
            label="GitLab URL"
            value={baseUrl}
            onChangeText={(text) => {
              setBaseUrl(text)
              clearFeedback()
            }}
            placeholder="https://gitlab.com"
            hint="Origin of the GitLab instance. Empty falls back to https://gitlab.com."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!save.isPending}
          />

          <TextField
            label="Redirect URI"
            value={redirectUri}
            onChangeText={(text) => {
              setRedirectUri(text)
              clearFeedback()
            }}
            placeholder="https://panel.example.com/api/git/v1/gitlab/oauth/callback"
            hint="Must match the callback registered on the OAuth application."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!save.isPending}
          />

          <TextField
            label="Webhook token"
            labelRight={<SealedBadge configured={summary?.hasWebhookSecret === true} />}
            value={webhookSecret}
            onChangeText={(text) => {
              setWebhookSecret(text)
              setWebhookTouched(true)
              clearFeedback()
            }}
            hint="Verifies GitLab's deliveries. Leave empty to keep the stored one; clear it after typing to remove it."
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            editable={!save.isPending}
          />

          <WebhookEndpoint provider="gitlab" />

          <Button
            label="Save"
            busyLabel="Saving…"
            variant="primary"
            busy={save.isPending}
            onPress={onSave}
          />
        </>
      )}
    </SectionPanel>
  )
}

export function GitProvidersSection() {
  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Git providers</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Credentials the whole instance shares when connecting repositories.
        Secrets are sealed on save and never read back — the panel reports only
        whether one is stored.
      </Text>

      <GithubAppPanel />
      <GitlabOauthPanel />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  webhook: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  webhookLabel: {
    color: colors.textBody,
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
  success: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
})
