import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import {
  SectionPanel,
  SegmentedControl,
  SettingRow,
  TextField,
  Toggle,
} from '@/components/ui'
import { ActionButton } from '@/components/ui/v4/action-button'
import { panelStyles } from '@/components/ui/panel-styles'
import type { UpgradeSettings } from '@/lib/instance-api'
import { formatUpgradeBatchLabel, validateUpgradeBatchInput } from '@/lib/upgrade-batch'
import { spacing } from '@/lib/theme'

const DEFAULT_SETTINGS: UpgradeSettings = {
  autoUpdate: false,
  batch: { mode: 'count', value: 1 },
  maintenanceWindow: {
    enabled: false,
    startMinute: 120,
    durationMinutes: 120,
    weekdays: [],
  },
}

export function UpgradeSettingsCard({
  settings,
  loading,
  saving,
  onSave,
  hideAutoUpdate = false,
}: Readonly<{
  settings: UpgradeSettings | null
  loading: boolean
  saving: boolean
  onSave: (next: UpgradeSettings) => void
  hideAutoUpdate?: boolean
}>) {
  const base = settings ?? DEFAULT_SETTINGS
  // The built-in defaults only fill the form. Nothing saves until the real
  // saved settings have loaded, so a failed fetch can never overwrite them.
  const ready = settings !== null && !loading
  const [draft, setDraft] = useState(base)
  const [batchValue, setBatchValue] = useState(String(base.batch.value))
  const [batchError, setBatchError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(base)
    setBatchValue(String(base.batch.value))
  }, [base.autoUpdate, base.batch.mode, base.batch.value, base.maintenanceWindow.enabled])

  const saveBatch = () => {
    if (!ready) return
    const validated = validateUpgradeBatchInput({
      mode: draft.batch.mode,
      value: batchValue,
    })
    if (!validated.ok) {
      setBatchError(validated.message)
      return
    }
    setBatchError(null)
    onSave({
      ...draft,
      batch: { mode: validated.mode, value: validated.value },
    })
  }

  return (
    <SectionPanel title="Automatic updates">
      {!ready && !loading ? (
        <Text style={panelStyles.muted}>
          Settings could not be loaded. Changes are off until they load.
        </Text>
      ) : null}
      {hideAutoUpdate ? null : (
        <SettingRow label={loading ? 'Loading…' : 'Auto-update servers'}>
          <Toggle
            value={draft.autoUpdate}
            onValueChange={(value) => {
              if (!ready) return
              const next = { ...draft, autoUpdate: value }
              setDraft(next)
              onSave(next)
            }}
            disabled={!ready || saving}
          />
        </SettingRow>
      )}
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Text style={panelStyles.detailLabel}>Servers updated at once</Text>
        <SegmentedControl
          value={draft.batch.mode}
          onChange={(mode) => {
            setDraft((prev) => ({ ...prev, batch: { ...prev.batch, mode } }))
          }}
          options={[
            { value: 'percent' as const, label: 'Percent' },
            { value: 'count' as const, label: 'Count' },
          ]}
        />
        <TextField
          label="Batch value"
          value={batchValue}
          onChangeText={setBatchValue}
          keyboardType="number-pad"
          placeholder={draft.batch.mode === 'percent' ? '100' : '5'}
          hint={`${formatUpgradeBatchLabel(draft.batch.mode, draft.batch.value)}. The next group starts on a later check, once every server in this one has finished or failed.`}
          error={batchError}
        />
        <SettingRow label="Maintenance window">
          <Toggle
            value={draft.maintenanceWindow.enabled}
            disabled={!ready || saving}
            onValueChange={(enabled) => {
              if (!ready) return
              const next = {
                ...draft,
                maintenanceWindow: { ...draft.maintenanceWindow, enabled },
              }
              setDraft(next)
              onSave(next)
            }}
          />
        </SettingRow>
        {draft.maintenanceWindow.enabled ? (
          <Text style={panelStyles.muted}>
            Automatic runs only start inside the configured UTC window ({draft.maintenanceWindow.startMinute}{' '}
            min from midnight, {draft.maintenanceWindow.durationMinutes} min long).
          </Text>
        ) : null}
        <Text style={panelStyles.muted}>
          Default batch is 100% — every server in a wave upgrades together unless you lower it.
        </Text>
        <SettingRow label="Save batch size">
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
