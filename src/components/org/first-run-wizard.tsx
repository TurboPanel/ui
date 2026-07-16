import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { colors, spacing } from '@/lib/theme'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  borderRadius: 6,
  minHeight: 44,
} as const

function NoteRow({ text }: Readonly<{ text: string }>) {
  return (
    <View style={styles.noteRow}>
      <Text style={styles.noteBullet}>•</Text>
      <Text style={styles.noteText}>{text}</Text>
    </View>
  )
}

export function FirstRunWizard({
  title,
  description,
  notes,
  primaryActionLabel,
  onPrimaryAction,
  submitting,
  error,
  nameValue,
  onNameChange,
  namePlaceholder,
  nameLabel,
}: Readonly<{
  title: string
  description: string
  notes?: readonly string[]
  primaryActionLabel: string
  onPrimaryAction: () => void
  submitting?: boolean
  error?: string | null
  nameValue?: string
  onNameChange?: (text: string) => void
  namePlaceholder?: string
  nameLabel?: string
}>) {
  const busy = Boolean(submitting)
  let actionLabel = primaryActionLabel
  if (busy) {
    actionLabel = 'Creating…'
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      {notes && notes.length > 0 ? (
        <View style={styles.notes}>
          {notes.map((note) => (
            <NoteRow key={note} text={note} />
          ))}
        </View>
      ) : null}

      {onNameChange ? (
        <View style={styles.field}>
          {nameLabel ? <Text style={styles.label}>{nameLabel}</Text> : null}
          <TextInput
            style={Platform.OS === 'web' ? webInputStyle : styles.input}
            value={nameValue ?? ''}
            onChangeText={onNameChange}
            placeholder={namePlaceholder}
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
            maxLength={255}
          />
        </View>
      ) : null}

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryButton, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={onPrimaryAction}
      >
        <Text style={styles.primaryButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.bgActive,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    color: colors.textBody,
    fontSize: 15,
    lineHeight: 22,
  },
  notes: {
    gap: spacing.xs,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  noteBullet: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  noteText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
