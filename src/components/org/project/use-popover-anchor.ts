import { useEffect, useRef, useState } from 'react'
import { StyleSheet, useWindowDimensions, type View } from 'react-native'
import { colors } from '@/lib/theme'

/** Where a popover opens before its trigger is measured. */
const DEFAULT_ANCHOR = { top: 56, left: 16 }

/**
 * Anchors a popover of `menuWidth` under its trigger, right edges aligned and
 * kept on screen. Put `ref` on the trigger's wrapper (`collapsable={false}`).
 * Nothing is measured while closed or on a compact screen, where the list
 * opens as a sheet instead.
 */
export function usePopoverAnchor(open: boolean, compact: boolean, menuWidth: number) {
  const { width } = useWindowDimensions()
  const [anchor, setAnchor] = useState(DEFAULT_ANCHOR)
  const ref = useRef<View | null>(null)

  useEffect(() => {
    if (!open || compact) return
    ref.current?.measureInWindow((x, y, w, h) => {
      setAnchor({
        top: y + h + 6,
        left: Math.min(Math.max(12, x + w - menuWidth), Math.max(12, width - menuWidth - 12)),
      })
    })
  }, [open, compact, width, menuWidth])

  return { ref, anchor }
}

/** The dimmed backdrop behind a popover, and its sheet form on a compact screen. */
export const popoverBackdrop = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  compact: { justifyContent: 'flex-end' },
})
