import * as Clipboard from 'expo-clipboard'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { validateDisplayName } from '@/lib/display-name'
import {
  isForbiddenError,
  type CreatedLicense,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  defaultDevCaddyHttpsBaseUrl,
  defaultDevInstallBaseUrl,
  defaultDevInstallHttpBaseUrl,
  parseInstallBaseUrl,
  resolveDisplayedInstallCommand,
} from '@/lib/install-command'
import { installTlsHint } from '@/lib/install-tls'
import { orEmptyArray } from '@/lib/or-empty-array'
import { usePublicUrlsOptional } from '@/lib/queries/admin'
import { useCreateLicense, useOrgServers } from '@/lib/queries/servers'
import { chrome, colors, spacing } from '@/lib/theme'

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

function WizardStepIndicator({ step }: Readonly<{ step: WizardStep }>) {
  const activeIndex = WIZARD_STEPS.findIndex((entry) => entry.id === step)

  return (
    <View style={styles.stepRow}>
      {WIZARD_STEPS.map((entry, index) => {
        const done = index < activeIndex
        const active = entry.id === step
        return (
          <View key={entry.id} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                done && styles.stepDotDone,
                active && styles.stepDotActive,
              ]}
            >
              <Text
                style={[
                  styles.stepDotText,
                  done && styles.stepDotTextDone,
                  active && styles.stepDotTextActive,
                ]}
              >
                {index + 1}
              </Text>
            </View>
            <Text
              style={[styles.stepLabel, active && styles.stepLabelActive]}
            >
              {entry.label}
            </Text>
            {index < WIZARD_STEPS.length - 1 ? (
              <View
                style={[
                  styles.stepConnector,
                  index < activeIndex && styles.stepConnectorDone,
                ]}
              />
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

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
}>

function managedInstallOrigins(managedUrls: string[]): string[] {
  const seen = new Set<string>()
  const origins: string[] = []
  for (const raw of managedUrls) {
    const origin = parseInstallBaseUrl(raw, { allowHttp: true })
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
}: DevInstallUrlFieldsProps) {
  const origins = managedInstallOrigins(managedUrls)
  const selected = parseInstallBaseUrl(installBaseUrl, { allowHttp: true })
  const tlsHint = installTlsHint(selected ?? installBaseUrl)

  return (
    <>
      <Text style={styles.label}>Public install URL (dev)</Text>
      <TextInput
        value={installBaseUrl}
        onChangeText={onChange}
        placeholder="https://192.168.1.10:8443"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        style={styles.input}
      />
      {origins.length > 0 ? (
        <View style={styles.devUrlQuickPicks}>
          {origins.map((origin) => {
            const active = selected === origin
            return (
              <Pressable
                key={origin}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                disabled={!editable}
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
      <View style={styles.devUrlQuickPicks}>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => onChange(defaultDevCaddyHttpsBaseUrl(managedUrls))}
        >
          <Text style={styles.secondaryButtonText}>Use HTTPS (:8443)</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => onChange(defaultDevInstallHttpBaseUrl(managedUrls))}
        >
          <Text style={styles.secondaryButtonText}>Use HTTP (:8880)</Text>
        </Pressable>
      </View>
      {tlsHint ? (
        <Text style={orgPanelStyles.muted}>{tlsHint}</Text>
      ) : null}
    </>
  )
}

type CreateStepProps = Readonly<{
  displayName: string
  installBaseUrl: string
  managedUrls: string[]
  creating: boolean
  createError: string | null
  onDisplayNameChange: (text: string) => void
  onInstallBaseUrlChange: (url: string) => void
  onContinue: () => void
  onCancel?: () => void
}>

function CreateStep({
  displayName,
  installBaseUrl,
  managedUrls,
  creating,
  createError,
  onDisplayNameChange,
  onInstallBaseUrlChange,
  onContinue,
  onCancel,
}: CreateStepProps) {
  return (
    <View style={styles.form}>
      <Text style={styles.label}>Server name (optional)</Text>
      <TextInput
        value={displayName}
        onChangeText={onDisplayNameChange}
        placeholder="Production web server"
        placeholderTextColor={colors.textDim}
        editable={!creating}
        style={styles.input}
      />
      {createError ? (
        <Text style={orgPanelStyles.error}>{createError}</Text>
      ) : null}
      {__DEV__ ? (
        <>
          <DevInstallUrlFields
            installBaseUrl={installBaseUrl}
            managedUrls={managedUrls}
            onChange={onInstallBaseUrlChange}
            editable={!creating}
          />
          <Text style={orgPanelStyles.muted}>
            Used for TURBOPANEL_HOST and download URLs in the install command.
          </Text>
        </>
      ) : null}
      <View style={styles.formActions}>
        <Pressable
          style={({ pressed }) => [
            orgPanelStyles.toolbarBtnPrimary,
            styles.primaryButtonFill,
            creating && styles.buttonDisabled,
            pressed && styles.buttonPressed,
            webPointer,
          ]}
          disabled={creating}
          onPress={onContinue}
        >
          <Text style={styles.primaryButtonText}>
            {creating ? 'Preparing…' : 'Continue'}
          </Text>
        </Pressable>
        {onCancel ? (
          <Pressable
            style={({ pressed }) => [
              orgPanelStyles.toolbarBtnSecondary,
              pressed && styles.buttonPressed,
              webPointer,
            ]}
            disabled={creating}
            onPress={onCancel}
          >
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

type InstallStepProps = Readonly<{
  installBaseUrl: string
  managedUrls: string[]
  displayedInstallCommand: string
  installCommandCopied: boolean
  onInstallBaseUrlChange: (url: string) => void
  onCopyInstallCommand: () => void
  onContinue: () => void
}>

function InstallStep({
  installBaseUrl,
  managedUrls,
  displayedInstallCommand,
  installCommandCopied,
  onInstallBaseUrlChange,
  onCopyInstallCommand,
  onContinue,
}: InstallStepProps) {
  return (
    <View style={styles.revealed}>
      <View style={orgPanelStyles.calloutWarning}>
        <Text style={orgPanelStyles.calloutWarningText}>
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
        />
      ) : null}
      <View style={orgPanelStyles.commandCodeBlock}>
        <Text selectable style={styles.secretValue}>
          {displayedInstallCommand}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed && styles.buttonPressed,
          webPointer,
        ]}
        onPress={onCopyInstallCommand}
      >
        <Text style={styles.secondaryButtonText}>
          {installCommandCopied
            ? 'Copied install command'
            : 'Copy install command'}
        </Text>
      </Pressable>
      <Text style={orgPanelStyles.muted}>
        Run this command on your new server, then click Continue.
      </Text>
      <Pressable
        style={({ pressed }) => [
          orgPanelStyles.toolbarBtnPrimary,
          styles.primaryButtonFill,
          pressed && styles.buttonPressed,
          webPointer,
        ]}
        onPress={onContinue}
      >
        <Text style={styles.primaryButtonText}>Continue</Text>
      </Pressable>
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

function WizardChromeButton({
  label,
  onPress,
  variant,
}: Readonly<{
  label: string
  onPress: () => void
  variant: 'primary' | 'secondary'
}>) {
  const primary = variant === 'primary'
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        primary ? orgPanelStyles.toolbarBtnPrimary : orgPanelStyles.toolbarBtnSecondary,
        primary && styles.primaryButtonFill,
        pressed && styles.buttonPressed,
        webPointer,
      ]}
      onPress={onPress}
    >
      <Text
        style={
          primary
            ? styles.primaryButtonText
            : orgPanelStyles.toolbarBtnTextSecondary
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

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
    <View style={styles.waitingActions}>
      <WizardChromeButton
        label={primaryLabel}
        onPress={onPrimary}
        variant="primary"
      />
      {extraLabel && onExtra ? (
        <WizardChromeButton
          label={extraLabel}
          onPress={onExtra}
          variant="secondary"
        />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <WizardChromeButton
          label={secondaryLabel}
          onPress={onSecondary}
          variant="secondary"
        />
      ) : null}
    </View>
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
        <Text style={orgPanelStyles.error}>{pollError}</Text>
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
        <View style={styles.waitingStatus}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={orgPanelStyles.muted}>
            Waiting for this host to connect ({elapsedSeconds}s)
          </Text>
        </View>
        <Text style={orgPanelStyles.muted}>
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
  const [revealed, setRevealed] = useState<CreatedLicense | null>(null)
  const [installCommandCopied, setInstallCommandCopied] = useState(false)
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
    setRevealed(null)
    setInstallCommandCopied(false)
    setConnectedServer(null)
    setElapsedSeconds(0)
    setPollError(null)
    setPollAttempt(0)
    consecutivePollFailuresRef.current = 0
  }

  const onStartAddServer = async () => {
    setCreateError(null)
    if (displayName.trim()) {
      const validationError = validateDisplayName(displayName)
      if (validationError) {
        setCreateError(validationError)
        return
      }
    }
    const result = await createLicenseMutation.run({
      displayName: displayName.trim() || undefined,
      installBaseUrl: __DEV__ ? installBaseUrl : undefined,
    })
    if (!result.ok) {
      if (result.error) setCreateError(result.error)
      return
    }
    setRevealed(result.value)
    setInstallCommandCopied(false)
    setDisplayName('')
    setStep('install')
  }

  const displayedInstallCommand = revealed
    ? resolveDisplayedInstallCommand(revealed, installBaseUrl)
    : ''

  const onCopyInstallCommand = async () => {
    if (!revealed) {
      return
    }

    try {
      await Clipboard.setStringAsync(displayedInstallCommand)
      setInstallCommandCopied(true)
    } catch {
      setInstallCommandCopied(false)
    }
  }

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
        err instanceof Error ? err.message : 'Session expired or access denied',
      )
      return
    }

    consecutivePollFailuresRef.current += 1
    if (consecutivePollFailuresRef.current >= POLL_FAILURE_THRESHOLD) {
      setPollError(
        err instanceof Error ? err.message : 'Failed to check server status',
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
      <WizardStepIndicator step={step} />
      {step === 'create' ? (
        <CreateStep
          displayName={displayName}
          installBaseUrl={installBaseUrl}
          managedUrls={managedUrls}
          creating={creating}
          createError={createError}
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
          installCommandCopied={installCommandCopied}
          onInstallBaseUrlChange={setInstallBaseUrl}
          onCopyInstallCommand={() => void onCopyInstallCommand()}
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
  formActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
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
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
  },
  primaryButtonFill: {
    backgroundColor: chrome.accent,
    borderColor: chrome.accent,
  },
  primaryButtonText: {
    color: chrome.onAccent,
    fontSize: 14,
    fontWeight: '700',
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
  },
  stepItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 0,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  stepDotDone: {
    borderColor: chrome.accent,
    backgroundColor: chrome.accent,
  },
  stepDotText: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  stepDotTextActive: {
    color: chrome.accent,
  },
  stepDotTextDone: {
    color: colors.buttonText,
  },
  stepLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  stepLabelActive: {
    color: colors.text,
  },
  stepConnector: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderArea,
    marginHorizontal: 2,
  },
  stepConnectorDone: {
    backgroundColor: chrome.accent,
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
  waitingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  waitingActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
