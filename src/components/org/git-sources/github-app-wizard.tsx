import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { FormSelect } from '@/components/org/form-select'
import {
  Button,
  ButtonRow,
  Checkbox,
  FormField,
  InlineNotice,
  LoadingState,
  MonoText,
  SectionPanel,
  SegmentedControl,
  TextField,
  type WizardStepItem,
  WizardSteps,
} from '@/components/ui'
import {
  gitWebhookHint,
  noWebhookOriginCopy,
  WEBHOOK_ORIGINS_LOAD_ERROR,
  WEBHOOK_ORIGINS_LOADING,
  type WebhookOriginsState,
  webhookOriginsState,
} from '@/lib/git-webhook-url'
import { githubAppNameError, suggestGithubAppName } from '@/lib/github-app-name'
import { githubOrgLoginError, normalizeGithubOrgLogin } from '@/lib/github-org-login'
import { MANIFEST_WEB_ONLY_NOTE, submitGithubAppManifest } from '@/lib/github-manifest-submit'
import type { GithubManifestStartInput } from '@/lib/instance-api'
import { useForgeWebhookOrigins, useStartGithubAppManifest } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const GITHUB_DOT_COM = 'https://github.com'

type Step = 'identity' | 'webhook'

const STEPS: readonly WizardStepItem<Step>[] = [
  { id: 'identity', label: 'Application' },
  { id: 'webhook', label: 'Webhook' },
]

type Owner = 'personal' | 'organization'

/** Everything the first step collects, held as one value so the second can go back to it. */
type Identity = {
  name: string
  owner: Owner
  organizationLogin: string
  selfHosted: boolean
  baseUrl: string
  apiUrl: string
  customGitUser: string
  customGitPort: string
}

function blankIdentity(): Identity {
  return {
    name: suggestGithubAppName(),
    owner: 'personal',
    organizationLogin: '',
    selfHosted: false,
    baseUrl: GITHUB_DOT_COM,
    apiUrl: '',
    customGitUser: 'git',
    customGitPort: '22',
  }
}

/** What still stops the first step; `null` once it can be left. */
function identityError(identity: Identity): string | null {
  const nameProblem = githubAppNameError(identity.name)
  if (nameProblem) return nameProblem
  if (identity.owner === 'organization') {
    const loginProblem = githubOrgLoginError(identity.organizationLogin)
    if (loginProblem) return loginProblem
  }
  if (identity.selfHosted && !identity.baseUrl.trim()) {
    return 'A self-hosted GitHub needs its HTML URL.'
  }
  return null
}

/** What still stops registration; `null` once GitHub can be handed the manifest. */
function registerError(
  identity: Identity,
  resolvedOrigin: string,
  originsState: WebhookOriginsState
): string | null {
  if (originsState.kind === 'loading') return 'Webhook addresses are still loading.'
  if (originsState.kind === 'error') return WEBHOOK_ORIGINS_LOAD_ERROR.body
  if (!resolvedOrigin) return noWebhookOriginCopy(originsState.platformManaged).registerError
  const port = Number(identity.customGitPort)
  if (identity.selfHosted && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return 'Custom Git port must be a number between 1 and 65535.'
  }
  return null
}

/** The App definition to hand GitHub. Enterprise fields are sent only when they apply. */
function manifestInput(
  identity: Identity,
  resolvedOrigin: string,
  pullRequests: 'read' | 'write'
): GithubManifestStartInput {
  return {
    name: identity.name.trim(),
    organizationLogin:
      identity.owner === 'organization'
        ? normalizeGithubOrgLogin(identity.organizationLogin)
        : null,
    webhookOrigin: resolvedOrigin,
    pullRequestAccess: pullRequests,
    ...(identity.selfHosted
      ? {
          baseUrl: identity.baseUrl.trim(),
          apiUrl: identity.apiUrl.trim() || null,
          customGitUser: identity.customGitUser.trim() || null,
          customGitPort: Number(identity.customGitPort),
        }
      : {}),
  }
}

/**
 * `null` when the browser took the form POST.
 *
 * The manifest leaves as a **form POST**, not a navigation: GitHub reads the
 * App definition from a `manifest` form field, and a GET just renders its
 * ordinary blank creation page with nothing filled in. Nothing but a browser
 * can do that, which is what the note says.
 */
function handoffError(
  data: Readonly<{
    createUrl: string
    manifest: Record<string, unknown>
  }>
): string | null {
  return submitGithubAppManifest(data.createUrl, data.manifest) ? null : MANIFEST_WEB_ONLY_NOTE
}

function errorMessage(error: unknown, fallback: string): string {
  return userErrorMessage(error, fallback)
}

/** Step 1: what the App is, who owns it, and which GitHub it lives on. */
function IdentityStep({
  identity,
  patch,
  scope,
  busy,
  onCancel,
  onContinue,
}: Readonly<{
  identity: Identity
  patch: (next: Partial<Identity>) => void
  scope: 'admin' | 'org'
  busy: boolean
  onCancel: () => void
  onContinue: () => void
}>) {
  return (
    <>
      <TextField
        label="Name"
        value={identity.name}
        onChangeText={(name) => patch({ name })}
        hint="GitHub App names are unique across all of GitHub, so this is generated. Change it to anything not already taken."
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />

      <FormField
        label="Owner"
        hint="An App created under an organization belongs to the organization, not to whoever clicked the button."
      >
        <SegmentedControl
          options={[
            { value: 'personal', label: 'Personal account' },
            { value: 'organization', label: 'Organization' },
          ]}
          value={identity.owner}
          onChange={(value) => patch({ owner: value as Owner })}
        />
      </FormField>

      {identity.owner === 'organization' ? (
        <TextField
          label="GitHub organization"
          value={identity.organizationLogin}
          onChangeText={(organizationLogin) => patch({ organizationLogin })}
          placeholder="acme"
          hint="The login in github.com/acme — not the organization's display name."
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
      ) : null}

      <InlineNotice
        title={
          scope === 'admin'
            ? 'Available to every organization on this control plane'
            : 'Available to this organization only'
        }
        body={
          scope === 'admin'
            ? 'Apps registered here are always shared with every organization, so this one is created public on GitHub — a private App can only be installed on the account that owns it.'
            : "Apps registered here always belong to this organization, so this one is created private on GitHub. Only an administrator can register an instance-wide App, on the instance's own Git Providers page."
        }
      />

      <FormField label="GitHub Enterprise" hint="Leave off for github.com.">
        <Checkbox
          checked={identity.selfHosted}
          onPress={() => patch({ selfHosted: !identity.selfHosted })}
          disabled={busy}
          label="This is a self-hosted GitHub"
        />
      </FormField>

      {identity.selfHosted ? (
        <View style={styles.nested}>
          <TextField
            label="HTML URL"
            value={identity.baseUrl}
            onChangeText={(baseUrl) => patch({ baseUrl })}
            placeholder="https://github.acme.test"
            hint="Where operators browse the App and install it."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <TextField
            label="API URL"
            value={identity.apiUrl}
            onChangeText={(apiUrl) => patch({ apiUrl })}
            placeholder="https://github.acme.test/api/v3"
            hint="Leave empty to derive it from the HTML URL."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <TextField
            label="Custom Git user"
            value={identity.customGitUser}
            onChangeText={(customGitUser) => patch({ customGitUser })}
            placeholder="git"
            hint="Only used when cloning over SSH. GitHub App sources clone over HTTPS with a minted token and ignore this."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <TextField
            label="Custom Git port"
            value={identity.customGitPort}
            onChangeText={(customGitPort) => patch({ customGitPort })}
            placeholder="22"
            hint="Same — SSH clones only."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
        </View>
      ) : null}

      <ButtonRow align="end">
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
        <Button label="Continue" variant="primary" onPress={onContinue} />
      </ButtonRow>
    </>
  )
}

/**
 * The endpoint picker, once the addresses are known. Loading and a failed read
 * are their own states: neither is an empty list, and the empty notice would
 * tell a configured operator they have no public URL.
 */
function EndpointField({
  originsState,
  resolvedOrigin,
  onOriginChange,
  busy,
}: Readonly<{
  originsState: WebhookOriginsState
  resolvedOrigin: string
  onOriginChange: (origin: string) => void
  busy: boolean
}>) {
  if (originsState.kind === 'loading') return <LoadingState label={WEBHOOK_ORIGINS_LOADING} />
  if (originsState.kind === 'error') {
    return (
      <InlineNotice
        tone="warning"
        title={WEBHOOK_ORIGINS_LOAD_ERROR.title}
        body={WEBHOOK_ORIGINS_LOAD_ERROR.body}
      />
    )
  }
  if (originsState.origins.length === 0) {
    const empty = noWebhookOriginCopy(originsState.platformManaged)
    return <InlineNotice tone="warning" title={empty.title} body={empty.wizardBody} />
  }
  return (
    <FormSelect
      value={resolvedOrigin}
      options={originsState.origins.map((origin) => ({ value: origin, label: origin }))}
      placeholder="Select an endpoint…"
      onChange={onOriginChange}
      disabled={busy}
      accessibilityLabel="Webhook endpoint"
    />
  )
}

/** Step 2: where deliveries land, and the one permission that is not read-only. */
export function WebhookStep({
  originsState,
  resolvedOrigin,
  previewUrl,
  onOriginChange,
  pullRequests,
  onPullRequestsChange,
  busy,
  onBack,
  onRegister,
}: Readonly<{
  originsState: WebhookOriginsState
  resolvedOrigin: string
  previewUrl: string | null
  onOriginChange: (origin: string) => void
  pullRequests: 'read' | 'write'
  onPullRequestsChange: (access: 'read' | 'write') => void
  busy: boolean
  onBack: () => void
  onRegister: () => void
}>) {
  const ready = originsState.kind === 'ready' && originsState.origins.length > 0
  return (
    <>
      <FormField
        label="Webhook endpoint"
        hint="GitHub stores one address at creation and never revisits it, so pick the URL this control plane will still answer on."
      >
        <EndpointField
          originsState={originsState}
          resolvedOrigin={resolvedOrigin}
          onOriginChange={onOriginChange}
          busy={busy}
        />
      </FormField>

      {previewUrl ? (
        <View style={styles.preview}>
          <Text style={styles.previewLabel}>Deliveries will arrive at</Text>
          <MonoText numberOfLines={1}>{previewUrl}</MonoText>
        </View>
      ) : null}

      <FormField
        label="Preview deployment access"
        hint={
          pullRequests === 'write'
            ? 'The App may comment on and update pull requests — what a preview deployment needs to post its URL back. This is the only write access it gets.'
            : 'The App can read pull requests but not change them. Everything it does stays read-only.'
        }
      >
        <SegmentedControl
          options={[
            { value: 'read', label: 'Do not update pull requests' },
            { value: 'write', label: 'Read and update pull requests' },
          ]}
          value={pullRequests}
          onChange={(value) => onPullRequestsChange(value as 'read' | 'write')}
        />
      </FormField>

      <InlineNotice
        title="These cannot be changed later"
        body="GitHub bakes the name, the delivery URL and the permission set into the App. Changing the permissions afterwards means every installation has to accept them again by hand."
      />

      <ButtonRow align="end">
        <Button label="Back" variant="ghost" onPress={onBack} disabled={busy} />
        <Button
          label="Register with GitHub"
          busyLabel="Preparing…"
          variant="primary"
          busy={busy}
          disabled={!ready}
          onPress={onRegister}
        />
      </ButtonRow>
    </>
  )
}

/**
 * Register a GitHub App, in two steps.
 *
 * **Everything this collects is creation-only.** GitHub bakes the name, the
 * origin, the webhook URL and the permission set into the App and there is no
 * update path — an existing App keeps its permission set until every
 * installation manually re-accepts. So the wizard asks up front rather than
 * offering these as settings to change later, and says so where it matters.
 */
export function GithubAppWizard({
  scope,
  onCancel,
}: Readonly<{
  /**
   * Which surface is registering, and therefore the App's scope — there is no
   * third option. `admin` writes an instance-wide app (public on GitHub, so
   * any account can install it); `org` writes one owned by the current
   * organization. The instance decides this from the endpoint the manifest
   * flow was started on (`forges/handlers.ts`: `isPublic = organizationId ===
   * null`), so offering it as a choice here could only ever disagree with it.
   */
  scope: 'admin' | 'org'
  onCancel: () => void
}>) {
  const start = useStartGithubAppManifest(scope)
  const webhookOrigins = useForgeWebhookOrigins(scope)

  const [step, setStep] = useState<Step>('identity')
  const [identity, setIdentity] = useState<Identity>(blankIdentity)
  const [webhookOrigin, setWebhookOrigin] = useState('')
  const [pullRequests, setPullRequests] = useState<'read' | 'write'>('read')
  const [error, setError] = useState<string | null>(null)

  const originsState = webhookOriginsState(webhookOrigins)
  const firstOrigin = originsState.kind === 'ready' ? (originsState.origins[0] ?? '') : ''
  const resolvedOrigin = webhookOrigin || firstOrigin

  // The path shape follows the origin: a hosted App resolves from the App-id
  // header and gets the clean URL, a self-hosted one carries its routing ref.
  const previewUrl = useMemo(() => {
    if (!resolvedOrigin) return null
    return gitWebhookHint([resolvedOrigin], 'github', 'to-be-assigned', identity.baseUrl).webhookUrl
  }, [resolvedOrigin, identity.baseUrl])

  /** Any edit also clears the message the last attempt left behind. */
  const patch = (next: Partial<Identity>) => {
    setIdentity((prev) => ({ ...prev, ...next }))
    setError(null)
  }

  const continueFromIdentity = () => {
    const problem = identityError(identity)
    setError(problem)
    if (problem) return
    setStep('webhook')
  }

  const register = () => {
    const problem = registerError(identity, resolvedOrigin, originsState)
    setError(problem)
    if (problem) return

    start.mutate(manifestInput(identity, resolvedOrigin, pullRequests), {
      onSuccess: (data) => setError(handoffError(data)),
      onError: (err) => setError(errorMessage(err, 'Failed to start the manifest flow')),
    })
  }

  return (
    <SectionPanel
      title="Create a GitHub App"
      hint="GitHub creates the App and hands its credentials straight back."
    >
      <WizardSteps steps={STEPS} current={step} />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      {step === 'identity' ? (
        <IdentityStep
          identity={identity}
          patch={patch}
          scope={scope}
          busy={start.isPending}
          onCancel={onCancel}
          onContinue={continueFromIdentity}
        />
      ) : (
        <WebhookStep
          originsState={originsState}
          resolvedOrigin={resolvedOrigin}
          previewUrl={previewUrl}
          onOriginChange={setWebhookOrigin}
          pullRequests={pullRequests}
          onPullRequestsChange={setPullRequests}
          busy={start.isPending}
          onBack={() => setStep('identity')}
          onRegister={register}
        />
      )}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  nested: {
    gap: spacing.sm,
  },
  preview: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    padding: spacing.md,
  },
  previewLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
})
