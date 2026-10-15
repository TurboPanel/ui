import { Pressable, StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  isWeakManagedSslMode,
  MANAGED_SSL_MODES,
  managedSslModeHint,
  managedSslModeLabel,
  type ManagedSslMode,
} from '@/lib/managed-ssl'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

/**
 * Picker for the managed-SQL client TLS policy.
 *
 * `value` of `null` selects the inherit row, which is only rendered when
 * `inheritLabel` is supplied — the organization-defaults surface has nothing to
 * inherit from and must therefore always pick a concrete mode.
 *
 * `weakModesDisabledReason` (set while a server serving the database allows
 * external access) disables the modes that let a client skip SSL, and the
 * inherit row when `inheritMode` (what it resolves to) is one of them, each
 * with that one-line reason.
 */
export function ManagedSslModePicker({
  value,
  inheritLabel,
  inheritHint,
  inheritMode,
  weakModesDisabledReason,
  disabled,
  onSelect,
}: Readonly<{
  value: ManagedSslMode | null
  inheritLabel?: string
  inheritHint?: string
  /** The mode the inherit row resolves to today. */
  inheritMode?: ManagedSslMode
  weakModesDisabledReason?: string | null
  disabled: boolean
  onSelect: (mode: ManagedSslMode | null) => void
}>) {
  const blocked = (mode: ManagedSslMode | undefined) =>
    Boolean(weakModesDisabledReason) && mode !== undefined && isWeakManagedSslMode(mode)
  return (
    <View style={styles.list}>
      {inheritLabel ? (
        <ModeRow
          label={inheritLabel}
          hint={inheritHint ?? 'Follows the organization default as it changes.'}
          selected={value === null}
          disabled={disabled || blocked(inheritMode)}
          reason={blocked(inheritMode) ? weakModesDisabledReason : null}
          onPress={() => onSelect(null)}
        />
      ) : null}
      {MANAGED_SSL_MODES.map((mode) => (
        <ModeRow
          key={mode}
          label={managedSslModeLabel(mode)}
          hint={managedSslModeHint(mode)}
          selected={value === mode}
          disabled={disabled || blocked(mode)}
          reason={blocked(mode) ? weakModesDisabledReason : null}
          onPress={() => onSelect(mode)}
        />
      ))}
    </View>
  )
}

function ModeRow({
  label,
  hint,
  selected,
  disabled,
  reason,
  onPress,
}: Readonly<{
  label: string
  hint: string
  selected: boolean
  disabled: boolean
  /** Why this row cannot be picked; shown under the hint. */
  reason?: string | null
  onPress: () => void
}>) {
  return (
    <Pressable
      style={[styles.row, selected && styles.rowSelected, reason && styles.rowBlocked, webPointer]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {label}
      </Text>
      <Text style={panelStyles.muted}>{hint}</Text>
      {reason ? <Text style={panelStyles.muted}>{reason}</Text> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  rowSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  rowBlocked: {
    opacity: 0.6,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  labelSelected: {
    color: colors.text,
  },
})
