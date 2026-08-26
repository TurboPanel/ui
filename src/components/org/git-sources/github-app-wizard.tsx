import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { FormSelect } from '@/components/org/form-select'
import {
  Button,
  ButtonRow,
  Checkbox,
  FormField,
  InlineNotice,
  MonoText,
  SegmentedControl,
  TextField,
  WizardSteps,
  type WizardStepItem,
} from '@/components/ui'
import { gitWebhookHint } from '@/lib/git-webhook-url'
import {
  githubAppNameError,
  suggestGithubAppName,
} from '@/lib/github-app-name'
import { githubOrgLoginError, normalizeGithubOrgLogin } from '@/lib/github-org-login'
import {
  MANIFEST_WEB_ONLY_NOTE,
  submitGithubAppManifest,
} from '@/lib/github-manifest-submit'
import type { GithubManifestStartInput } from '@/lib/instance-api'
import { usePublicUrlsOptional, useStartGithubAppManifest } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'

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
  systemWide: boolean
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
    systemWide: false,
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
function registerError(identity: Identity, resolvedOrigin: string): string | null {
  if (!resolvedOrigin) {
    return 'This instance has no public URL yet, so GitHub would have nowhere to deliver to. Set one under Networking first.'
  }
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
  pullRequests: 'read' | 'write',
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
function handoffError(data: Readonly<{
  createUrl: string
  manifest: Record<string, unknown>
}>): string | null {
  return submitGithubAppManifest(data.createUrl, data.manifest) ? null : MANIFEST_WEB_ONLY_NOTE
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** Step 1: what the App is, who owns it, and which GitHub it lives on. */
function IdentityStep({
  identity,
  patch,
  canBeSystemWide,
  busy,
  onCancel,
  onContinue,
}: Readonly<{
  identity: Identity
  patch: (next: Partial<Identity>) => void
  canBeSystemWide: boolean
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

      {identity.owner === 'organization'
        ? (
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
        )
        : null}

      {canBeSystemWide
        ? (
          <FormField
            label="Availability"
            hint={identity.systemWide
              ? 'Registered as a public App so other GitHub accounts can install it. Required for an App every organization shares.'
              : 'Registered as a private App. GitHub only allows a private App to be installed on the account that owns it.'}
          >
            <Checkbox
              checked={identity.systemWide}
              onPress={() => patch({ systemWide: !identity.systemWide })}
              disabled={busy}
              label="Available to every organization on this instance"
            />
          </FormField>
        )
        : null}

      <FormField
        label="GitHub Enterprise"
        hint="Leave off for github.com."
      >
        <Checkbox
          checked={identity.selfHosted}
          onPress={() => patch({ selfHosted: !identity.selfHosted })}
          disabled={busy}
          label="This is a self-hosted GitHub"
        />
      </FormField>

      {identity.selfHosted
        ? (
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
        )
        : null}

      <ButtonRow align="end">
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
        <Button label="Continue" variant="primary" onPress={onContinue} />
      </ButtonRow>
    </>
  )
}

/** Step 2: where deliveries land, and the one permission that is not read-only. */
function WebhookStep({
  origins,
  resolvedOrigin,
  previewUrl,
  onOriginChange,
  pullRequests,
  onPullRequestsChange,
  busy,
  onBack,
  onRegister,
}: Readonly<{
  origins: readonly string[]
  resolvedOrigin: string
  previewUrl: string | null
  onOriginChange: (origin: string) => void
  pullRequests: 'read' | 'write'
  onPullRequestsChange: (access: 'read' | 'write') => void
  busy: boolean
  onBack: () => void
  onRegister: () => void
}>) {
  return (
    <>
      <FormField
        label="Webhook endpoint"
        hint="GitHub stores one address at creation and never revisits it, so pick the URL this instance will still answer on."
      >
        {origins.length > 0
          ? (
            <FormSelect
              value={resolvedOrigin}
              options={origins.map((origin) => ({ value: origin, label: origin }))}
              placeholder="Select an endpoint…"
              onChange={onOriginChange}
              disabled={busy}
              accessibilityLabel="Webhook endpoint"
            />
          )
          : (
            <InlineNotice
              tone="warning"
              title="No public URL configured"
              body="GitHub needs somewhere to deliver. Add a public URL under Networking, then come back."
            />
          )}
      </FormField>

      {previewUrl
        ? (
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>Deliveries will arrive at</Text>
            <MonoText numberOfLines={1}>{previewUrl}</MonoText>
          </View>
        )
        : null}

      <FormField
        label="Preview deployment access"
        hint={pullRequests === 'write'
          ? 'The App may comment on and update pull requests — what a preview deployment needs to post its URL back. This is the only write access it gets.'
          : 'The App can read pull requests but not change them. Everything it does stays read-only.'}
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
          disabled={origins.length === 0}
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
  canBeSystemWide,
  onCancel,
}: Readonly<{
  scope: 'admin' | 'org'
  /** Instance admins only; drives the App's visibility on GitHub. */
  canBeSystemWide: boolean
  onCancel: () => void
}>) {
  const start = useStartGithubAppManifest(scope)
  const publicUrls = usePublicUrlsOptional()

  const [step, setStep] = useState<Step>('identity')
  const [identity, setIdentity] = useState<Identity>(blankIdentity)
  const [webhookOrigin, setWebhookOrigin] = useState('')
  const [pullRequests, setPullRequests] = useState<'read' | 'write'>('read')
  const [error, setError] = useState<string | null>(null)

  const origins = useMemo(() => publicUrls.data?.urls ?? [], [publicUrls.data])
  const resolvedOrigin = webhookOrigin || origins[0] || ''

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
    const problem = registerError(identity, resolvedOrigin)
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
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {step === 'identity'
        ? (
          <IdentityStep
            identity={identity}
            patch={patch}
            canBeSystemWide={canBeSystemWide}
            busy={start.isPending}
            onCancel={onCancel}
            onContinue={continueFromIdentity}
          />
        )
        : (
          <WebhookStep
            origins={origins}
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
