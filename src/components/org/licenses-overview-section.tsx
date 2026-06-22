import { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { AddServerWizard } from '@/components/org/add-server-wizard'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  fetchLicenses,
  revokeLicense,
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

      <AddServerWizard onDone={loadLicenses} />
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
})
