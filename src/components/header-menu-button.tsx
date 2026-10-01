import { Pressable, StyleSheet, View } from 'react-native'
import { colors, webPointer } from '@/lib/theme'

/** Hamburger that opens the navigation drawer in the compact web headers. */
export function HeaderMenuButton({ onPress }: Readonly<{ onPress: () => void }>) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed, webPointer]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open navigation menu"
    >
      <View style={styles.icon}>
        <View style={styles.bar} />
        <View style={styles.bar} />
        <View style={styles.barShort} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.bgSecondary,
  },
  pressed: {
    opacity: 0.85,
  },
  icon: {
    width: 16,
    gap: 3,
  },
  bar: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textChip,
    width: 16,
  },
  barShort: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textChip,
    width: 11,
  },
})
