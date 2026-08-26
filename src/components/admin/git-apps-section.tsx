import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  CopyButton,
  EmptyState,
  InlineNotice,
  LoadingState,
  MonoText,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import { gitWebhookHint } from '@/lib/git-webhook-url'
import {
  MANIFEST_WEB_ONLY_NOTE,
  submitGithubAppManifest,
} from '@/lib/github-manifest-submit'
import type {
  GitAppCreate,
  GitAppSummary,
  GitAppUpdate,
} from '@/lib/instance-api'
import {
  useCreateGitApp,
  useDeleteGitApp,
  useGitApps,
  usePublicUrlsOptional,
  useStartGithubAppManifest,
  useUpdateGitApp,
} from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'

type Provider = 'github' | 'gitlab'
type Scope = 'admin' | 'org'

const PROVIDER_LABEL: Record<Provider, string> = {
  github: 'GitHub App',
  gitlab: 'GitLab OAuth app',
}

const PROVIDER_DEFAULT_ORIGIN: Record<Provider, string> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
}

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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * The address to paste into the provider's webhook settings, plus the note
 * explaining when it cannot work (LAN-only instance, or no public URL yet).
 *
 * Every app has its **own** URL — the trailing segment is the app's routing
 * ref, which is what lets a delivery name its app before any secret is checked.
 * The control plane already resolved it into `webhookUrl`; the public-URL query
 * is consulted only for the reachability warning, and only once it has actually
 * answered. An unresolved query carries `undefined`, and treating that as "no
 * origins" would tell a correctly configured operator their instance has none.
 */
function WebhookEndpoint({ app }: Readonly<{ app: GitAppSummary }>) {
  const publicUrls = usePublicUrlsOptional()
  const hint = publicUrls.data
    ? gitWebhookHint(publicUrls.data.urls, app.provider)
    : null

  return (
    <View style={styles.webhook}>
      <Text style={styles.webhookLabel}>Webhook URL</Text>
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
          body="Set an instance public URL before pointing a provider at this app."
        />
      )}
      {hint?.note && app.webhookUrl ? (
        <InlineNotice
          tone="warning"
          title="Webhooks cannot reach this instance"
          body={hint.note}
        />
      ) : null}
    </View>
  )
}

type EditorState = {
  name: string
  baseUrl: string
  externalAppId: string
  appSlug: string
  clientId: string
  redirectUri: string
  privateKeyPem: string
  clientSecret: string
  webhookSecret: string
}

function blankEditor(provider: Provider): EditorState {
  return {
    name: '',
    baseUrl: PROVIDER_DEFAULT_ORIGIN[provider],
    externalAppId: '',
    appSlug: '',
    clientId: '',
    redirectUri: '',
    privateKeyPem: '',
    clientSecret: '',
    webhookSecret: '',
  }
}

function editorFrom(app: GitAppSummary): EditorState {
  return {
    name: app.name,
    baseUrl: app.baseUrl,
    externalAppId: app.externalAppId,
    appSlug: app.appSlug ?? '',
    clientId: app.clientId ?? '',
    redirectUri: app.redirectUri ?? '',
    // Write-only fields always start blank; a stored secret is never shown.
    privateKeyPem: '',
    clientSecret: '',
    webhookSecret: '',
  }
}

/**
 * Create / edit form for one app.
 *
 * `existing` decides the verb. The three secret fields are write-only and are
 * sent only when the operator actually typed into one, so an edit that renames
 * an app keeps its sealed private key rather than clearing it.
 */
function GitAppEditor({
  provider,
  existing,
  scope,
  onDone,
  onCancel,
}: Readonly<{
  provider: Provider
  existing?: GitAppSummary
  scope: Scope
  onDone: () => void
  onCancel: () => void
}>) {
  const create = useCreateGitApp(scope)
  const update = useUpdateGitApp(scope)
  const busy = create.isPending || update.isPending

  const [form, setForm] = useState<EditorState>(
    existing ? editorFrom(existing) : blankEditor(provider),
  )
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof EditorState) => (text: string) => {
    setForm((prev) => ({ ...prev, [key]: text }))
    setTouched((prev) => ({ ...prev, [key]: true }))
    setError(null)
  }

  const isGithub = provider === 'github'

  const onSave = () => {
    setError(null)
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    if (!form.externalAppId.trim()) {
      setError(isGithub ? 'App ID is required.' : 'Application ID is required.')
      return
    }

    const secrets: Partial<GitAppUpdate> = {}
    // A private key has no "clear" verb worth offering — send it only when a
    // new one was pasted.
    if (touched.privateKeyPem && form.privateKeyPem.trim() !== '') {
      secrets.privateKeyPem = form.privateKeyPem
    }
    if (touched.clientSecret) secrets.clientSecret = nullable(form.clientSecret)
    if (touched.webhookSecret) secrets.webhookSecret = nullable(form.webhookSecret)

    const shared = {
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim() || PROVIDER_DEFAULT_ORIGIN[provider],
      externalAppId: form.externalAppId.trim(),
      appSlug: nullable(form.appSlug),
      clientId: nullable(form.clientId),
      redirectUri: nullable(form.redirectUri),
      ...secrets,
    }

    const onError = (err: unknown) => {
      setError(errorMessage(err, 'Failed to save the application'))
    }

    if (existing) {
      update.mutate(
        { id: existing.id, updates: shared },
        { onSuccess: onDone, onError },
      )
    } else {
      create.mutate({ provider, ...shared } as GitAppCreate, {
        onSuccess: onDone,
        onError,
      })
    }
  }

  return (
    <View style={styles.editor}>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <TextField
        label="Name"
        value={form.name}
        onChangeText={set('name')}
        placeholder={isGithub ? 'TurboPanel' : 'TurboPanel (GitLab)'}
        hint="Shown when choosing which application to connect through."
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />

      <TextField
        label={isGithub ? 'App ID' : 'Application ID'}
        value={form.externalAppId}
        onChangeText={set('externalAppId')}
        placeholder={isGithub ? '123456' : '0123abcd…'}
        hint={
          isGithub
            ? "Numeric ID from the App's settings page. Also how a delivery names this App."
            : 'Application ID from the GitLab OAuth application.'
        }
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />

      <TextField
        label={isGithub ? 'GitHub origin' : 'GitLab origin'}
        value={form.baseUrl}
        onChangeText={set('baseUrl')}
        placeholder={PROVIDER_DEFAULT_ORIGIN[provider]}
        hint={
          isGithub
            ? 'GitHub Enterprise Server origin, or github.com.'
            : 'Self-managed GitLab origin, or gitlab.com. Apps on different origins stay isolated.'
        }
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />

      {isGithub ? (
        <TextField
          label="App slug"
          value={form.appSlug}
          onChangeText={set('appSlug')}
          placeholder="my-turbopanel"
          hint="URL name of the App — used to link operators to its install page."
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
      ) : null}

      <TextField
        label={isGithub ? 'Client ID' : 'Application ID (OAuth)'}
        value={form.clientId}
        onChangeText={set('clientId')}
        placeholder={isGithub ? 'Iv1.0123456789abcdef' : '0123abcd…'}
        hint={
          isGithub
            ? 'Needed for the user OAuth flow; leave empty to clear.'
            : 'Client ID used for the authorization-code grant.'
        }
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />

      {isGithub ? (
        <TextField
          label="Private key"
          labelRight={<SealedBadge configured={existing?.hasPrivateKey === true} />}
          value={form.privateKeyPem}
          onChangeText={set('privateKeyPem')}
          placeholder={'-----BEGIN RSA PRIVATE KEY-----'}
          hint={
            existing?.hasPrivateKey
              ? 'A key is stored and is never shown. Paste a new .pem to replace it; leave empty to keep it.'
              : 'Paste the .pem downloaded when the App key was generated.'
          }
          multiline
          mono
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          editable={!busy}
        />
      ) : (
        <>
          <TextField
            label="Application secret"
            labelRight={<SealedBadge configured={existing?.hasClientSecret === true} />}
            value={form.clientSecret}
            onChangeText={set('clientSecret')}
            hint="Secret from the GitLab OAuth application. Leave empty to keep the stored one."
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            editable={!busy}
          />
          <TextField
            label="Redirect URI"
            value={form.redirectUri}
            onChangeText={set('redirectUri')}
            placeholder="https://panel.example.com/api/client/v1/sources/gitlab/callback"
            hint="Must match the callback registered on the GitLab application, byte for byte."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
        </>
      )}

      <TextField
        label={isGithub ? 'Webhook secret' : 'Webhook token'}
        labelRight={<SealedBadge configured={existing?.hasWebhookSecret === true} />}
        value={form.webhookSecret}
        onChangeText={set('webhookSecret')}
        hint={
          isGithub
            ? "Signs GitHub's deliveries. Leave empty to keep the stored one; clear it after typing to remove it."
            : 'GitLab does not sign deliveries, so this token is the whole credential. Use at least 24 characters.'
        }
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        editable={!busy}
      />

      <ButtonRow align="end">
        <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
        <Button
          label={existing ? 'Save' : 'Add application'}
          busyLabel="Saving…"
          variant="primary"
          busy={busy}
          onPress={onSave}
        />
      </ButtonRow>
    </View>
  )
}

/** One registered app: identity, its own webhook URL, and the row's actions. */
function GitAppRow({
  app,
  scope,
  editing,
  onEdit,
  onCancelEdit,
}: Readonly<{
  app: GitAppSummary
  scope: Scope
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
}>) {
  const remove = useDeleteGitApp(scope)
  const [error, setError] = useState<string | null>(null)

  return (
    <SectionPanel
      title={app.name}
      hint={`${PROVIDER_LABEL[app.provider]} · ${app.baseUrl}`}
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <View style={styles.badges}>
        {app.organizationId === null ? (
          <Badge label="Instance-wide" tone="info" />
        ) : (
          <Badge label="This organization" tone="muted" />
        )}
        {app.readOnly ? <Badge label="Read-only" tone="muted" /> : null}
        <SealedBadge
          configured={
            app.provider === 'github' ? app.hasPrivateKey : app.hasClientSecret
          }
        />
      </View>

      <WebhookEndpoint app={app} />

      {editing ? (
        <GitAppEditor
          provider={app.provider}
          existing={app}
          scope={scope}
          onDone={onCancelEdit}
          onCancel={onCancelEdit}
        />
      ) : app.readOnly ? (
        <Text style={styles.readOnlyNote}>
          Registered for the whole instance. An instance administrator manages
          it; your organization can connect accounts through it.
        </Text>
      ) : (
        <ButtonRow align="end">
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
        </ButtonRow>
      )}
    </SectionPanel>
  )
}

/**
 * The "create a GitHub App for me" flow.
 *
 * The manifest goes to GitHub as a **form POST** — see
 * `submitGithubAppManifest` for why a navigation would silently do nothing.
 * The manifest already carries the new app's scoped webhook URL and its setup
 * URL, so neither the webhook nor the resulting installation has to be wired up
 * by hand afterwards.
 */
function GithubManifestButton({
  scope,
  organizationLogin,
  disabled,
}: Readonly<{ scope: Scope; organizationLogin: string | null; disabled: boolean }>) {
  const start = useStartGithubAppManifest(scope)
  const [error, setError] = useState<string | null>(null)

  return (
    <View style={styles.manifest}>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      <Button
        label="Create a GitHub App"
        busyLabel="Preparing…"
        variant="primary"
        size="sm"
        busy={start.isPending}
        disabled={disabled}
        onPress={() => {
          setError(null)
          start.mutate(
            { organizationLogin },
            {
              onSuccess: (data) => {
                if (!submitGithubAppManifest(data.createUrl, data.manifest)) {
                  setError(MANIFEST_WEB_ONLY_NOTE)
                }
              },
              onError: (err) => {
                setError(errorMessage(err, 'Failed to start the manifest flow'))
              },
            },
          )
        }}
      />
    </View>
  )
}

/**
 * Registered Git provider applications for one scope.
 *
 * The same component serves both surfaces. `admin` manages the instance-wide
 * collection; `org` manages an organization's own and additionally *lists*
 * instance-wide ones so the connect flow can offer them — those arrive with
 * `readOnly: true` and are shown without edit controls.
 */
export function GitAppsSection({
  scope = 'admin',
  organizationLogin = null,
}: Readonly<{ scope?: Scope; organizationLogin?: string | null }> = {}) {
  const query = useGitApps(scope)
  const [adding, setAdding] = useState<Provider | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const apps = useMemo(() => query.data ?? [], [query.data])

  // A row that disappeared underneath an open editor must not leave the form
  // hanging over nothing.
  useEffect(() => {
    if (editingId && !apps.some((app) => app.id === editingId)) setEditingId(null)
  }, [apps, editingId])

  const loadError = query.isError
    ? errorMessage(query.error, 'Failed to load Git applications')
    : null

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Git providers</Text>
      <Text style={orgPanelStyles.pageCopy}>
        {scope === 'admin'
          ? 'Applications the whole instance shares when connecting repositories. Every organization can connect accounts through these.'
          : 'Applications this organization connects repositories through, plus any the instance shares. Secrets are sealed on save and never read back.'}
      </Text>

      {loadError ? <Text style={orgPanelStyles.error}>{loadError}</Text> : null}

      {query.isLoading ? <LoadingState /> : null}

      {!query.isLoading && apps.length === 0 && !adding ? (
        <EmptyState
          panel
          title="No applications registered"
          hint="Register a GitHub App or a GitLab OAuth application to start connecting repositories. Each one gets its own webhook URL."
        />
      ) : null}

      {apps.map((app) => (
        <GitAppRow
          key={app.id}
          app={app}
          scope={scope}
          editing={editingId === app.id}
          onEdit={() => {
            setAdding(null)
            setEditingId(app.id)
          }}
          onCancelEdit={() => setEditingId(null)}
        />
      ))}

      {adding ? (
        <SectionPanel
          title={`Add ${PROVIDER_LABEL[adding]}`}
          hint="Registers an application you already created with the provider."
        >
          <SegmentedControl
            options={[
              { value: 'github', label: 'GitHub' },
              { value: 'gitlab', label: 'GitLab' },
            ]}
            value={adding}
            onChange={(value) => setAdding(value as Provider)}
          />
          <GitAppEditor
            key={adding}
            provider={adding}
            scope={scope}
            onDone={() => setAdding(null)}
            onCancel={() => setAdding(null)}
          />
        </SectionPanel>
      ) : (
        <ButtonRow>
          <Button
            label="Add application"
            variant="secondary"
            size="sm"
            onPress={() => {
              setEditingId(null)
              setAdding('github')
            }}
          />
          <GithubManifestButton
            scope={scope}
            organizationLogin={organizationLogin}
            disabled={query.isLoading}
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
  editor: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  manifest: {
    gap: spacing.xs,
  },
  readOnlyNote: {
    color: colors.textMuted,
    fontSize: 13,
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
})
