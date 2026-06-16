import * as Clipboard from 'expo-clipboard'
import { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  createLicense,
  fetchLicenses,
  revokeLicense,
  type CreatedLicense,
  type LicenseRecord,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

function licenseTitle(license: LicenseRecord): string {
  return license.displayName?.trim() || 'Unnamed license'
}

export function LicensesOverviewSection({ orgId }: { orgId: string }) {
  const [licenses, setLicenses] = useState<LicenseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<CreatedLicense | null>(null)
  const [installCommandCopied, setInstallCommandCopied] = useState(false)
  const [revoking, setRevoking] = useState<Set<string>>(() => new Set())

  const loadLicenses = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchLicenses()
      setLicenses(result.licenses)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load licenses')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchLicenses()
        if (!cancelled) {
          setLicenses(result.licenses)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load licenses')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    const timer = setInterval(() => void load(), 5000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [orgId])

  const onCreateLicense = async () => {
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createLicense(displayName.trim() || undefined)
      setRevealed(created)
      setInstallCommandCopied(false)
      setDisplayName('')
      await loadLicenses()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create license')
    } finally {
      setCreating(false)
    }
  }

  const onCopyInstallCommand = async () => {
    if (!revealed) {
      return
    }

    try {
      await Clipboard.setStringAsync(revealed.installCommand)
      setInstallCommandCopied(true)
    } catch {
      setInstallCommandCopied(false)
    }
  }

  const onRevokeLicense = async (licenseId: string) => {
    setRevoking((current) => new Set(current).add(licenseId))
    setError(null)
    try {
      await revokeLicense(licenseId)
      await loadLicenses()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke license')
    } finally {
      setRevoking((current) => {
        const next = new Set(current)
        next.delete(licenseId)
        return next
      })
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Licenses</Text>
      <Text style={styles.copy}>
        Generate server registration keys and revoke licenses that should no
        longer be accepted.
      </Text>

      <SectionPanel title="Your licenses" hint="Active registration keys">
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {loading && licenses.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Loading...</Text>
        ) : licenses.length === 0 ? (
          <Text style={orgPanelStyles.muted}>
            No active registration keys yet.
          </Text>
        ) : (
          <View style={styles.list}>
            {licenses.map((license) => {
              const isRevoking = revoking.has(license.id)

              return (
                <View key={license.id} style={orgPanelStyles.detailCard}>
                  <View style={styles.cardHeader}>
                    <Text style={orgPanelStyles.detailTitle}>
                      {licenseTitle(license)}
                    </Text>
                    <Pressable
                      style={[
                        styles.secondaryButton,
                        isRevoking && styles.buttonDisabled,
                      ]}
                      disabled={isRevoking}
                      onPress={() => void onRevokeLicense(license.id)}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {isRevoking ? 'Revoking...' : 'Revoke'}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>Created: </Text>
                    {new Date(license.createdAt).toLocaleString()}
                  </Text>
                </View>
              )
            })}
          </View>
        )}
      </SectionPanel>

      <SectionPanel
        title="Add a server"
        hint="Generate a license and install command"
      >
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

        {revealed ? (
          <View style={styles.revealed}>
            <Text style={styles.warning}>
              Save this token now - it will not be shown again.
            </Text>
            <Text style={styles.secretLabel}>License token</Text>
            <Text selectable style={styles.secretValue}>
              {revealed.licenseToken}
            </Text>
            <Text style={styles.secretLabel}>Install command</Text>
            <Text selectable style={styles.secretValue}>
              {revealed.installCommand}
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
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setRevealed(null)
                setInstallCommandCopied(false)
              }}
            >
              <Text style={styles.secondaryButtonText}>Done</Text>
            </Pressable>
          </View>
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  list: {
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
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
    marginTop: spacing.md,
    gap: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
    padding: spacing.md,
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
})
