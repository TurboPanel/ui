import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  managedReleasesForEngine,
  managedSeriesLabel,
  type ManagedEngineRelease,
} from '@/lib/managed-releases'
import { chrome, colors, spacing } from '@/lib/theme'

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
      <Text style={orgPanelStyles.detailLabel}>Version</Text>
      <View style={styles.chipRow}>
        {releases.map((release) => (
          <SeriesChip
            key={release.series}
            release={release}
            selected={release.series === value.series}
            disabled={disabled}
            onPress={() =>
              onChange({
                series: release.series,
                // Reset to this series' default variant — variant ids are not
                // guaranteed to exist across series.
                variantId: release.variants[0]?.id ?? value.variantId,
              })
            }
          />
        ))}
      </View>

      {selected && selected.variants.length > 1 ? (
        <>
          <Text style={orgPanelStyles.detailLabel}>Base image</Text>
          <View style={styles.chipRow}>
            {selected.variants.map((variant) => {
              const active = variant.id === value.variantId
              return (
                <Pressable
                  key={variant.id}
                  style={[styles.chip, active && styles.chipActive, webPointer]}
                  disabled={disabled}
                  onPress={() => onChange({ series: value.series, variantId: variant.id })}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {variant.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </>
      ) : null}
    </View>
  )
}

function SeriesChip({
  release,
  selected,
  disabled,
  onPress,
}: Readonly<{
  release: ManagedEngineRelease
  selected: boolean
  disabled: boolean
  onPress: () => void
}>) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipActive, webPointer]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
        {managedSeriesLabel(release)}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.text,
  },
})
