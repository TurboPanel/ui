import * as Clipboard from 'expo-clipboard'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createLicense,
  fetchOrgServers,
  fetchPublicUrls,
  isForbiddenError,
  type CreatedLicense,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  defaultDevInstallBaseUrl,
  defaultDevInstallHttpBaseUrl,
  resolveDisplayedInstallCommand,
} from '@/lib/install-command'
import { colors, spacing } from '@/lib/theme'

const POLL_FAILURE_THRESHOLD = 3

function isAuthorizationError(err: unknown): boolean {
  return (
    isForbiddenError(err)
    || (err instanceof Error && err.message.includes('HTTP 401'))
  )
}

type WizardStep = 'create' | 'install' | 'waiting'

type AddServerWizardProps = Readonly<{
  onComplete: () => void
  onDismiss?: () => void
}>

type DevInstallUrlFieldsProps = Readonly<{
  installBaseUrl: string
  managedUrls: string[]
  onChange: (url: string) => void
  editable?: boolean
}>

function DevInstallUrlFields({
  installBaseUrl,
  managedUrls,
  onChange,
  editable = true,
}: DevInstallUrlFieldsProps) {
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
      <View style={styles.devUrlQuickPicks}>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => onChange(defaultDevInstallBaseUrl(managedUrls))}
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
          style={[styles.primaryButton, creating && styles.buttonDisabled]}
          disabled={creating}
          onPress={onContinue}
        >
          <Text style={styles.primaryButtonText}>
            {creating ? 'Preparing…' : 'Continue'}
          </Text>
        </Pressable>
        {onCancel ? (
          <Pressable
            style={styles.secondaryButton}
            disabled={creating}
            onPress={onCancel}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
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
      <Text style={styles.warning}>
        Run this install command on the new server. The registration key is
        embedded and can only enroll one host.
      </Text>
      <Text style={styles.secretLabel}>Install command</Text>
      {__DEV__ ? (
        <DevInstallUrlFields
          installBaseUrl={installBaseUrl}
          managedUrls={managedUrls}
          onChange={onInstallBaseUrlChange}
        />
      ) : null}
      <Text selectable style={styles.secretValue}>
        {displayedInstallCommand}
      </Text>
      <Pressable style={styles.secondaryButton} onPress={onCopyInstallCommand}>
        <Text style={styles.secondaryButtonText}>
          {installCommandCopied
            ? 'Copied install command'
            : 'Copy install command'}
        </Text>
      </Pressable>
      <Text style={orgPanelStyles.muted}>
        Run this command on your new server, then click Continue.
      </Text>
      <Pressable style={styles.primaryButton} onPress={onContinue}>
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
  onFinish: () => void
}>

function WaitingStep({
  pollError,
  connectedServer,
  elapsedSeconds,
  onRetry,
  onCancel,
  onFinish,
}: WaitingStepProps) {
  if (pollError) {
    return (
      <View style={styles.waiting}>
        <Text style={orgPanelStyles.error}>{pollError}</Text>
        <View style={styles.waitingActions}>
          <Pressable style={styles.primaryButton} onPress={onRetry}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (connectedServer == null) {
    return (
      <View style={styles.waiting}>
        <View style={styles.waitingStatus}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={orgPanelStyles.muted}>
            Still waiting… ({elapsedSeconds}s)
          </Text>
        </View>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.waiting}>
      <Text style={styles.success}>
        ✓ Server connected —{' '}
        <Text style={styles.successHostname}>
          {connectedServer.hostname?.trim() || connectedServer.id}
        </Text>
      </Text>
      <Pressable style={styles.primaryButton} onPress={onFinish}>
        <Text style={styles.primaryButtonText}>Done</Text>
      </Pressable>
    </View>
  )
}

export function AddServerWizard({ onComplete, onDismiss }: AddServerWizardProps) {
  const { handleUnauthorized } = useAuth()
  const [managedUrls, setManagedUrls] = useState<string[]>([])
  const [step, setStep] = useState<WizardStep>('create')
  const [displayName, setDisplayName] = useState('')
  const [installBaseUrl, setInstallBaseUrl] = useState(() =>
    __DEV__ ? defaultDevInstallBaseUrl() : '',
  )
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<CreatedLicense | null>(null)
  const [installCommandCopied, setInstallCommandCopied] = useState(false)
  const [connectedServer, setConnectedServer] = useState<OrgServerRecord | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [pollError, setPollError] = useState<string | null>(null)
  const [pollAttempt, setPollAttempt] = useState(0)

  const resetWizard = () => {
    setStep('create')
    setDisplayName('')
    setInstallBaseUrl(__DEV__ ? defaultDevInstallBaseUrl(managedUrls) : '')
    setCreating(false)
    setCreateError(null)
    setRevealed(null)
    setInstallCommandCopied(false)
    setConnectedServer(null)
    setElapsedSeconds(0)
    setPollError(null)
    setPollAttempt(0)
  }

  const onStartAddServer = async () => {
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createLicense(
        displayName.trim() || undefined,
        __DEV__ ? installBaseUrl : undefined,
      )
      setRevealed(created)
      setInstallCommandCopied(false)
      setDisplayName('')
      setStep('install')
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Failed to start server setup',
      )
    } finally {
      setCreating(false)
    }
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
    if (!__DEV__) {
      return
    }

    let cancelled = false

    fetchPublicUrls()
      .then((result) => {
        if (cancelled) {
          return
        }
        setManagedUrls(result.urls)
        if (result.urls.length > 0) {
          setInstallBaseUrl(defaultDevInstallBaseUrl(result.urls))
        }
      })
      .catch(() => {
        // Non-admin users may get 403 — fall back to location.origin.
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (step !== 'waiting' || !revealed) {
      return
    }

    setElapsedSeconds(0)
    setConnectedServer(null)
    setPollError(null)

    let pollTimer: ReturnType<typeof setInterval> | null = null
    let elapsedTimer: ReturnType<typeof setInterval> | null = null
    let consecutiveFailures = 0

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer)
      if (elapsedTimer) clearInterval(elapsedTimer)
      pollTimer = null
      elapsedTimer = null
    }

    const checkServers = async () => {
      try {
        const { servers } = await fetchOrgServers()
        consecutiveFailures = 0
        const match = servers.find(
          (s) => s.licenseId === revealed.licenseId && s.connected,
        )
        if (match) {
          setConnectedServer(match)
          stopPolling()
        }
      } catch (err) {
        if (isAuthorizationError(err)) {
          await handleUnauthorized()
          setPollError(
            err instanceof Error ? err.message : 'Session expired or access denied',
          )
          stopPolling()
          return
        }

        consecutiveFailures += 1
        if (consecutiveFailures >= POLL_FAILURE_THRESHOLD) {
          setPollError(
            err instanceof Error ? err.message : 'Failed to check server status',
          )
          stopPolling()
        }
      }
    }

    void checkServers()
    pollTimer = setInterval(() => void checkServers(), 3000)
    elapsedTimer = setInterval(() => {
      setElapsedSeconds((current) => current + 1)
    }, 1000)

    return () => {
      stopPolling()
    }
  }, [step, revealed, pollAttempt, handleUnauthorized])

  const onRetryPolling = () => {
    setPollError(null)
    setPollAttempt((current) => current + 1)
  }

  const clearCreateErrorOnChange = (setter: (value: string) => void) =>
    (text: string) => {
      setter(text)
      setCreateError(null)
    }

  return (
    <SectionPanel
      title="Add server"
      hint="Install the TurboPanel daemon on a new host"
    >
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
          onFinish={onFinish}
        />
      ) : null}
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
    gap: spacing.sm,
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
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: colors.buttonText,
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
  warning: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
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
