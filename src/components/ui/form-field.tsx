import { useState, type ReactNode } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { chrome, colors, spacing } from '@/lib/theme'

/**
 * Visible label + control + hint/error (MASTER: never placeholder-only
 * labels; errors adjacent to the field). Wrap any control, or use
 * {@link TextField} for the standard text input.
 */
export function FormField({
  label,
  hint,
  error,
  children,
}: Readonly<{
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
}>) {
  let caption: ReactNode = null
  if (error) {
    caption = <Text style={styles.error}>{error}</Text>
  } else if (hint) {
    caption = <Text style={styles.hint}>{hint}</Text>
  }
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {caption}
    </View>
  )
}

/**
 * Standard console text input inside a {@link FormField}. Accent focus
 * border, radius 8, 16px text, min height 44. `mono` for IDs / PEM / code.
 */
export function TextField({
  label,
  hint,
  error,
  mono = false,
  style,
  ...inputProps
}: Readonly<
  {
    label: string
    hint?: string
    error?: string | null
    mono?: boolean
  } & Omit<TextInputProps, 'placeholderTextColor'>
>) {
  const [focused, setFocused] = useState(false)
  return (
    <FormField label={label} hint={hint} error={error}>
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.textDim}
        onFocus={(e) => {
          setFocused(true)
          inputProps.onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          inputProps.onBlur?.(e)
        }}
        style={[
          styles.input,
          mono && styles.mono,
          inputProps.multiline && styles.multiline,
          focused && styles.inputFocused,
          error ? styles.inputInvalid : null,
          inputProps.editable === false && styles.inputDisabled,
          style,
        ]}
      />
    </FormField>
  )
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    color: colors.errorText,
    fontSize: 12,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 44,
  },
  inputFocused: {
    borderColor: chrome.accent,
  },
  inputInvalid: {
    borderColor: colors.error,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
})
