import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { HeaderChevron } from '@/components/header-chevron'
import { projectFormSectionOpen } from '@/lib/org-project-settings'
import { colors, spacing, webPointer } from '@/lib/theme'

/**
 * A closed-by-default part of a project form (Environment, Workspace): one
 * row with the title, a short summary of what is picked and a chevron. It
 * opens on press, when the organization opens it by default (Organization
 * Settings › Project Settings), or whenever a field inside it has an error.
 * A section that has shown an error stays open after the error is fixed, and
 * a press while the error shows does nothing, so it never quietly records
 * "closed" and shuts on the next submit.
 */
export function FormDisclosure({
  title,
  summary,
  openByDefault,
  hasError = false,
  children,
}: Readonly<{
  title: string
  summary: string
  openByDefault: boolean
  hasError?: boolean
  children: ReactNode
}>) {
  const [choice, setChoice] = useState<boolean | null>(null)
  // Adjusting state while rendering (not in an effect) so the open state
  // never flickers closed for a frame.
  if (hasError && choice !== true) setChoice(true)
  const open = projectFormSectionOpen(choice, openByDefault, hasError)
  return (
    <View style={[styles.root, open && styles.rootOpen]}>
      <Pressable
        style={[styles.header, webPointer]}
        onPress={() => {
          if (hasError) return
          setChoice(!open)
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        // React Native Web does not map accessibilityState.expanded to the DOM.
        aria-expanded={open}
        accessibilityLabel={`${title}: ${summary}`}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
        <HeaderChevron size={12} color={colors.textMuted} open={open} />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    borderColor: colors.borderArea,
    borderRadius: 8,
  },
  rootOpen: {
    borderColor: colors.borderChip,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  summary: {
    flex: 1,
    minWidth: 0,
    color: colors.textMuted,
    fontSize: 13,
  },
  body: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
})
