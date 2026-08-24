import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/lib/theme'

export type InlineNoticeTone = 'info' | 'warning'

/**
 * A state statement that belongs *in* the flow — left accent bar, title, an
 * optional line of copy, and optional actions that sit inline on wide layouts
 * and wrap beneath the copy on narrow ones.
 *
 * Reach for this instead of a modal or a scrim whenever the message explains
 * the content it sits above: a dialog hides that content and demands a
 * dismissal the user did not ask for.
 */
export function InlineNotice({
  title,
  body,
  actions,
  tone = 'info',
}: Readonly<{
  title: string
  body?: string
  actions?: ReactNode
  tone?: InlineNoticeTone
}>) {
  const warning = tone === 'warning'
  return (
    <View
      style={[styles.notice, warning && styles.noticeWarning]}
      accessibilityRole="summary"
      accessibilityLabel={body ? `${title}. ${body}` : title}
    >
      <View style={styles.copy}>
        <Text style={[styles.title, warning && styles.titleWarning]}>
          {title}
        </Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderLeftWidth: 3,
    borderLeftColor: colors.command,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeWarning: {
    borderColor: colors.pending,
    borderLeftColor: colors.pending,
  },
  copy: {
    flex: 1,
    minWidth: 240,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  titleWarning: {
    color: colors.pending,
  },
  body: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
})
