import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, type ButtonSize } from '@/components/ui/button'
import { colors, spacing } from '@/lib/theme'

/**
 * Two-step destructive action (MASTER: destructive always confirms).
 * First press arms; the armed row shows Confirm / Cancel and auto-disarms
 * after 6s of inactivity. While `busy` is true the armed row is shown only
 * for the instance that fired `onConfirm` — other instances sharing the
 * same busy flag render the base button, disabled.
 */
export function ConfirmButton({
  label,
  confirmLabel = 'Confirm',
  prompt = 'Are you sure?',
  onConfirm,
  onArmedChange,
  busy = false,
  disabled = false,
  size = 'sm',
}: Readonly<{
  label: string
  confirmLabel?: string
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
}>) {
  const [armed, setArmed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    if (confirmed && !busy) setConfirmed(false)
  }, [confirmed, busy])

  const arm = () => {
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
        variant="danger"
        size={size}
        disabled={disabled}
        busy={busy}
        onPress={arm}
      />
    )
  }

  return (
    <View style={styles.armedRow}>
      <Text style={styles.prompt}>{prompt}</Text>
      <Button
        label={confirmLabel}
        variant="danger"
        size={size}
        busy={confirmed && busy}
        disabled={disabled || busy}
        onPress={() => {
          disarm()
          setConfirmed(true)
          onConfirm()
        }}
      />
      <Button
        label="Cancel"
        variant="ghost"
        size={size}
        disabled={busy}
        onPress={disarm}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  armedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  prompt: {
    color: colors.errorText,
    fontSize: 13,
    fontWeight: '600',
  },
})
