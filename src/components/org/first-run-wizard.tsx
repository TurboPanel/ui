import { panelStyles } from '@/components/ui/panel-styles'
import { Button, TextField } from '@/components/ui'
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
import { chrome, colors, spacing } from '@/lib/theme'
import { StyleSheet, Text, View } from 'react-native'

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
      <View style={styles.cardStripe} />
      <View style={styles.cardBody}>
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
          <TextField
            label={nameLabel ?? namePlaceholder ?? 'Name'}
            value={nameValue ?? ''}
            onChangeText={onNameChange}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
          />
        ) : null}

        {error ? <Text style={panelStyles.error}>{error}</Text> : null}

        <Button
          label={actionLabel}
          variant="primary"
          busy={busy}
          onPress={onPrimaryAction}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.bgActive,
    borderColor: colors.borderMuted,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  cardStripe: {
    width: 3,
    backgroundColor: chrome.accent,
  },
  cardBody: {
    flex: 1,
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
})
