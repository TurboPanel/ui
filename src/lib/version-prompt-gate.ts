import { useIsMutating, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useFlashNotices } from '@/lib/flash-notice'
import { useStepUpOpen } from '@/lib/use-step-up-open'

/** How long the new-version prompt keeps away after a change finishes. */
export const VERSION_PROMPT_QUIET_MS = 5000

let openDialogs = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * A dialog calls this while it is open and runs the returned function when it
 * closes, so the new-version prompt never lands on top of a decision.
 */
export function registerOpenDialog(): () => void {
  openDialogs += 1
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    openDialogs -= 1
    emit()
  }
}

function watch(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = (): number => openDialogs

/** True while any dialog is open. */
export function useAnyDialogOpen(): boolean {
  return useSyncExternalStore(watch, snapshot, snapshot) > 0
}

/** True when no change is running and none finished in the last `quietMs`. */
function useQuietAfterMutations(quietMs: number): boolean {
  const client = useQueryClient()
  const running = useIsMutating() > 0
  const [settling, setSettling] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = client.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated') return
      const status = event.mutation.state.status
      if (status !== 'success' && status !== 'error') return
      setSettling(true)
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        setSettling(false)
      }, quietMs)
    })
    return () => {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
    }
  }, [client, quietMs])

  return !running && !settling
}

/**
 * Whether it is a good moment to show the new-version prompt: no dialog or
 * step-up prompt is open, no change has just finished, and the result notice
 * of what the person did ("Deleted organization ...") has been shown and gone.
 * The result always comes first. A prompt that was held back shows as soon as this turns true.
 */
export function useVersionPromptReady(quietMs: number = VERSION_PROMPT_QUIET_MS): boolean {
  const dialogOpen = useAnyDialogOpen()
  const stepUpOpen = useStepUpOpen()
  const quiet = useQuietAfterMutations(quietMs)
  const resultPending = useFlashNotices().length > 0
  return quiet && !dialogOpen && !stepUpOpen && !resultPending
}
