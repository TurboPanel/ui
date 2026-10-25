import { Pressable, StyleSheet, Text } from 'react-native'
import { MonoText } from '@/components/ui/mono-text'
import { colors, webPointer } from '@/lib/theme'

/**
 * The "Show in configuration" switch: the one place a hosting surface reveals
 * the exact configuration keys behind its plain words. `subject` names what it
 * shows for a screen reader when several sit on one page.
 */
export function ShowConfigurationToggle({
  open,
  onToggle,
  subject,
}: Readonly<{ open: boolean; onToggle: () => void; subject?: string }>) {
  const label = open ? 'Hide configuration' : 'Show in configuration'
  return (
    <Pressable
      style={webPointer}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={subject ? `${label} for ${subject}` : label}
    >
      <Text style={styles.toggle}>{label}</Text>
    </Pressable>
  )
}

/** The exact configuration text, selectable so it can be copied. */
export function ConfigurationSnippet({ text }: Readonly<{ text: string }>) {
  return (
    <MonoText style={styles.snippet} selectable>
      {text}
    </MonoText>
  )
}

const styles = StyleSheet.create({
  toggle: { color: colors.textMuted, fontSize: 12, textDecorationLine: 'underline' },
  snippet: { color: colors.textBody, fontSize: 12, lineHeight: 18 },
})
