import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { usePersistEnvironmentCompose } from '@/components/org/compose-persistence'
import {
  emptyComposeDocument,
  mergeComposeOverlay,
  normalizeCompose,
  resolveComposeOverlayState,
} from '@/lib/compose'
import { chrome, colors, spacing } from '@/lib/theme'

function quietButtonTextStyle(
  tone: 'neutral' | 'primary' | 'danger',
): {
  color: string
  fontSize: number
  fontWeight: '600' | '700'
} {
  if (tone === 'primary') return styles.quietBtnTextPrimary
  if (tone === 'danger') return styles.quietBtnTextDanger
  return styles.quietBtnText
}

function QuietButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  tone = 'neutral',
}: Readonly<{
  label: string
  accessibilityLabel?: string
  onPress: () => void
  disabled?: boolean
  tone?: 'neutral' | 'primary' | 'danger'
}>) {
  return (
    <Pressable
      style={[
        styles.quietBtn,
        tone === 'primary' && styles.quietBtnPrimary,
        tone === 'danger' && styles.quietBtnDanger,
        disabled && styles.buttonDisabled,
        webPointer,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={quietButtonTextStyle(tone)}>{label}</Text>
    </Pressable>
  )
}

function InheritedServicesHint({
  serviceNames,
}: Readonly<{ serviceNames: string[] }>) {
  if (serviceNames.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        Inherited services: none defined on the project compose yet.
      </Text>
    )
  }

  return (
    <View style={styles.inheritedRow}>
      <Text style={orgPanelStyles.muted}>Inherited services:</Text>
      <View style={styles.chipRow}>
        {serviceNames.map((name) => (
          <View key={name} style={styles.serviceChip}>
            <Text style={styles.serviceChipText}>{name}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function EnvironmentInheritingBanner({
  displayName,
  canMutate,
  saving,
  inheritedServiceNames,
  onStartFromProject,
}: Readonly<{
  displayName: string
  canMutate: boolean
  saving: boolean
  inheritedServiceNames: string[]
  onStartFromProject: () => void
}>) {
  const [acknowledged, setAcknowledged] = useState(false)

  if (acknowledged) {
    return (
      <View style={[orgPanelStyles.expandedSection, styles.banner]}>
        <Text style={orgPanelStyles.detailTitle}>Environment compose</Text>
        <Text style={orgPanelStyles.muted}>
          Editing overrides only — blank keys continue to inherit from the project
          compose. Save from the editor below when ready.
        </Text>
        <InheritedServicesHint serviceNames={inheritedServiceNames} />
      </View>
    )
  }

  return (
    <View style={[orgPanelStyles.expandedSection, styles.banner]}>
      <Text style={orgPanelStyles.detailTitle}>Environment compose</Text>
      <Text style={orgPanelStyles.muted}>
        {displayName} is inheriting the project compose — no overrides yet.
      </Text>
      {canMutate ? (
        <View style={styles.actions}>
          <QuietButton
            label="Create override"
            tone="primary"
            disabled={saving}
            onPress={() => setAcknowledged(true)}
          />
          <QuietButton
            label="Start from project compose"
            disabled={saving}
            onPress={onStartFromProject}
          />
        </View>
      ) : null}
      <InheritedServicesHint serviceNames={inheritedServiceNames} />
    </View>
  )
}

function EnvironmentOverridingBanner({
  overriddenKeys,
  serviceNames,
  canMutate,
  saving,
  clearArmed,
  onToggleClear,
  onConfirmClear,
}: Readonly<{
  overriddenKeys: string[]
  serviceNames: string[]
  canMutate: boolean
  saving: boolean
  clearArmed: boolean
  onToggleClear: () => void
  onConfirmClear: () => void
}>) {
  const keyCount = overriddenKeys.length
  const keyLabel = keyCount === 1 ? '1 compose key' : `${keyCount} compose keys`
  const keyList = overriddenKeys.join(', ')
  const serviceSummary =
    serviceNames.length > 0
      ? ` Services: ${serviceNames.join(', ')}.`
      : ''

  return (
    <View style={[orgPanelStyles.expandedSection, styles.banner]}>
      <Text style={orgPanelStyles.detailTitle}>Environment compose</Text>
      <Text style={orgPanelStyles.muted}>
        Overriding {keyLabel} of the project compose ({keyList}).
        {serviceSummary}
      </Text>
      {canMutate ? (
        <View style={styles.actions}>
          <QuietButton
            label={clearArmed ? 'Confirm' : 'Clear overrides'}
            tone="danger"
            disabled={saving && !clearArmed}
            onPress={clearArmed ? onConfirmClear : onToggleClear}
          />
          {clearArmed ? (
            <QuietButton label="Cancel" onPress={onToggleClear} />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

export function ComposeScopeBanner() {
  const {
    orgId,
    project,
    selectedEnvironment,
    selectedEnvironmentId,
    baseSelected,
    canManage,
    projectAllowsMutations,
    isSystemProject,
    invalidateEnvironments,
    setError,
  } = useProjectContext()
  const persistEnvironmentCompose = usePersistEnvironmentCompose(
    orgId,
    selectedEnvironmentId ?? '',
  )
  const [clearArmed, setClearArmed] = useState(false)

  const canMutate = canManage && projectAllowsMutations
  const saving = persistEnvironmentCompose.isPending

  const handleStartFromProject = useCallback(async () => {
    if (!selectedEnvironmentId || !project) return
    setError(null)
    const compose = normalizeCompose(project.options?.compose)
    const result = await persistEnvironmentCompose.run(compose)
    if (!result.ok && persistEnvironmentCompose.actionError) {
      setError(persistEnvironmentCompose.actionError)
      return
    }
    await invalidateEnvironments()
  }, [
    selectedEnvironmentId,
    project,
    persistEnvironmentCompose,
    setError,
    invalidateEnvironments,
  ])

  const handleClearOverrides = useCallback(async () => {
    if (!selectedEnvironmentId) return
    setError(null)
    const result = await persistEnvironmentCompose.run(emptyComposeDocument())
    if (!result.ok && persistEnvironmentCompose.actionError) {
      setError(persistEnvironmentCompose.actionError)
      return
    }
    setClearArmed(false)
    await invalidateEnvironments()
  }, [
    selectedEnvironmentId,
    persistEnvironmentCompose,
    setError,
    invalidateEnvironments,
  ])

  if (isSystemProject || !project || baseSelected) return null

  if (!selectedEnvironment) return null

  const overlayState = resolveComposeOverlayState(
    selectedEnvironment.options?.compose,
  )
  const merged = mergeComposeOverlay(
    project.options?.compose,
    selectedEnvironment.options?.compose,
  )
  const inheritedServiceNames = Object.keys(merged.data.services ?? {}).sort(
    (a, b) => a.localeCompare(b),
  )

  if (overlayState.blank) {
    return (
      <EnvironmentInheritingBanner
        displayName={selectedEnvironment.displayName ?? 'This environment'}
        canMutate={canMutate}
        saving={saving}
        inheritedServiceNames={inheritedServiceNames}
        onStartFromProject={() => {
          void handleStartFromProject()
        }}
      />
    )
  }

  return (
    <EnvironmentOverridingBanner
      overriddenKeys={overlayState.overriddenKeys}
      serviceNames={overlayState.serviceNames}
      canMutate={canMutate}
      saving={saving}
      clearArmed={clearArmed}
      onToggleClear={() => setClearArmed((armed) => !armed)}
      onConfirmClear={() => {
        void handleClearOverrides()
      }}
    />
  )
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  inheritedRow: {
    gap: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  serviceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  serviceChipText: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '500',
  },
  quietBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quietBtnPrimary: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  quietBtnDanger: {
    borderColor: colors.borderChip,
    backgroundColor: 'transparent',
  },
  quietBtnText: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '600',
  },
  quietBtnTextPrimary: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  quietBtnTextDanger: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
})
