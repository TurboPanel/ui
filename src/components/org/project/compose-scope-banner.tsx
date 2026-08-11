import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { usePersistEnvironmentCompose } from '@/components/org/compose-persistence'
import { emptyComposeDocument, resolveComposeOverlayState } from '@/lib/compose'
import { colors, spacing } from '@/lib/theme'

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
  tone?: 'neutral' | 'danger'
}>) {
  return (
    <Pressable
      style={[
        styles.quietBtn,
        tone === 'danger' && styles.quietBtnDanger,
        disabled && styles.buttonDisabled,
        webPointer,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={
          tone === 'danger' ? styles.quietBtnTextDanger : styles.quietBtnText
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

function EnvironmentOverridingBanner({
  overriddenKeys,
  canMutate,
  saving,
  clearArmed,
  onToggleClear,
  onConfirmClear,
}: Readonly<{
  overriddenKeys: string[]
  canMutate: boolean
  saving: boolean
  clearArmed: boolean
  onToggleClear: () => void
  onConfirmClear: () => void
}>) {
  const keyCount = overriddenKeys.length
  const keyLabel = keyCount === 1 ? '1 compose key' : `${keyCount} compose keys`
  const keyList = overriddenKeys.join(', ')

  return (
    <View style={[orgPanelStyles.expandedSection, styles.banner]}>
      <Text style={orgPanelStyles.detailTitle}>Environment compose</Text>
      <Text style={orgPanelStyles.muted}>
        Overriding {keyLabel} of the project compose ({keyList}).
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

/**
 * Shown only when an environment has non-blank compose overrides (Clear path).
 * Inheriting environments start a blank overlay from the Compose tab — no banner.
 */
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
  if (overlayState.blank) return null

  return (
    <EnvironmentOverridingBanner
      overriddenKeys={overlayState.overriddenKeys}
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
  quietBtnDanger: {
    borderColor: colors.borderChip,
    backgroundColor: 'transparent',
  },
  quietBtnText: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '600',
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
