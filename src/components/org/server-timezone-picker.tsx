import { createElement, type CSSProperties } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { chrome, colors, spacing } from '@/lib/theme'

const webSelectStyle: CSSProperties = {
  width: '100%',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.border,
  borderRadius: 6,
  backgroundColor: colors.bgInput,
  color: colors.text,
  fontFamily: 'monospace',
  fontSize: 13,
  padding: 10,
  minHeight: 44,
}

export function ServerTimezonePicker({
  value,
  options,
  disabled,
  placeholder,
  noneLabel,
  onChange,
}: Readonly<{
  value: string | null
  options: readonly string[]
  disabled: boolean
  placeholder: string
  /** When set, prepends a null option (e.g. fleet default "None"). */
  noneLabel?: string
  onChange: (timezone: string | null) => void
}>) {
  const sorted = [...options].sort((a, b) => a.localeCompare(b))

  if (Platform.OS === 'web') {
    return createElement(
      'select',
      {
        value: value ?? '',
        disabled,
        onChange: (event: { target: { value: string } }) => {
          const next = event.target.value
          if (noneLabel != null && next === '') {
            onChange(null)
            return
          }
          onChange(next)
        },
        style: webSelectStyle,
      },
      [
        ...(noneLabel != null
          ? [
              createElement('option', { key: '__none__', value: '' }, noneLabel),
            ]
          : []),
        createElement(
          'option',
          { key: '', value: '', disabled: true },
          placeholder,
        ),
        ...sorted.map((tz) =>
          createElement('option', { key: tz, value: tz }, tz),
        ),
      ],
    )
  }

  return (
    <View style={styles.nativeList}>
      {noneLabel != null ? (
        <Pressable
          disabled={disabled}
          onPress={() => onChange(null)}
          style={({ pressed }) => [
            styles.nativeOption,
            value === null && styles.nativeOptionSelected,
            pressed && !disabled && styles.nativeOptionPressed,
            webPointer,
          ]}
        >
          <Text style={styles.nativeOptionText}>{noneLabel}</Text>
        </Pressable>
      ) : null}
      {!value && noneLabel == null ? (
        <Text style={orgPanelStyles.muted}>{placeholder}</Text>
      ) : null}
      {sorted.map((tz) => {
        const selected = value === tz
        return (
          <Pressable
            key={tz}
            disabled={disabled}
            onPress={() => onChange(tz)}
            style={({ pressed }) => [
              styles.nativeOption,
              selected && styles.nativeOptionSelected,
              pressed && !disabled && styles.nativeOptionPressed,
              webPointer,
            ]}
          >
            <Text style={styles.nativeOptionText}>{tz}</Text>
          </Pressable>
        )
      })}
    </View>
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
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
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
    fontFamily: 'monospace',
    fontSize: 13,
  },
})
