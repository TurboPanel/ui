import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, type ButtonSize } from '@/components/ui/button'
import { colors, spacing } from '@/lib/theme'

/**
 * Two-step destructive action (MASTER: destructive always confirms).
 * First press arms; the armed row shows Confirm / Cancel and auto-disarms
 * after 6s of inactivity. The confirm button takes the armed button's place
 * (the question still comes first for screen readers), so a deliberate
 * second press on the same spot confirms; a press within
 * {@link CONFIRM_GUARD_MS} of arming is ignored, so a double-click or two
 * quick taps never arms and confirms in one gesture. `variant="secondary"` is for an action that is
 * confirmed but safe to undo (a rollback): a quiet button that confirms with
 * the primary one. While `busy` is true the armed row is shown only
 * for the instance that fired `onConfirm` — other instances sharing the
 * same busy flag render the base button, disabled.
 */
/** How long after arming a press on the confirm button is ignored. */
export const CONFIRM_GUARD_MS = 400

export function ConfirmButton({
  label,
  confirmLabel = 'Confirm',
  dismissLabel = 'Cancel',
  prompt = 'Are you sure?',
  onConfirm,
  onArmedChange,
  busy = false,
  disabled = false,
  size = 'sm',
  variant = 'danger',
}: Readonly<{
  label: string
  confirmLabel?: string
  /** Label of the button that backs out of the armed state. */
  dismissLabel?: string
  prompt?: string
  onConfirm: () => void
  /**
   * Fires when the armed state changes. Use it to disarm sibling
   * destructive controls; to disarm THIS control from the outside,
   * remount it with a `key` tied to the invalidating state (e.g. the
   * selected row id).
   */
  onArmedChange?: (armed: boolean) => void
  busy?: boolean
  disabled?: boolean
  size?: ButtonSize
  variant?: 'danger' | 'secondary'
}>) {
  const [armed, setArmed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const armedAt = useRef(0)
  // The armed button's width: the confirm button keeps it, so a second press
  // anywhere on the spot of the first one lands on Confirm even when its label
  // is shorter.
  const [armedWidth, setArmedWidth] = useState<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    if (confirmed && !busy) setConfirmed(false)
  }, [confirmed, busy])

  const arm = () => {
    armedAt.current = Date.now()
    setArmed(true)
    onArmedChange?.(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setArmed(false)
      onArmedChange?.(false)
    }, 6000)
  }

  const disarm = () => {
    if (timer.current) clearTimeout(timer.current)
    setArmed(false)
    onArmedChange?.(false)
  }

  const showArmedRow = armed || (confirmed && busy)
  if (!showArmedRow) {
    return (
      <Button
        label={label}
        variant={variant}
        size={size}
        disabled={disabled}
        busy={busy}
        onPress={arm}
        onLayout={(event) => setArmedWidth(event.nativeEvent.layout.width)}
      />
    )
  }

  // Drawn right to left: the question is first in reading order (screen
  // readers announce it before the buttons) but shows after them, so the
  // confirm button sits where the arming press landed. The row never wraps:
  // on a narrow screen the question wraps its own words instead, so Confirm
  // cannot drop to a second line and leave Cancel under the press.
  return (
    <View style={styles.armedRow}>
      <Text style={styles.prompt}>{prompt}</Text>
      <Button label={dismissLabel} variant="ghost" size={size} disabled={busy} onPress={disarm} />
      <Button
        label={confirmLabel}
        variant={variant === 'danger' ? 'danger' : 'primary'}
        size={size}
        busy={confirmed && busy}
        disabled={disabled || busy}
        minWidth={armedWidth}
        onPress={() => {
          if (Date.now() - armedAt.current < CONFIRM_GUARD_MS) return
          disarm()
          setConfirmed(true)
          onConfirm()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  armedRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
    flexShrink: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  prompt: {
    flexShrink: 1,
    color: colors.errorText,
    fontSize: 13,
    fontWeight: '600',
  },
})
