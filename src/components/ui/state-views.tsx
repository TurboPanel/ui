import { type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { colors, spacing } from '@/lib/theme'

/**
 * "No X yet" placeholder. Default is a single muted line; `panel` renders
 * the bordered state panel with title + hint + optional action.
 */
export function EmptyState({
  title,
  hint,
  panel = false,
  action,
}: Readonly<{
  title: string
  hint?: string
  panel?: boolean
  action?: ReactNode
}>) {
  if (!panel) {
    return <Text style={panelStyles.muted}>{title}</Text>
  }
  return (
    <View style={panelStyles.statePanel}>
      <Text style={panelStyles.statePanelTitle}>{title}</Text>
      {hint ? <Text style={panelStyles.muted}>{hint}</Text> : null}
      {action}
    </View>
  )
}

/** Standard loading row (spinner + label) for waits over ~300ms. */
export function LoadingState({
  label = 'Loading…',
}: Readonly<{ label?: string }>) {
  return (
    <View style={styles.loadingRow} accessibilityRole="progressbar">
      <ActivityIndicator size="small" color={colors.textMuted} />
      <Text style={panelStyles.muted}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
})
