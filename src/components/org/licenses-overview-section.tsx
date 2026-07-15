import { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchLicenses,
  invalidateLicense,
  isForbiddenError,
  type LicenseRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function licenseTitle(license: LicenseRecord): string {
  return license.displayName?.trim() || 'Unnamed license'
}

function boundServerLabel(license: LicenseRecord): string | null {
  const bound = license.boundServer
  if (!bound) return null
  const name = bound.displayName?.trim() || bound.id
  const status = bound.connected ? 'online' : 'offline'
  return `${name} (${status})`
}

function LicenseInvalidateActions({
  canOwn,
  isColocatedControlPlane,
  isConfirming,
  isInvalidating,
  onConfirm,
  onRequestConfirm,
  onCancel,
}: Readonly<{
  canOwn: boolean
  isColocatedControlPlane: boolean
  isConfirming: boolean
  isInvalidating: boolean
  onConfirm: () => void
  onRequestConfirm: () => void
  onCancel: () => void
}>) {
  if (isColocatedControlPlane) {
    return <Text style={orgPanelStyles.muted}>Local control plane</Text>
  }

  if (!canOwn) {
    return null
  }

  if (!isConfirming) {
    return (
      <Pressable
        style={[
          styles.secondaryButton,
          isInvalidating && styles.buttonDisabled,
        ]}
        disabled={isInvalidating}
        onPress={onRequestConfirm}
      >
        <Text style={styles.secondaryButtonText}>
          {isInvalidating ? 'Invalidating...' : 'Invalidate'}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.confirmActions}>
      <Pressable
        style={[
          styles.secondaryButton,
          isInvalidating && styles.buttonDisabled,
        ]}
        disabled={isInvalidating}
        onPress={onConfirm}
      >
        <Text style={styles.secondaryButtonText}>
          {isInvalidating ? 'Invalidating...' : 'Confirm'}
        </Text>
      </Pressable>
      <Pressable
        style={styles.cancelButton}
        disabled={isInvalidating}
        onPress={onCancel}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  )
}

function LicenseCard({
  license,
  canOwn,
  isInvalidating,
  isConfirming,
  onRequestConfirm,
  onConfirm,
  onCancel,
}: Readonly<{
  license: LicenseRecord
  canOwn: boolean
  isInvalidating: boolean
  isConfirming: boolean
  onRequestConfirm: () => void
  onConfirm: () => void
  onCancel: () => void
}>) {
  const isColocatedControlPlane = license.revocable === false
  const usedBy = boundServerLabel(license)

  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <Text style={orgPanelStyles.detailTitle}>
          {licenseTitle(license)}
        </Text>
        <LicenseInvalidateActions
          canOwn={canOwn}
          isColocatedControlPlane={isColocatedControlPlane}
          isConfirming={isConfirming}
          isInvalidating={isInvalidating}
          onConfirm={onConfirm}
          onRequestConfirm={onRequestConfirm}
          onCancel={onCancel}
        />
      </View>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Created: </Text>
        {new Date(license.createdAt).toLocaleString()}
      </Text>
      {usedBy ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Used by: </Text>
          {usedBy}
        </Text>
      ) : null}
      {canOwn && isConfirming ? (
        <Text style={orgPanelStyles.muted}>
          This disconnects any server using this key from the control
          plane.
        </Text>
      ) : null}
    </View>
  )
}

function LicensesListBody({
  loading,
  licenses,
  canOwn,
  invalidating,
  confirmingId,
  onRequestConfirm,
  onConfirm,
  onCancel,
}: Readonly<{
  loading: boolean
  licenses: LicenseRecord[]
  canOwn: boolean
  invalidating: Set<string>
  confirmingId: string | null
  onRequestConfirm: (licenseId: string) => void
  onConfirm: (licenseId: string) => void
  onCancel: () => void
}>) {
  if (loading && licenses.length === 0) {
    return <Text style={orgPanelStyles.muted}>Loading...</Text>
  }

  if (licenses.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        No active registration keys yet.
      </Text>
    )
  }

  return (
    <View style={styles.list}>
      {licenses.map((license) => (
        <LicenseCard
          key={license.id}
          license={license}
          canOwn={canOwn}
          isInvalidating={invalidating.has(license.id)}
          isConfirming={confirmingId === license.id}
          onRequestConfirm={() => onRequestConfirm(license.id)}
          onConfirm={() => onConfirm(license.id)}
          onCancel={onCancel}
        />
      ))}
    </View>
  )
}

export function LicensesOverviewSection({ orgId }: Readonly<{ orgId: string }>) {
  const { handleUnauthorized } = useAuth()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [licenses, setLicenses] = useState<LicenseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [invalidating, setInvalidating] = useState<Set<string>>(() => new Set())
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

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

  const onInvalidateLicense = async (licenseId: string) => {
    setInvalidating((current) => new Set(current).add(licenseId))
    setError(null)
    try {
      await invalidateLicense(licenseId)
      setConfirmingId((current) => (current === licenseId ? null : current))
      await loadLicenses()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to invalidate license')
    } finally {
      setInvalidating((current) => {
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
        Registration keys issued to servers in your organization. Invalidate a
        key to disconnect its server from the control plane.
      </Text>

      <SectionPanel title="Your licenses" hint="Active registration keys">
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        <LicensesListBody
          loading={loading}
          licenses={licenses}
          canOwn={canOwn}
          invalidating={invalidating}
          confirmingId={confirmingId}
          onRequestConfirm={setConfirmingId}
          onConfirm={(licenseId) => void onInvalidateLicense(licenseId)}
          onCancel={() => setConfirmingId(null)}
        />
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
  confirmActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  secondaryButtonText: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
