import { Pressable, StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  MANAGED_SQL_ACCESS_SCOPES,
  managedAccessScopeHint,
  managedAccessScopeLabel,
  type ManagedSqlAccessScope,
} from '@/lib/managed-access-scope'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

export function ManagedAccessScopePicker({
  value,
  disabled,
  onSelect,
}: Readonly<{
  value: ManagedSqlAccessScope
  disabled: boolean
  onSelect: (scope: ManagedSqlAccessScope) => void
}>) {
  return (
    <View style={styles.list}>
      {MANAGED_SQL_ACCESS_SCOPES.map((scope) => (
        <ScopeRow
          key={scope}
          label={managedAccessScopeLabel(scope)}
          hint={managedAccessScopeHint(scope)}
          selected={value === scope}
          disabled={disabled}
          onPress={() => onSelect(scope)}
        />
      ))}
    </View>
  )
}

function ScopeRow({
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
      <Text style={panelStyles.muted}>{hint}</Text>
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
