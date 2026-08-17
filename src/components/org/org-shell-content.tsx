import { Slot } from 'expo-router'
import { ScrollView, StyleSheet } from 'react-native'
import { layout, spacing } from '@/lib/theme'

export function OrgShellContent({
  maxWidth,
  contentPaddingBottom,
}: Readonly<{
  maxWidth: number
  contentPaddingBottom?: number
}>) {
  return (
    <ScrollView
      style={styles.contentScroll}
      contentContainerStyle={[
        styles.content,
        { maxWidth },
        contentPaddingBottom == null
          ? null
          : { paddingBottom: contentPaddingBottom },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Slot />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  contentScroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: layout.contentGutter,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
})
