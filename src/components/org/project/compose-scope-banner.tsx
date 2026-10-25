import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { usePersistEnvironmentCompose } from '@/components/org/compose-persistence'
import { ConfirmButton } from '@/components/ui'
import { emptyComposeDocument, resolveComposeOverlayState } from '@/lib/compose'
import { environmentDisplayName } from '@/lib/resource-labels'

function EnvironmentOverridingBanner({
  envName,
  canMutate,
  saving,
  onConfirmClear,
}: Readonly<{
  envName: string
  canMutate: boolean
  saving: boolean
  onConfirmClear: () => void
}>) {
  return (
    <View style={[panelStyles.expandedSection, styles.banner]}>
      <Text style={panelStyles.detailTitle}>Environment compose</Text>
      <Text style={panelStyles.muted}>
        {envName} sets its own compose on top of the Base. Reset to the Base removes it, and the
        next deploy runs what the Base says.
      </Text>
      {canMutate ? (
        <ConfirmButton
          label="Reset to the Base"
          confirmLabel="Reset"
          prompt="Reset to the Base?"
          variant="secondary"
          busy={saving}
          onConfirm={onConfirmClear}
        />
      ) : null}
    </View>
  )
}

/**
 * Shown only when an environment has non-blank compose overrides (Reset path).
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
      envName={environmentDisplayName(selectedEnvironment)}
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
