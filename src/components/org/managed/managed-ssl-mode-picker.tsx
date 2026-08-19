import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  MANAGED_SSL_MODES,
  managedSslModeHint,
  managedSslModeLabel,
  type ManagedSslMode,
} from '@/lib/managed-ssl'
import { chrome, colors, spacing } from '@/lib/theme'

/**
 * Picker for the managed-SQL client TLS policy.
 *
 * `value` of `null` selects the inherit row, which is only rendered when
 * `inheritLabel` is supplied — the organization-defaults surface has nothing to
 * inherit from and must therefore always pick a concrete mode.
 */
export function ManagedSslModePicker({
  value,
  inheritLabel,
  inheritHint,
  disabled,
  onSelect,
}: Readonly<{
  value: ManagedSslMode | null
  inheritLabel?: string
  inheritHint?: string
  disabled: boolean
  onSelect: (mode: ManagedSslMode | null) => void
}>) {
  return (
    <View style={styles.list}>
      {inheritLabel ? (
        <ModeRow
          label={inheritLabel}
          hint={inheritHint ?? 'Follows the organization default as it changes.'}
          selected={value === null}
          disabled={disabled}
          onPress={() => onSelect(null)}
        />
      ) : null}
      {MANAGED_SSL_MODES.map((mode) => (
        <ModeRow
          key={mode}
          label={managedSslModeLabel(mode)}
          hint={managedSslModeHint(mode)}
          selected={value === mode}
          disabled={disabled}
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
  onPress,
}: Readonly<{
  label: string
  hint: string
  selected: boolean
  disabled: boolean
  onPress: () => void
}>) {
  return (
    <Pressable
      style={[styles.row, selected && styles.rowSelected, webPointer]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {label}
      </Text>
      <Text style={orgPanelStyles.muted}>{hint}</Text>
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
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  labelSelected: {
    color: colors.text,
  },
})
