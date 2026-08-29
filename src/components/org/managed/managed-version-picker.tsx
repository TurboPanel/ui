import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { SegmentedControl } from '@/components/ui'
import {
  managedReleasesForEngine,
  managedSeriesLabel,
} from '@/lib/managed-releases'
import { spacing } from '@/lib/theme'

export type ManagedVersionSelection = {
  /** Version series from the release catalog (`18`, `9.7`, `12.3`). */
  series: string
  /** Base-OS variant id of that series (`alpine` / `debian` / `oraclelinux9` / `ubi`). */
  variantId: string
}

/**
 * Default selection for `engine` — recommended series, first variant. `null`
 * when the engine has no release catalog (`redis` / `clickhouse`), in which case
 * the create request should omit version fields and take the backend default.
 */
export function defaultManagedVersionSelection(
  engine: string | null | undefined,
): ManagedVersionSelection | null {
  const releases = managedReleasesForEngine(engine)
  const release = releases.find((row) => row.isDefault) ?? releases[0]
  const variantId = release?.variants[0]?.id
  if (!release || variantId === undefined) return null
  return { series: release.series, variantId }
}

/**
 * Version series first, base-OS variant second — operators pick a database
 * version, not an OCI tag. Renders nothing for engines without a catalog.
 *
 * All members of a topology stay on one series and a cluster's series is
 * immutable after create (`managed_series_immutable`), so this is the only place
 * a series is chosen.
 */
export function ManagedVersionPicker({
  engine,
  value,
  disabled,
  onChange,
}: Readonly<{
  engine: string | null | undefined
  value: ManagedVersionSelection | null
  disabled: boolean
  onChange: (next: ManagedVersionSelection) => void
}>) {
  const releases = managedReleasesForEngine(engine)
  if (releases.length === 0 || !value) return null

  const selected = releases.find((row) => row.series === value.series)

  return (
    <View style={styles.group}>
      <Text style={panelStyles.detailLabel}>Version</Text>
      <SegmentedControl
        options={releases.map((release) => ({
          value: release.series,
          label: managedSeriesLabel(release),
        }))}
        value={value.series}
        disabled={disabled}
        accessibilityLabel="Version"
        onChange={(series) => {
          const release = releases.find((row) => row.series === series)
          onChange({
            series,
            // Reset to this series' default variant — variant ids are not
            // guaranteed to exist across series.
            variantId: release?.variants[0]?.id ?? value.variantId,
          })
        }}
      />

      {selected && selected.variants.length > 1 ? (
        <>
          <Text style={panelStyles.detailLabel}>Base image</Text>
          <SegmentedControl
            options={selected.variants.map((variant) => ({
              value: variant.id,
              label: variant.label,
            }))}
            value={value.variantId}
            disabled={disabled}
            accessibilityLabel="Base image"
            onChange={(variantId) =>
              onChange({ series: value.series, variantId })
            }
          />
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs,
  },
})
