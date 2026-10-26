import { useEffect } from 'react'
import { Platform } from 'react-native'

/**
 * While `active`, the browser asks before the page is closed, reloaded or left
 * for another address, so a save that is still running (or edits that are not
 * saved yet) is not lost without a word. Web only: a native app has no page
 * to unload.
 */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older browsers ask only when `returnValue` is a non-empty string.
      Reflect.set(event, 'returnValue', 'leave')
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])
}
