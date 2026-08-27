/**
 * Manual registration for an application that already exists.
 *
 * The wizard (`./github-app-wizard.tsx`) is the supported path for a new
 * GitHub App — it has GitHub create the App and hands the credentials back in
 * one round trip. This form is for the cases that flow cannot serve: an App
 * someone already made, a GitHub Enterprise registration done by hand, and
 * every GitLab OAuth application (GitLab has no manifest equivalent).
 */

import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  TextField,
} from '@/components/ui'
import type { ForgeCreate, ForgeSummary, ForgeUpdate } from '@/lib/instance-api'
import { useCreateForge, useUpdateForge } from '@/lib/queries/admin'
import { spacing } from '@/lib/theme'

type Provider = 'github' | 'gitlab'
type Scope = 'admin' | 'org'

const PROVIDER_DEFAULT_ORIGIN: Record<Provider, string> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
}

/**
 * A stored secret is never returned by the API — the form can only report
 * whether one exists, so the badge carries that state in words.
 */
export function SealedBadge({ configured }: Readonly<{ configured: boolean }>) {
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

function editorFrom(app: ForgeSummary): EditorState {
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
 * Every string that differs between the two providers, in one table.
 *
 * The fields themselves are the same shape either way — only the words change —
 * and spelling that as a ternary per label, placeholder and hint made the form
 * mostly branching. Adding a provider is now a third entry here.
 */
const PROVIDER_COPY: Record<Provider, {
  namePlaceholder: string
  appIdLabel: string
  appIdPlaceholder: string
  appIdHint: string
  appIdRequired: string
  originLabel: string
  originHint: string
  clientIdLabel: string
  clientIdPlaceholder: string
  clientIdHint: string
  webhookLabel: string
  webhookHint: string
}> = {
  github: {
    namePlaceholder: 'TurboPanel',
    appIdLabel: 'App ID',
    appIdPlaceholder: '123456',
    appIdHint: "Numeric ID from the App's settings page. Also how a delivery names this App.",
    appIdRequired: 'App ID is required.',
    originLabel: 'GitHub origin',
    originHint: 'GitHub Enterprise Server origin, or github.com.',
    clientIdLabel: 'Client ID',
    clientIdPlaceholder: 'Iv1.0123456789abcdef',
    clientIdHint: 'Needed for the user OAuth flow; leave empty to clear.',
    webhookLabel: 'Webhook secret',
    webhookHint:
      "Signs GitHub's deliveries. Leave empty to keep the stored one; clear it after typing to remove it.",
  },
  gitlab: {
    namePlaceholder: 'TurboPanel (GitLab)',
    appIdLabel: 'Application ID',
    appIdPlaceholder: '0123abcd…',
    appIdHint: 'Application ID from the GitLab OAuth application.',
    appIdRequired: 'Application ID is required.',
    originLabel: 'GitLab origin',
    originHint:
      'Self-managed GitLab origin, or gitlab.com. Apps on different origins stay isolated.',
    clientIdLabel: 'Application ID (OAuth)',
    clientIdPlaceholder: '0123abcd…',
    clientIdHint: 'Client ID used for the authorization-code grant.',
    webhookLabel: 'Webhook token',
    webhookHint:
      'GitLab does not sign deliveries, so this token is the whole credential. Use at least 24 characters.',
  },
}

/** What the operator still has to fill in; `null` once the form can be sent. */
function validationError(form: EditorState, provider: Provider): string | null {
  if (!form.name.trim()) return 'Name is required.'
  if (!form.externalAppId.trim()) return PROVIDER_COPY[provider].appIdRequired
  return null
}

/**
 * The fields to send.
 *
 * The three write-only secrets are included only when the operator actually
 * typed into one, so an edit that renames an app keeps its sealed private key
 * rather than clearing it. A private key has no "clear" verb worth offering, so
 * an emptied one is left out too.
 */
function payloadFrom(
  form: EditorState,
  touched: Record<string, boolean>,
  provider: Provider,
): ForgeUpdate {
  const secrets: ForgeUpdate = {}
  if (touched.privateKeyPem && form.privateKeyPem.trim() !== '') {
    secrets.privateKeyPem = form.privateKeyPem
  }
  if (touched.clientSecret) secrets.clientSecret = nullable(form.clientSecret)
  if (touched.webhookSecret) secrets.webhookSecret = nullable(form.webhookSecret)

  return {
    name: form.name.trim(),
    baseUrl: form.baseUrl.trim() || PROVIDER_DEFAULT_ORIGIN[provider],
    externalAppId: form.externalAppId.trim(),
    appSlug: nullable(form.appSlug),
    clientId: nullable(form.clientId),
    redirectUri: nullable(form.redirectUri),
    ...secrets,
  }
}

/** The credentials the provider issues — a signing key, or a secret plus callback. */
function CredentialFields({
  isGithub,
  existing,
  form,
  set,
  busy,
}: Readonly<{
  isGithub: boolean
  existing?: ForgeSummary
  form: EditorState
  set: (key: keyof EditorState) => (text: string) => void
  busy: boolean
}>) {
  if (isGithub) {
    return (
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
    )
  }

  return (
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
        placeholder="https://panel.example.com/api/client/v1/repositories/gitlab/callback"
        hint="Must match the callback registered on the GitLab application, byte for byte."
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
    </>
  )
}

/**
 * Create / edit form for one app.
 *
 * `existing` decides the verb. The three secret fields are write-only and are
 * sent only when the operator actually typed into one, so an edit that renames
 * an app keeps its sealed private key rather than clearing it.
 */
export function ForgeEditor({
  provider,
  existing,
  scope,
  onDone,
  onCancel,
}: Readonly<{
  provider: Provider
  existing?: ForgeSummary
  scope: Scope
  onDone: () => void
  onCancel: () => void
}>) {
  const create = useCreateForge(scope)
  const update = useUpdateForge(scope)
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
  const copy = PROVIDER_COPY[provider]

  const onSave = () => {
    const invalid = validationError(form, provider)
    setError(invalid)
    if (invalid) return

    const shared = payloadFrom(form, touched, provider)
    const onError = (err: unknown) => {
      setError(errorMessage(err, 'Failed to save the application'))
    }

    if (existing) {
      update.mutate({ id: existing.id, updates: shared }, { onSuccess: onDone, onError })
    } else {
      create.mutate({ provider, ...shared } as ForgeCreate, {
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
        placeholder={copy.namePlaceholder}
        hint="Shown when choosing which application to connect through."
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />

      <TextField
        label={copy.appIdLabel}
        value={form.externalAppId}
        onChangeText={set('externalAppId')}
        placeholder={copy.appIdPlaceholder}
        hint={copy.appIdHint}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />

      <TextField
        label={copy.originLabel}
        value={form.baseUrl}
        onChangeText={set('baseUrl')}
        placeholder={PROVIDER_DEFAULT_ORIGIN[provider]}
        hint={copy.originHint}
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
        label={copy.clientIdLabel}
        value={form.clientId}
        onChangeText={set('clientId')}
        placeholder={copy.clientIdPlaceholder}
        hint={copy.clientIdHint}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />

      <CredentialFields
        isGithub={isGithub}
        existing={existing}
        form={form}
        set={set}
        busy={busy}
      />

      <TextField
        label={copy.webhookLabel}
        labelRight={<SealedBadge configured={existing?.hasWebhookSecret === true} />}
        value={form.webhookSecret}
        onChangeText={set('webhookSecret')}
        hint={copy.webhookHint}
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

const styles = StyleSheet.create({
  editor: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
})
