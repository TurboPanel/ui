import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { SectionPanel, SegmentedControl, SettingRow, TextField } from '@/components/ui'
import { ActionButton } from '@/components/ui/v4/action-button'
import { panelStyles } from '@/components/ui/panel-styles'
import type { UpgradeSettings } from '@/lib/instance-api'
import { formatUpgradeBatchLabel, validateUpgradeBatchInput } from '@/lib/upgrade-batch'
import { spacing } from '@/lib/theme'

/** Every server in one group, until an admin lowers it. */
const DEFAULT_SETTINGS: UpgradeSettings = {
  batch: { mode: 'percent', value: 100 },
}

/**
 * The one update setting left: how many servers a daemon rollout updates at
 * once. Updates themselves always run on their own.
 */
export function UpgradeSettingsCard({
  settings,
  loading,
  saving,
  onSave,
}: Readonly<{
  settings: UpgradeSettings | null
  loading: boolean
  saving: boolean
  onSave: (next: UpgradeSettings) => void
}>) {
  const base = settings ?? DEFAULT_SETTINGS
  // The built-in defaults only fill the form. Nothing saves until the real
  // saved settings have loaded, so a failed fetch can never overwrite them.
  const ready = settings !== null && !loading
  const [mode, setMode] = useState(base.batch.mode)
  const [batchValue, setBatchValue] = useState(String(base.batch.value))
  const [batchError, setBatchError] = useState<string | null>(null)

  useEffect(() => {
    setMode(base.batch.mode)
    setBatchValue(String(base.batch.value))
  }, [base.batch.mode, base.batch.value])

  const saveBatch = () => {
    if (!ready) return
    const validated = validateUpgradeBatchInput({ mode, value: batchValue })
    if (!validated.ok) {
      setBatchError(validated.message)
      return
    }
    setBatchError(null)
    onSave({ batch: { mode: validated.mode, value: validated.value } })
  }

  return (
    <SectionPanel title="Servers Updated at Once">
      {!ready && !loading ? (
        <Text style={panelStyles.muted}>
          Settings could not be loaded. Changes are off until they load.
        </Text>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'percent' as const, label: 'Percent' },
            { value: 'count' as const, label: 'Count' },
          ]}
        />
        <TextField
          label={
            mode === 'percent' ? 'Percent of Servers (1 to 100)' : 'Number of Servers (1 to 10000)'
          }
          value={batchValue}
          onChangeText={setBatchValue}
          keyboardType="number-pad"
          placeholder={mode === 'percent' ? '100' : '5'}
          hint={`${formatUpgradeBatchLabel(base.batch.mode, base.batch.value)}. When that is fewer than all, the next servers start on a later check, once every server updating now has finished or failed.`}
          error={batchError}
        />
        <Text style={panelStyles.muted}>
          The default is all: every server updates at once unless you lower it.
        </Text>
        <SettingRow label="Save Servers Updated at Once">
          <ActionButton
            label="Apply"
            variant="quiet"
            size="sm"
            onPress={saveBatch}
            busy={saving}
            busyLabel="Saving…"
            disabled={!ready}
          />
        </SettingRow>
      </View>
    </SectionPanel>
  )
}
