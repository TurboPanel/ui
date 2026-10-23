import { useSyncExternalStore } from 'react'

/**
 * Page layout, one preference for every screen. `left` keeps content in a
 * column capped at `layout.contentMaxWidth` and pinned left; `center` uses the
 * same cap with the column centred in the space beside the nav; `wide` removes
 * the cap so content fills the page. Stored per browser (localStorage); where
 * storage is missing or throws, the choice lasts for the session.
 */
export type PageWidthMode = 'left' | 'center' | 'wide'

export const PAGE_WIDTH_MODES: readonly PageWidthMode[] = ['left', 'center', 'wide']

const STORAGE_KEY = 'turbopanel.pageWidth'

export function parsePageWidth(value: string | null | undefined): PageWidthMode {
  // The old `contained` (and anything unknown) reads as `left`.
  return value === 'wide' || value === 'center' ? value : 'left'
}

/**
 * Width the content column may take. `cap` is the capped-mode maximum
 * (`layout.contentMaxWidth`); `availableWidth` is the room beside the chrome.
 */
export function contentMaxWidthFor(
  mode: PageWidthMode,
  availableWidth: number,
  cap: number
): number {
  return mode === 'wide' ? availableWidth : Math.min(cap, availableWidth)
}

/** Where the content column sits in the space beside the nav. */
export function contentAlignFor(mode: PageWidthMode): 'flex-start' | 'center' {
  return mode === 'center' ? 'center' : 'flex-start'
}

function readStored(): PageWidthMode {
  try {
    if (typeof localStorage === 'undefined') return 'left'
    return parsePageWidth(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'left'
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

export function subscribePageWidth(listener: () => void): () => void {
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

export function usePageWidth(): PageWidthMode {
  return useSyncExternalStore(subscribePageWidth, getPageWidth, () => 'left')
}
