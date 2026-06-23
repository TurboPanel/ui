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
  isForbiddenError,
  type CreatedLicense,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  defaultDevInstallBaseUrl,
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

export function AddServerWizard({ onDone }: { onDone: () => void }) {
  const { handleUnauthorized } = useAuth()
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
    setInstallBaseUrl(__DEV__ ? defaultDevInstallBaseUrl() : '')
    setCreating(false)
    setCreateError(null)
    setRevealed(null)
    setInstallCommandCopied(false)
    setConnectedServer(null)
    setElapsedSeconds(0)
    setPollError(null)
    setPollAttempt(0)
  }

  const onCreateLicense = async () => {
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
      setCreateError(err instanceof Error ? err.message : 'Failed to create license')
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

  const onCancel = () => {
    resetWizard()
    onDone()
  }

  const onFinish = () => {
    resetWizard()
    onDone()
  }

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

  return (
    <SectionPanel
      title="Set up a new server"
      hint="Generate a license and install command"
    >
      {step === 'create' ? (
        <View style={styles.form}>
          <Text style={styles.label}>Display name (optional)</Text>
          <TextInput
            value={displayName}
            onChangeText={(text) => {
              setDisplayName(text)
              setCreateError(null)
            }}
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
              <Text style={styles.label}>Public install URL (dev)</Text>
              <TextInput
                value={installBaseUrl}
                onChangeText={(text) => {
                  setInstallBaseUrl(text)
                  setCreateError(null)
                }}
                placeholder="https://192.168.1.10:8443"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!creating}
                style={styles.input}
              />
              <Text style={orgPanelStyles.muted}>
                Used for --host and download URLs in the install command.
              </Text>
            </>
          ) : null}
          <Pressable
            style={[styles.primaryButton, creating && styles.buttonDisabled]}
            disabled={creating}
            onPress={() => void onCreateLicense()}
          >
            <Text style={styles.primaryButtonText}>
              {creating ? 'Creating...' : 'Create License'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'install' && revealed ? (
        <View style={styles.revealed}>
          <Text style={styles.warning}>
            Save this token — it will not be shown again.
          </Text>
          <Text style={styles.secretLabel}>License token</Text>
          <Text selectable style={styles.secretValue}>
            {revealed.licenseToken}
          </Text>
          <Text style={styles.secretLabel}>Install command</Text>
          {__DEV__ ? (
            <>
              <Text style={styles.label}>Public install URL (dev)</Text>
              <TextInput
                value={installBaseUrl}
                onChangeText={setInstallBaseUrl}
                placeholder="https://192.168.1.10:8443"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </>
          ) : null}
          <Text selectable style={styles.secretValue}>
            {displayedInstallCommand}
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void onCopyInstallCommand()}
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
            style={styles.primaryButton}
            onPress={() => setStep('waiting')}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'waiting' && revealed ? (
        <View style={styles.waiting}>
          {pollError ? (
            <>
              <Text style={orgPanelStyles.error}>{pollError}</Text>
              <View style={styles.waitingActions}>
                <Pressable style={styles.primaryButton} onPress={onRetryPolling}>
                  <Text style={styles.primaryButtonText}>Retry</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={onCancel}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </>
          ) : connectedServer == null ? (
            <>
              <View style={styles.waitingStatus}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={orgPanelStyles.muted}>
                  Still waiting… ({elapsedSeconds}s)
                </Text>
              </View>
              <Pressable style={styles.secondaryButton} onPress={onCancel}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.success}>
                ✓ Server connected —{' '}
                <Text style={styles.successHostname}>
                  {connectedServer.hostname?.trim() || connectedServer.id}
                </Text>
              </Text>
              <Pressable style={styles.primaryButton} onPress={onFinish}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  form: {
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
