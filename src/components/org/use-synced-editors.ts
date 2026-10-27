import { useCallback, useEffect, useRef, useState } from 'react'
import { sameEditorValue, syncEditors } from '@/lib/hosting-editor-sync'

/**
 * Per-row editors kept in step with the rows the server answers (see
 * `syncEditors`): each editor is filled from its row, refilled whenever a
 * newer answer arrives while it has no unsaved edits, and left alone while it
 * has some.
 *
 * `markSaved(keys)` is called once a save's refetch has landed: the saved
 * rows' current values become their baseline, so the sync refills them from
 * the answer. It reads the latest editors, never ones captured before the
 * save, which is what left an empty form after a successful save.
 */
export function useSyncedEditors<T extends object>(
  rows: readonly Readonly<{ editorKey: string; seed: T }>[],
  loading: boolean
) {
  const [editors, setEditors] = useState<Record<string, T>>({})
  const baseline = useRef<Record<string, T>>({})
  const latest = useRef(editors)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    latest.current = editors
    if (loading) return
    const next = syncEditors(editors, baseline.current, rows, sameEditorValue)
    baseline.current = next.baseline
    if (next.editors !== editors) setEditors(next.editors)
  }, [loading, rows, editors, tick])

  const markSaved = useCallback((keys: readonly string[]) => {
    for (const key of keys) {
      const saved = latest.current[key]
      if (saved) baseline.current[key] = saved
    }
    setTick((value) => value + 1)
  }, [])

  return { editors, setEditors, markSaved }
}
