import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Notice, type NoticeTone } from '@/components/ui/v4/notice'
import { spacing } from '@/lib/theme'

/**
 * A small notice pinned to the bottom-right corner (full width on a phone's
 * margins). It never dims or blocks the page: taps outside it reach the page.
 * Stack several by passing them as children.
 */
export function CornerToastStack({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <View pointerEvents="box-none" style={styles.stack}>
      {children}
    </View>
  )
}

export function CornerToast({
  tone = 'info',
  title,
  body,
  actions,
  onHoldChange,
}: Readonly<{
  tone?: NoticeTone
  title?: string
  body?: string
  actions?: ReactNode
  /** Called with true while the pointer is over the toast or focus is inside it. */
  onHoldChange?: (held: boolean) => void
}>) {
  // A polite live region: a screen reader reads it out when it appears,
  // without moving focus.
  return (
    <View
      role="status"
      accessibilityLiveRegion="polite"
      style={styles.toast}
      onPointerEnter={onHoldChange && (() => onHoldChange(true))}
      onPointerLeave={onHoldChange && (() => onHoldChange(false))}
      onFocus={onHoldChange && (() => onHoldChange(true))}
      onBlur={onHoldChange && (() => onHoldChange(false))}
    >
      <Notice compact tone={tone} title={title} body={body} actions={actions} />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: spacing.md,
    gap: spacing.sm,
    zIndex: 900,
  },
  toast: { width: '100%', maxWidth: 380 },
})
