import { useSyncExternalStore } from 'react'

/**
 * Page width, one preference for every screen. `contained` keeps content in a
 * left-aligned column capped at `layout.contentMaxWidth`; `wide` removes the
 * cap so content fills the page. Stored per browser (localStorage); where
 * storage is missing or throws, the choice lasts for the session.
 */
export type PageWidthMode = 'contained' | 'wide'

const STORAGE_KEY = 'turbopanel.pageWidth'

export function parsePageWidth(value: string | null | undefined): PageWidthMode {
  return value === 'wide' ? 'wide' : 'contained'
}

/**
 * Width the content column may take. `cap` is the contained-mode maximum
 * (`layout.contentMaxWidth`); `availableWidth` is the room beside the chrome.
 */
export function contentMaxWidthFor(
  mode: PageWidthMode,
  availableWidth: number,
  cap: number
): number {
  return mode === 'wide' ? availableWidth : Math.min(cap, availableWidth)
}

function readStored(): PageWidthMode {
  try {
    if (typeof localStorage === 'undefined') return 'contained'
    return parsePageWidth(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'contained'
  }
}

function writeStored(mode: PageWidthMode): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Private windows and blocked storage: the choice still holds in memory.
  }
}

let current: PageWidthMode = readStored()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getPageWidth(): PageWidthMode {
  return current
}

export function setPageWidth(mode: PageWidthMode): void {
  if (mode === current) return
  current = mode
  writeStored(mode)
  emit()
}

export function togglePageWidth(): void {
  setPageWidth(current === 'wide' ? 'contained' : 'wide')
}

export function usePageWidth(): PageWidthMode {
  return useSyncExternalStore(subscribe, getPageWidth, () => 'contained')
}
