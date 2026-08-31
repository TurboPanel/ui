import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  FormField,
  SectionPanel,
  Select,
  TextField,
  type SelectOption,
} from '@/components/ui'
import type {
  MetricsCapabilities,
  MetricsSensorCandidate,
  ServerDetailRecord,
  ServerMetricsOverrides,
  ServerMetricsOverridesUpdate,
} from '@/lib/instance-api'
import {
  useSaveServerMetricsSensorOverrides,
  useServerMetricsCapabilities,
} from '@/lib/queries/servers'
import { spacing } from '@/lib/theme'

type SensorField = 'cpuTemperature' | 'gpuTemperature' | 'cpuPower' | 'gpuPower'

const SENSOR_FIELDS: readonly {
  field: SensorField
  label: string
}[] = [
  { field: 'cpuTemperature', label: 'CPU temperature' },
  { field: 'gpuTemperature', label: 'GPU temperature' },
  { field: 'cpuPower', label: 'CPU power' },
  { field: 'gpuPower', label: 'GPU power' },
]

function sensorOptions(
  candidates: readonly MetricsSensorCandidate[],
): SelectOption[] {
  return candidates.map((candidate) => ({
    value: candidate.path,
    label: `${candidate.chip} · ${candidate.label}`,
    detail: candidate.path,
  }))
}

function candidatesFor(
  capabilities: MetricsCapabilities,
  field: SensorField,
): readonly MetricsSensorCandidate[] {
  return capabilities.sensors[field]
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function selectionFromOverrides(
  overrides: ServerMetricsOverrides | null | undefined,
): Record<SensorField, string | null> {
  return {
    cpuTemperature: overrides?.cpuTemperature ?? null,
    gpuTemperature: overrides?.gpuTemperature ?? null,
    cpuPower: overrides?.cpuPower ?? null,
    gpuPower: overrides?.gpuPower ?? null,
  }
}

/**
 * Sensor sources + hosting-path override for one server. Capability discovery
 * is a live daemon round trip, so it runs only once the panel is expanded —
 * opened deliberately, never polled (backend contract).
 *
 * The form initializes from the stored overrides (`server.metricsOverrides`),
 * so saving posts the full resolved set: untouched fields re-assert their
 * saved value, and only a field the operator moved to "Auto detected" (null)
 * clears its override.
 */
export function ServerMetricsSensorsPanel({
  orgId,
  server,
  canManage,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  canManage: boolean
}>) {
  const [expanded, setExpanded] = useState(false)
  const [selection, setSelection] = useState<
    Record<SensorField, string | null>
  >(() => selectionFromOverrides(server.metricsOverrides))
  const [hostingPathDraft, setHostingPathDraft] = useState(
    server.metricsOverrides?.hostingPath ?? '',
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const capabilitiesQuery = useServerMetricsCapabilities(orgId, server.id, {
    enabled: expanded,
  })
  const mutation = useSaveServerMetricsSensorOverrides(orgId, server.id)

  const outcome = capabilitiesQuery.data
  const capabilities = outcome?.kind === 'ok' ? outcome.capabilities : null
  const offline = outcome?.kind === 'offline'
  const pending = mutation.isPending
  const readOnly = !canManage

  const save = () => {
    if (readOnly) return
    setError(null)
    setSaved(false)
    const updates: ServerMetricsOverridesUpdate = {
      cpuTemperature: selection.cpuTemperature,
      gpuTemperature: selection.gpuTemperature,
      cpuPower: selection.cpuPower,
      gpuPower: selection.gpuPower,
      hostingPath:
        hostingPathDraft.trim().length > 0 ? hostingPathDraft.trim() : null,
    }
    mutation.mutate(updates, {
      onSuccess: (result) => {
        setSaved(true)
        // Reflect server-side normalization (trimming, cleared fields).
        setSelection(selectionFromOverrides(result.overrides))
        setHostingPathDraft(result.overrides.hostingPath ?? '')
        if (!result.pushed) {
          setError(
            'Saved, but the server is offline — re-save once it reconnects to apply on the host.',
          )
        }
      },
      onError: (err) => {
        setError(errorMessage(err, 'Failed to save sensor overrides'))
      },
    })
  }

  return (
    <SectionPanel
      title="Metrics sensors"
      hint="Temperature/power sensor sources and hosting storage path"
      collapsible
      defaultCollapsed
      onToggle={setExpanded}
    >
      <Text style={panelStyles.muted}>
        Auto-detection picks the first matching sensor. Override it when the
        host exposes several, or point hosting storage at a different mount.
      </Text>

      {capabilitiesQuery.isLoading && expanded ? (
        <Text style={panelStyles.muted}>Discovering host sensors…</Text>
      ) : null}

      {offline ? (
        <Text style={panelStyles.muted}>
          Server offline — capability discovery unavailable until the host
          reconnects.
        </Text>
      ) : null}

      {capabilitiesQuery.isError ? (
        <Text style={panelStyles.error}>
          {errorMessage(
            capabilitiesQuery.error,
            'Failed to discover sensor capabilities',
          )}
        </Text>
      ) : null}

      {capabilities ? (
        <View style={styles.fields}>
          {SENSOR_FIELDS.map(({ field, label }) => (
            <FormField key={field} label={label}>
              <Select
                value={selection[field]}
                options={sensorOptions(candidatesFor(capabilities, field))}
                placeholder="Auto detected"
                noneLabel="Auto detected"
                disabled={readOnly || pending}
                accessibilityLabel={`${label} sensor source`}
                onChange={(value) => {
                  setSaved(false)
                  setSelection((prev) => ({ ...prev, [field]: value }))
                }}
              />
            </FormField>
          ))}

          <TextField
            label="Hosting storage path"
            value={hostingPathDraft}
            onChangeText={(next) => {
              setSaved(false)
              setHostingPathDraft(next)
            }}
            editable={!readOnly && !pending}
            placeholder={
              capabilities.storageMounts.hosting?.path ?? 'Auto detected'
            }
            accessibilityLabel="Hosting storage path override"
            hint="Absolute mount path probed as hosting storage. Empty uses auto-detection."
          />

          {capabilities.storageMounts.candidates.length > 0 ? (
            <Text style={panelStyles.muted}>
              Discovered mounts:{' '}
              {capabilities.storageMounts.candidates
                .map((mount) => `${mount.path} (${mount.fsType})`)
                .join(', ')}
            </Text>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {saved && !error ? (
        <Text style={panelStyles.muted}>Sensor overrides saved.</Text>
      ) : null}

      {readOnly ? (
        <Text style={panelStyles.muted}>Manage permission required.</Text>
      ) : null}
      {!readOnly && capabilities ? (
        <ButtonRow>
          <Button
            label="Save sensor sources"
            variant="primary"
            busy={pending}
            disabled={pending}
            onPress={save}
          />
        </ButtonRow>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.md,
  },
})
