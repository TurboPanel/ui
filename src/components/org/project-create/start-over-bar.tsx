import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, webPointer } from '@/lib/theme'

/**
 * "Start over" for the create wizard. Two presses, like Discard elsewhere in
 * the console: the first asks, the second throws the draft away. Nothing is
 * saved before Create, so this only resets what is on screen.
 */
export function StartOverBar({
  onStartOver,
  disabled = false,
}: Readonly<{ onStartOver: () => void; disabled?: boolean }>) {
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <View style={styles.bar}>
        <Pressable
          style={webPointer}
          disabled={disabled}
          onPress={() => {
            setArmed(true)
          }}
          accessibilityRole="button"
          accessibilityLabel="Start over"
        >
          <Text style={styles.link}>Start over</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.bar}>
      <Text style={styles.hint}>Discard this project and start over?</Text>
      <Pressable
        style={webPointer}
        onPress={() => {
          setArmed(false)
        }}
        accessibilityRole="button"
        accessibilityLabel="Keep this project"
      >
        <Text style={styles.link}>Cancel</Text>
      </Pressable>
      <Pressable
        style={webPointer}
        onPress={onStartOver}
        accessibilityRole="button"
        accessibilityLabel="Yes, start over"
      >
        <Text style={styles.danger}>Yes, start over</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 32,
  },
  hint: { color: colors.textMuted, fontSize: 13 },
  link: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  danger: { color: colors.error, fontSize: 13, fontWeight: '700' },
})
