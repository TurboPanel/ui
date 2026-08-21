import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { usePersistEnvironmentCompose } from '@/components/org/compose-persistence'
import { ConfirmButton } from '@/components/ui'
import { emptyComposeDocument, resolveComposeOverlayState } from '@/lib/compose'

function EnvironmentOverridingBanner({
  overriddenKeys,
  canMutate,
  saving,
  onConfirmClear,
}: Readonly<{
  overriddenKeys: string[]
  canMutate: boolean
  saving: boolean
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
        <ConfirmButton
          label="Clear overrides"
          confirmLabel="Confirm"
          prompt="Clear overrides?"
          busy={saving}
          onConfirm={onConfirmClear}
        />
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
})
