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

/**
 * Register a GitHub App, in two steps.
 *
 * **Everything this collects is creation-only.** GitHub bakes the name, the
 * origin, the webhook URL and the permission set into the App and there is no
 * update path — an existing App keeps its permission set until every
 * installation manually re-accepts. So the wizard asks up front rather than
 * offering these as settings to change later, and says so where it matters.
 *
 * The manifest leaves as a **form POST**, not a navigation: GitHub reads the
 * App definition from a `manifest` form field, and a GET just renders its
 * ordinary blank creation page with nothing filled in.
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
  const [name, setName] = useState(() => suggestGithubAppName())
  const [owner, setOwner] = useState<Owner>('personal')
  const [organizationLogin, setOrganizationLogin] = useState('')
  const [systemWide, setSystemWide] = useState(false)
  const [selfHosted, setSelfHosted] = useState(false)
  const [baseUrl, setBaseUrl] = useState(GITHUB_DOT_COM)
  const [apiUrl, setApiUrl] = useState('')
  const [customGitUser, setCustomGitUser] = useState('git')
  const [customGitPort, setCustomGitPort] = useState('22')
  const [webhookOrigin, setWebhookOrigin] = useState('')
  const [pullRequests, setPullRequests] = useState<'read' | 'write'>('read')
  const [error, setError] = useState<string | null>(null)

  const origins = useMemo(() => publicUrls.data?.urls ?? [], [publicUrls.data])
  const resolvedOrigin = webhookOrigin || origins[0] || ''

  // The path shape follows the origin: a hosted App resolves from the App-id
  // header and gets the clean URL, a self-hosted one carries its routing ref.
  const previewUrl = useMemo(() => {
    if (!resolvedOrigin) return null
    return gitWebhookHint([resolvedOrigin], 'github', 'to-be-assigned', baseUrl).webhookUrl
  }, [resolvedOrigin, baseUrl])

  const continueFromIdentity = () => {
    const nameProblem = githubAppNameError(name)
    if (nameProblem) return setError(nameProblem)
    if (owner === 'organization') {
      const loginProblem = githubOrgLoginError(organizationLogin)
      if (loginProblem) return setError(loginProblem)
    }
    if (selfHosted && !baseUrl.trim()) {
      return setError('A self-hosted GitHub needs its HTML URL.')
    }
    setError(null)
    setStep('webhook')
  }

  const register = () => {
    setError(null)
    if (!resolvedOrigin) {
      return setError(
        'This instance has no public URL yet, so GitHub would have nowhere to deliver to. Set one under Networking first.',
      )
    }
    const port = Number(customGitPort)
    if (selfHosted && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      return setError('Custom Git port must be a number between 1 and 65535.')
    }

    const input: GithubManifestStartInput = {
      name: name.trim(),
      organizationLogin:
        owner === 'organization' ? normalizeGithubOrgLogin(organizationLogin) : null,
      webhookOrigin: resolvedOrigin,
      pullRequestAccess: pullRequests,
      ...(selfHosted
        ? {
          baseUrl: baseUrl.trim(),
          apiUrl: apiUrl.trim() || null,
          customGitUser: customGitUser.trim() || null,
          customGitPort: port,
        }
        : {}),
    }

    start.mutate(input, {
      onSuccess: (data) => {
        if (!submitGithubAppManifest(data.createUrl, data.manifest)) {
          setError(MANIFEST_WEB_ONLY_NOTE)
        }
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Failed to start the manifest flow')
      },
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
          <>
            <TextField
              label="Name"
              value={name}
              onChangeText={(text) => {
                setName(text)
                setError(null)
              }}
              hint="GitHub App names are unique across all of GitHub, so this is generated. Change it to anything not already taken."
              autoCapitalize="none"
              autoCorrect={false}
              editable={!start.isPending}
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
                value={owner}
                onChange={(value) => setOwner(value as Owner)}
              />
            </FormField>

            {owner === 'organization'
              ? (
                <TextField
                  label="GitHub organization"
                  value={organizationLogin}
                  onChangeText={(text) => {
                    setOrganizationLogin(text)
                    setError(null)
                  }}
                  placeholder="acme"
                  hint="The login in github.com/acme — not the organization's display name."
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!start.isPending}
                />
              )
              : null}

            {canBeSystemWide
              ? (
                <FormField
                  label="Availability"
                  hint={systemWide
                    ? 'Registered as a public App so other GitHub accounts can install it. Required for an App every organization shares.'
                    : 'Registered as a private App. GitHub only allows a private App to be installed on the account that owns it.'}
                >
                  <Checkbox
                    checked={systemWide}
                    onPress={() => setSystemWide((prev) => !prev)}
                    disabled={start.isPending}
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
                checked={selfHosted}
                onPress={() => setSelfHosted((prev) => !prev)}
                disabled={start.isPending}
                label="This is a self-hosted GitHub"
              />
            </FormField>

            {selfHosted
              ? (
                <View style={styles.nested}>
                  <TextField
                    label="HTML URL"
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    placeholder="https://github.acme.test"
                    hint="Where operators browse the App and install it."
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!start.isPending}
                  />
                  <TextField
                    label="API URL"
                    value={apiUrl}
                    onChangeText={setApiUrl}
                    placeholder="https://github.acme.test/api/v3"
                    hint="Leave empty to derive it from the HTML URL."
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!start.isPending}
                  />
                  <TextField
                    label="Custom Git user"
                    value={customGitUser}
                    onChangeText={setCustomGitUser}
                    placeholder="git"
                    hint="Only used when cloning over SSH. GitHub App sources clone over HTTPS with a minted token and ignore this."
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!start.isPending}
                  />
                  <TextField
                    label="Custom Git port"
                    value={customGitPort}
                    onChangeText={setCustomGitPort}
                    placeholder="22"
                    hint="Same — SSH clones only."
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!start.isPending}
                  />
                </View>
              )
              : null}

            <ButtonRow align="end">
              <Button label="Cancel" variant="ghost" onPress={onCancel} />
              <Button label="Continue" variant="primary" onPress={continueFromIdentity} />
            </ButtonRow>
          </>
        )
        : (
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
                    onChange={setWebhookOrigin}
                    disabled={start.isPending}
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
                onChange={(value) => setPullRequests(value as 'read' | 'write')}
              />
            </FormField>

            <InlineNotice
              title="These cannot be changed later"
              body="GitHub bakes the name, the delivery URL and the permission set into the App. Changing the permissions afterwards means every installation has to accept them again by hand."
            />

            <ButtonRow align="end">
              <Button
                label="Back"
                variant="ghost"
                onPress={() => setStep('identity')}
                disabled={start.isPending}
              />
              <Button
                label="Register with GitHub"
                busyLabel="Preparing…"
                variant="primary"
                busy={start.isPending}
                disabled={origins.length === 0}
                onPress={register}
              />
            </ButtonRow>
          </>
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
