import { useState } from 'react'
import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  SectionPanel,
  Select,
  SettingRow,
  type SelectOption,
} from '@/components/ui'
import {
  useOrgTemperatureUnit,
  useSaveOrgTemperatureUnit,
} from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

const UNIT_OPTIONS: SelectOption[] = [
  { value: 'celsius', label: 'Celsius (°C)' },
  { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
]

export function ServerTemperatureUnitSettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draftUnit, setDraftUnit] = useState<
    'celsius' | 'fahrenheit' | null
  >(null)

  const query = useOrgTemperatureUnit(orgId, { enabled: canManage })

  const mutation = useSaveOrgTemperatureUnit(orgId)

  if (!canManage) return null

  const settings = query.data
  const effectiveUnit = draftUnit ?? settings?.temperatureUnit ?? 'celsius'
  const pending = mutation.isPending || query.isLoading

  const saveUnit = () => {
    if (!settings) return
    mutation.mutate(
      { temperatureUnit: effectiveUnit },
      {
        onSuccess: () => {
          setError(null)
          setDraftUnit(null)
        },
        onError: (err) => {
          setError(
            errorMessage(err, 'Failed to save temperature display setting'),
          )
        },
      },
    )
  }

  return (
    <SectionPanel
      title="Temperature display"
      hint="Manage-gated · affects chart axes, tooltips, and readouts only"
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {errorMessage(query.error, 'Failed to load settings')}
        </Text>
      ) : null}

      <Text style={panelStyles.muted}>
        Metrics are always stored and compared in Celsius. This only changes
        how temperatures render across charts and summaries for this
        organization.
      </Text>

      <SettingRow label="Display unit">
        <Select
          value={effectiveUnit}
          options={UNIT_OPTIONS}
          placeholder="Celsius (°C)"
          disabled={pending || !settings}
          accessibilityLabel="Temperature display unit"
          onChange={(value) => {
            if (value === 'celsius' || value === 'fahrenheit') {
              setDraftUnit(value)
            }
          }}
        />
      </SettingRow>

      <Button
        label="Save setting"
        variant="primary"
        busy={mutation.isPending}
        disabled={pending || !settings}
        onPress={saveUnit}
      />
    </SectionPanel>
  )
}
