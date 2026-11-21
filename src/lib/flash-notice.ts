import { useSyncExternalStore } from 'react'

/** A short success message that has to outlive the screen that caused it. */
export type FlashNotice = Readonly<{ id: number; text: string }>

/** How long a flash notice stays up before it goes away on its own. */
export const FLASH_NOTICE_MS = 8000

let notices: readonly FlashNotice[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * Queue a notice. The queue lives outside any screen, so it survives a
 * redirect (a deleted organization sends the person to another page).
 */
export function postFlashNotice(text: string): number {
  const id = nextId++
  notices = [...notices, { id, text }]
  emit()
  return id
}

export function dismissFlashNotice(id: number): void {
  const next = notices.filter((n) => n.id !== id)
  if (next.length === notices.length) return
  notices = next
  emit()
}

function watch(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = (): readonly FlashNotice[] => notices

export function useFlashNotices(): readonly FlashNotice[] {
  return useSyncExternalStore(watch, snapshot, snapshot)
}

export function resetFlashNoticesForTests(): void {
  notices = []
  emit()
}
