/**
 * Keeps per-row editors in step with the rows the server answers, without
 * throwing away what someone is typing.
 *
 * `baseline` is the value each editor was last filled from. An editor that
 * still equals its baseline has no unsaved edits, so a newer seed replaces it;
 * an edited one is left alone. After a save, set the saved row's baseline to
 * what was saved: the next answer then fills the editor with the saved state.
 */
export type EditorSync<T> = Readonly<{
  editors: Record<string, T>
  baseline: Record<string, T>
}>

export function syncEditors<T>(
  editors: Record<string, T>,
  baseline: Readonly<Record<string, T>>,
  rows: readonly Readonly<{ editorKey: string; seed: T }>[],
  same: (a: T, b: T) => boolean
): EditorSync<T> {
  let next = editors
  const nextBaseline: Record<string, T> = { ...baseline }
  for (const row of rows) {
    const current = editors[row.editorKey]
    const was = baseline[row.editorKey]
    const clean = current === undefined || (was !== undefined && same(current, was))
    if (!clean) continue
    nextBaseline[row.editorKey] = row.seed
    if (current !== undefined && same(current, row.seed)) continue
    if (next === editors) next = { ...editors }
    next[row.editorKey] = row.seed
  }
  return { editors: next, baseline: nextBaseline }
}

/** Equality for plain editor values (strings, numbers, booleans, null). */
export function sameEditorValue<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[]
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}
