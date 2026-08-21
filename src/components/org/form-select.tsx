import { createElement, type CSSProperties } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { chrome, colors, spacing } from '@/lib/theme'

export type FormSelectOption = {
  value: string
  label: string
}

function webSelectStyle(mono: boolean): CSSProperties {
  const style: CSSProperties = {
    width: '100%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontSize: 16,
    padding: 10,
    minHeight: 44,
    colorScheme: 'dark',
  }
  if (mono) {
    style.fontFamily = 'monospace'
  }
  return style
}

function WebFormSelect({
  value,
  options,
  placeholder,
  disabled,
  accessibilityLabel,
  mono,
  onChange,
}: Readonly<{
  value: string
  options: readonly FormSelectOption[]
  placeholder: string
  disabled: boolean
  accessibilityLabel: string
  mono: boolean
  onChange: (value: string) => void
}>) {
  return createElement(
    'select',
    {
      value,
      disabled,
      onChange: (event: { target: { value: string } }) => {
        const next = event.target.value
        if (next) onChange(next)
      },
      style: webSelectStyle(mono),
      'aria-label': accessibilityLabel,
    },
    [
      createElement(
        'option',
        { key: '', value: '', disabled: true },
        placeholder,
      ),
      ...options.map((option) =>
        createElement(
          'option',
          { key: option.value, value: option.value },
          option.label,
        ),
      ),
    ],
  )
}

function NativeFormSelect({
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: Readonly<{
  value: string
  options: readonly FormSelectOption[]
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
}>) {
  if (options.length === 0) {
    return <Text style={orgPanelStyles.muted}>{placeholder}</Text>
  }

  return (
    <View style={styles.nativeList}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <Pressable
            key={option.value}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.nativeOption,
              selected && styles.nativeOptionSelected,
              pressed && !disabled && styles.nativeOptionPressed,
              webPointer,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.label}
          >
            <Text
              style={[
                styles.nativeOptionText,
                selected && styles.nativeOptionTextSelected,
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function FormSelect({
  value,
  options,
  placeholder,
  disabled,
  accessibilityLabel,
  mono,
  onChange,
}: Readonly<{
  value: string
  options: readonly FormSelectOption[]
  placeholder: string
  disabled?: boolean
  accessibilityLabel: string
  mono?: boolean
  onChange: (value: string) => void
}>) {
  const isDisabled = Boolean(disabled)
  const useMono = Boolean(mono)

  if (Platform.OS === 'web') {
    return (
      <WebFormSelect
        value={value}
        options={options}
        placeholder={placeholder}
        disabled={isDisabled}
        accessibilityLabel={accessibilityLabel}
        mono={useMono}
        onChange={onChange}
      />
    )
  }

  return (
    <NativeFormSelect
      value={value}
      options={options}
      placeholder={placeholder}
      disabled={isDisabled}
      onChange={onChange}
    />
  )
}

const styles = StyleSheet.create({
  nativeList: {
    gap: spacing.xs,
    maxHeight: 220,
  },
  nativeOption: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.bgInput,
  },
  nativeOptionSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  nativeOptionPressed: {
    opacity: 0.88,
  },
  nativeOptionText: {
    color: colors.text,
    fontSize: 16,
  },
  nativeOptionTextSelected: {
    color: chrome.accent,
    fontWeight: '600',
  },
})
