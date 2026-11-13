import { useEffect, useState } from 'react'
import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, FormField, SegmentedControl, TextField } from '@/components/ui'
import {
  BUILD_CORES_HINT,
  BUILD_CORES_LABEL,
  BUILD_MEMORY_HINT,
  BUILD_MEMORY_LABEL,
  BUILD_SWAP_HINT,
  BUILD_SWAP_LABEL,
  BUILD_SWAP_OPTIONS,
  type BuildLimitValues,
  type BuildSwapChoice,
  buildSwapChoice,
  buildSwapValue,
  formatBuildCores,
  formatBuildMemory,
  parseBuildLimitDrafts,
} from '@/lib/build-limits'

/**
 * The two build limit fields with their own Save, for the organization and
 * server screens (the service screen keeps them inside its own form). Empty
 * means not set at this level.
 */
export function BuildLimitsEditor({
  value,
  canManage,
  pending,
  error,
  onSave,
  scopeLabel,
}: Readonly<{
  value: BuildLimitValues | undefined
  canManage: boolean
  pending: boolean
  error: string | null
  onSave: (values: BuildLimitValues) => void
  /** Names the level in accessibility labels: "Organization", "Server". */
  scopeLabel: string
}>) {
  const [cores, setCores] = useState(formatBuildCores(value?.cores))
  const [memory, setMemory] = useState(formatBuildMemory(value?.memoryBytes))
  const [swap, setSwap] = useState<BuildSwapChoice>(buildSwapChoice(value?.swap))
  const [draftError, setDraftError] = useState<string | null>(null)

  useEffect(() => {
    setCores(formatBuildCores(value?.cores))
    setMemory(formatBuildMemory(value?.memoryBytes))
    setSwap(buildSwapChoice(value?.swap))
  }, [value?.cores, value?.memoryBytes, value?.swap])

  const save = () => {
    const parsed = parseBuildLimitDrafts(cores, memory)
    if (!parsed.ok) {
      setDraftError(parsed.error)
      return
    }
    setDraftError(null)
    onSave({ ...parsed.values, swap: buildSwapValue(swap) })
  }

  const shownError = draftError ?? error
  return (
    <>
      {shownError ? <Text style={panelStyles.error}>{shownError}</Text> : null}
      <TextField
        label={BUILD_CORES_LABEL}
        value={cores}
        onChangeText={setCores}
        editable={canManage && !pending}
        keyboardType="decimal-pad"
        placeholder="Half the cores"
        accessibilityLabel={`${scopeLabel} ${BUILD_CORES_LABEL}`}
        hint={BUILD_CORES_HINT}
      />
      <TextField
        label={`${BUILD_MEMORY_LABEL} (GB)`}
        value={memory}
        onChangeText={setMemory}
        editable={canManage && !pending}
        keyboardType="decimal-pad"
        placeholder="Memory minus 1 GB"
        accessibilityLabel={`${scopeLabel} ${BUILD_MEMORY_LABEL}`}
        hint={BUILD_MEMORY_HINT}
      />
      <FormField label={BUILD_SWAP_LABEL} hint={BUILD_SWAP_HINT}>
        <SegmentedControl
          accessibilityLabel={`${scopeLabel} ${BUILD_SWAP_LABEL}`}
          options={BUILD_SWAP_OPTIONS}
          value={swap}
          disabled={!canManage || pending}
          onChange={setSwap}
        />
      </FormField>
      {canManage ? (
        <ButtonRow>
          <Button
            label="Save Build Limits"
            variant="primary"
            busy={pending}
            disabled={pending}
            onPress={save}
          />
        </ButtonRow>
      ) : (
        <Text style={panelStyles.muted}>Manage permission required.</Text>
      )}
    </>
  )
}
