import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  CopyButton,
  LoadingState,
  SectionPanel,
  TextField,
  WizardSteps,
} from '@/components/ui'
import { AddServerTierSection } from '@/components/org/add-server-tier-section'
import { useAuth } from '@/lib/auth-context'
import { validateDisplayName } from '@/lib/display-name'
import {
  isForbiddenError,
  NoLicenseAvailableError,
  type CreatedLicense,
  type LicenseAvailability,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  defaultDevCaddyHttpsBaseUrl,
  defaultDevInstallBaseUrl,
  parseInstallBaseUrl,
  resolveDisplayedInstallCommand,
} from '@/lib/install-command'
import { installTlsHint } from '@/lib/install-tls'
import { orEmptyArray } from '@/lib/or-empty-array'
import { orgBillingHref } from '@/lib/org-navigation'
import { usePublicUrlsOptional } from '@/lib/queries/admin'
import { useCreateLicense, useOrgServers } from '@/lib/queries/servers'
import { chrome, colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const POLL_FAILURE_THRESHOLD = 3
const WAITING_POLL_MS = 3000

function isAuthorizationError(err: unknown): boolean {
  return (
    isForbiddenError(err)
    || (err instanceof Error && err.message.includes('HTTP 401'))
  )
}

type WizardStep = 'create' | 'install' | 'waiting'

const WIZARD_STEPS: readonly { id: WizardStep; label: string }[] = [
  { id: 'create', label: 'Name' },
  { id: 'install', label: 'Install' },
  { id: 'waiting', label: 'Connect' },
]


type AddServerWizardProps = Readonly<{
  orgId: string
  onComplete: () => void
  onDismiss?: () => void
}>

type DevInstallUrlFieldsProps = Readonly<{
  installBaseUrl: string
  managedUrls: string[]
  onChange: (url: string) => void
  editable?: boolean
  /** Install step: the origin was already checked and the command is fixed. */
  locked?: boolean
}>

function managedInstallOrigins(managedUrls: string[]): string[] {
  const seen = new Set<string>()
  const origins: string[] = []
  for (const raw of managedUrls) {
    const origin = parseInstallBaseUrl(raw)
    if (!origin || seen.has(origin)) continue
    seen.add(origin)
    origins.push(origin)
  }
  return origins.sort((a, b) => a.localeCompare(b))
}

function DevInstallUrlFields({
  installBaseUrl,
  managedUrls,
  onChange,
  editable = true,
  locked = false,
}: DevInstallUrlFieldsProps) {
  const origins = managedInstallOrigins(managedUrls)
  const selected = parseInstallBaseUrl(installBaseUrl)
  const tlsHint = installTlsHint(selected ?? installBaseUrl)
  const canEdit = editable && !locked

  return (
    <>
      <TextField
        label="Public install URL (dev)"
        value={installBaseUrl}
        onChangeText={onChange}
        placeholder="https://192.168.1.10:8443"
        autoCapitalize="none"
        autoCorrect={false}
        editable={canEdit}
      />
      {origins.length > 0 ? (
        <View style={styles.devUrlQuickPicks}>
          {origins.map((origin) => {
            const active = selected === origin
            return (
              <Pressable
                key={origin}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: !canEdit }}
                disabled={!canEdit}
                style={[
                  styles.secondaryButton,
                  active && styles.devUrlChipActive,
                ]}
                onPress={() => onChange(origin)}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    active && styles.devUrlChipTextActive,
                  ]}
                >
                  {origin}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
      {canEdit ? (
        <ButtonRow>
          <Button
            label="Use HTTPS (:8443)"
            size="sm"
            onPress={() => onChange(defaultDevCaddyHttpsBaseUrl(managedUrls))}
          />
        </ButtonRow>
      ) : null}
      {locked ? (
        <Text style={panelStyles.muted}>
          This address was checked against the Platform CA certificate. The
          install command is the one the control plane issued.
        </Text>
      ) : null}
      {tlsHint ? (
        <Text style={panelStyles.muted}>{tlsHint}</Text>
      ) : null}
    </>
  )
}

type CreateStepProps = Readonly<{
  name: string
  installBaseUrl: string
  managedUrls: string[]
  creating: boolean
  createError: string | null
  /** Set when the refusal was "no license available" and there is no tier section to fix it in place. */
  billingHref: string | null
  /** Hosted: which tier the server needs, the size one-liner, and Restore / Buy for that tier. */
  tierSection?: ReactNode
  onDisplayNameChange: (text: string) => void
  onInstallBaseUrlChange: (url: string) => void
  onContinue: () => void
  onCancel?: () => void
}>

function CreateStep({
  name,
  installBaseUrl,
  managedUrls,
  creating,
  createError,
  billingHref,
  tierSection,
  onDisplayNameChange,
  onInstallBaseUrlChange,
  onContinue,
  onCancel,
}: CreateStepProps) {
  const router = useRouter()
  return (
    <View style={styles.form}>
      <TextField
        label="Server name (optional)"
        value={name}
        onChangeText={onDisplayNameChange}
        placeholder="Production web server"
        editable={!creating}
      />
      {tierSection}
      {createError ? (
        <Text style={panelStyles.error}>{createError}</Text>
      ) : null}
      {createError && billingHref ? (
        <ButtonRow>
          <Button
            label="Open billing"
            size="sm"
            onPress={() => router.push(billingHref)}
          />
        </ButtonRow>
      ) : null}
      {__DEV__ ? (
        <>
          <DevInstallUrlFields
            installBaseUrl={installBaseUrl}
            managedUrls={managedUrls}
            onChange={onInstallBaseUrlChange}
            editable={!creating}
          />
          <Text style={panelStyles.muted}>
            Used for TURBOPANEL_HOST and download URLs in the install command.
          </Text>
        </>
      ) : null}
      <ButtonRow>
        <Button
          label="Continue"
          busyLabel="Preparing…"
          variant="primary"
          busy={creating}
          onPress={onContinue}
        />
        {onCancel ? (
          <Button label="Cancel" disabled={creating} onPress={onCancel} />
        ) : null}
      </ButtonRow>
    </View>
  )
}

type InstallStepProps = Readonly<{
  installBaseUrl: string
  managedUrls: string[]
  displayedInstallCommand: string
  onInstallBaseUrlChange: (url: string) => void
  onContinue: () => void
}>

function InstallStep({
  installBaseUrl,
  managedUrls,
  displayedInstallCommand,
  onInstallBaseUrlChange,
  onContinue,
}: InstallStepProps) {
  return (
    <View style={styles.revealed}>
      <View style={panelStyles.calloutWarning}>
        <Text style={panelStyles.calloutWarningText}>
          Run this install command on the new server. The registration key is
          embedded and can only enroll one host.
        </Text>
      </View>
      <Text style={styles.secretLabel}>Install command</Text>
      {__DEV__ ? (
        <DevInstallUrlFields
          installBaseUrl={installBaseUrl}
          managedUrls={managedUrls}
          onChange={onInstallBaseUrlChange}
          editable={false}
          locked
        />
      ) : null}
      <View style={panelStyles.commandCodeBlock}>
        <Text selectable style={styles.secretValue}>
          {displayedInstallCommand}
        </Text>
      </View>
      <CopyButton
        value={displayedInstallCommand}
        label="Copy install command"
        copiedLabel="Copied install command"
      />
      <Text style={panelStyles.muted}>
        Run this command on your new server, then click Continue.
      </Text>
      <Button label="Continue" variant="primary" onPress={onContinue} />
    </View>
  )
}

type WaitingStepProps = Readonly<{
  pollError: string | null
  connectedServer: OrgServerRecord | null
  elapsedSeconds: number
  onRetry: () => void
  onCancel: () => void
  onAddAnother: () => void
  onFinish: () => void
}>

function WaitingActions({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  extraLabel,
  onExtra,
}: Readonly<{
  primaryLabel: string
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  extraLabel?: string
  onExtra?: () => void
}>) {
  return (
    <ButtonRow>
      <Button label={primaryLabel} variant="primary" onPress={onPrimary} />
      {extraLabel && onExtra ? (
        <Button label={extraLabel} onPress={onExtra} />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Button label={secondaryLabel} onPress={onSecondary} />
      ) : null}
    </ButtonRow>
  )
}

function WaitingStep({
  pollError,
  connectedServer,
  elapsedSeconds,
  onRetry,
  onCancel,
  onAddAnother,
  onFinish,
}: WaitingStepProps) {
  if (pollError) {
    return (
      <View style={styles.waiting}>
        <Text style={panelStyles.error}>{pollError}</Text>
        <WaitingActions
          primaryLabel="Retry"
          onPrimary={onRetry}
          extraLabel="Add another server"
          onExtra={onAddAnother}
          secondaryLabel="Close"
          onSecondary={onCancel}
        />
      </View>
    )
  }

  if (connectedServer == null) {
    return (
      <View style={styles.waiting}>
        <LoadingState
          label={`Waiting for this host to connect (${elapsedSeconds}s)`}
        />
        <Text style={panelStyles.muted}>
          This key stays under Pending keys until a host enrolls. You can add
          another server now.
        </Text>
        <WaitingActions
          primaryLabel="Add another server"
          onPrimary={onAddAnother}
          secondaryLabel="Close"
          onSecondary={onCancel}
        />
      </View>
    )
  }

  return (
    <View style={styles.waiting}>
      <View style={styles.successRow}>
        <View style={styles.successDot} />
        <Text style={styles.success}>
          Server connected —{' '}
          <Text style={styles.successHostname}>
            {connectedServer.hostname?.trim() || connectedServer.id}
          </Text>
        </Text>
      </View>
      <WaitingActions
        primaryLabel="Done"
        onPrimary={onFinish}
        extraLabel="Add another server"
        onExtra={onAddAnother}
      />
    </View>
  )
}

export function AddServerWizard({
  orgId,
  onComplete,
  onDismiss,
}: AddServerWizardProps) {
  const publicUrlsQuery = usePublicUrlsOptional({ enabled: __DEV__ })
  const managedUrls = orEmptyArray(publicUrlsQuery.data?.urls)
  const createLicenseMutation = useCreateLicense(orgId)
  const [step, setStep] = useState<WizardStep>('create')
  const [displayName, setDisplayName] = useState('')
  const [installBaseUrl, setInstallBaseUrl] = useState(() =>
    __DEV__ ? defaultDevInstallBaseUrl() : '',
  )
  const [createError, setCreateError] = useState<string | null>(null)
  const { billingEnabled } = useAuth()
  const [chosenTierId, setChosenTierId] = useState<string | null>(null)
  /** The last `no_license_available` refusal — its message is shown verbatim, its counts drive Restore / Buy. */
  const [licenseRefusal, setLicenseRefusal] = useState<LicenseAvailability | null>(null)
  const [revealed, setRevealed] = useState<CreatedLicense | null>(null)
  const [connectedServer, setConnectedServer] = useState<OrgServerRecord | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [pollError, setPollError] = useState<string | null>(null)
  const [pollAttempt, setPollAttempt] = useState(0)
  const consecutivePollFailuresRef = useRef(0)
  const creating = createLicenseMutation.isPending

  const waitingForConnection = step === 'waiting' && revealed != null
  const serversQuery = useOrgServers(orgId, {
    enabled: waitingForConnection,
    refetchInterval: waitingForConnection ? WAITING_POLL_MS : false,
    retry: false,
  })

  useEffect(() => {
    if (!__DEV__ || managedUrls.length === 0) return
    setInstallBaseUrl((current) =>
      current.trim() ? current : defaultDevInstallBaseUrl(managedUrls),
    )
  }, [managedUrls])

  const resetWizard = () => {
    setStep('create')
    setDisplayName('')
    setInstallBaseUrl(__DEV__ ? defaultDevInstallBaseUrl(managedUrls) : '')
    setCreateError(null)
    setLicenseRefusal(null)
    setChosenTierId(null)
    setRevealed(null)
    setConnectedServer(null)
    setElapsedSeconds(0)
    setPollError(null)
    setPollAttempt(0)
    consecutivePollFailuresRef.current = 0
  }

  const onStartAddServer = async () => {
    setCreateError(null)
    setLicenseRefusal(null)
    if (displayName.trim()) {
      const validationError = validateDisplayName(displayName)
      if (validationError) {
        setCreateError(validationError)
        return
      }
    }
    const result = await createLicenseMutation.run({
      name: displayName.trim() || undefined,
      installBaseUrl: __DEV__ ? installBaseUrl : undefined,
    })
    if (!result.ok) {
      if (result.error) setCreateError(result.error)
      // No license is free. The control plane's message says why without
      // calling an ending license "in use"; the tier section offers the fix
      // (restore one that is ending, or buy one) for the tier this server needs.
      setLicenseRefusal(
        result.cause instanceof NoLicenseAvailableError ? result.cause.availability : null,
      )
      return
    }
    setRevealed(result.value)
    setDisplayName('')
    setStep('install')
  }

  const displayedInstallCommand = revealed
    ? resolveDisplayedInstallCommand(revealed, installBaseUrl)
    : ''

  const dismissWizard = () => {
    resetWizard()
    if (onDismiss) {
      onDismiss()
      return
    }
    onComplete()
  }

  const onFinish = () => {
    resetWizard()
    onComplete()
  }

  useEffect(() => {
    if (!waitingForConnection || !revealed) {
      return
    }

    setElapsedSeconds(0)
    setConnectedServer(null)
    setPollError(null)
    consecutivePollFailuresRef.current = 0
  }, [waitingForConnection, revealed, revealed?.licenseId, pollAttempt])

  useEffect(() => {
    if (!waitingForConnection || !revealed || !serversQuery.data) {
      return
    }

    const match = serversQuery.data.servers.find(
      (server) => server.licenseId === revealed.licenseId && server.connected,
    )
    if (match) {
      setConnectedServer(match)
    }
  }, [waitingForConnection, revealed, serversQuery.data])

  useEffect(() => {
    if (!waitingForConnection || connectedServer) {
      return
    }

    const err = serversQuery.error
    if (!err) {
      if (serversQuery.isSuccess) {
        consecutivePollFailuresRef.current = 0
      }
      return
    }

    if (isAuthorizationError(err)) {
      setPollError(
        userErrorMessage(err, 'Session expired or access denied'),
      )
      return
    }

    consecutivePollFailuresRef.current += 1
    if (consecutivePollFailuresRef.current >= POLL_FAILURE_THRESHOLD) {
      setPollError(
        userErrorMessage(err, 'Failed to check server status'),
      )
    }
  }, [
    waitingForConnection,
    connectedServer,
    serversQuery.error,
    serversQuery.isSuccess,
    serversQuery.dataUpdatedAt,
  ])

  useEffect(() => {
    if (!waitingForConnection || connectedServer || pollError) {
      return
    }

    const elapsedTimer = setInterval(() => {
      setElapsedSeconds((current) => current + 1)
    }, 1000)

    return () => {
      clearInterval(elapsedTimer)
    }
  }, [waitingForConnection, connectedServer, pollError])

  const onRetryPolling = () => {
    setPollError(null)
    consecutivePollFailuresRef.current = 0
    setPollAttempt((current) => current + 1)
  }

  const clearCreateErrorOnChange = (setter: (value: string) => void) =>
    (text: string) => {
      setter(text)
      setCreateError(null)
    }

  const body = (
    <>
      <WizardSteps steps={WIZARD_STEPS} current={step} />
      {step === 'create' ? (
        <CreateStep
          name={displayName}
          installBaseUrl={installBaseUrl}
          managedUrls={managedUrls}
          creating={creating}
          createError={createError}
          billingHref={licenseRefusal && !billingEnabled ? orgBillingHref(orgId) : null}
          tierSection={
            billingEnabled ? (
              <AddServerTierSection
                orgId={orgId}
                chosenTierId={chosenTierId}
                onChooseTier={setChosenTierId}
                refusal={licenseRefusal}
                onLicenseReady={() => {
                  // A license was restored or bought. When the last Continue
                  // was refused for want of one, carry on without a second click.
                  const retry = licenseRefusal != null
                  setLicenseRefusal(null)
                  setCreateError(null)
                  if (retry) void onStartAddServer()
                }}
              />
            ) : null
          }
          onDisplayNameChange={clearCreateErrorOnChange(setDisplayName)}
          onInstallBaseUrlChange={clearCreateErrorOnChange(setInstallBaseUrl)}
          onContinue={() => void onStartAddServer()}
          onCancel={onDismiss ? dismissWizard : undefined}
        />
      ) : null}

      {step === 'install' && revealed ? (
        <InstallStep
          installBaseUrl={installBaseUrl}
          managedUrls={managedUrls}
          displayedInstallCommand={displayedInstallCommand}
          onInstallBaseUrlChange={setInstallBaseUrl}
          onContinue={() => setStep('waiting')}
        />
      ) : null}

      {step === 'waiting' && revealed ? (
        <WaitingStep
          pollError={pollError}
          connectedServer={connectedServer}
          elapsedSeconds={elapsedSeconds}
          onRetry={onRetryPolling}
          onCancel={dismissWizard}
          onAddAnother={resetWizard}
          onFinish={onFinish}
        />
      ) : null}
    </>
  )

  return (
    <SectionPanel title="Add server" accent>
      {body}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.sm,
  },
  devUrlQuickPicks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  devUrlChipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  devUrlChipTextActive: {
    color: chrome.accent,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '700',
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  successDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: chrome.accent,
  },
  revealed: {
    gap: spacing.sm,
  },
  waiting: {
    gap: spacing.sm,
  },
  secretLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  secretValue: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  success: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  successHostname: {
    color: colors.accent,
    fontWeight: '700',
  },
})
