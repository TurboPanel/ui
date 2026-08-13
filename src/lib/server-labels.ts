/** Docker engine-label charset for `node.labels.*` / `placement.constraints`. */
export const SERVER_LABEL_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
export const MAX_SERVER_LABELS = 64
export const MAX_SERVER_LABEL_KEY_LENGTH = 255
export const MAX_SERVER_LABEL_VALUE_LENGTH = 255

export type ServerLabelDraftRow = {
  id: string
  key: string
  value: string
}

export type ParseServerLabelRowsResult =
  | { ok: true; labels: Record<string, string> }
  | { ok: false; error: string }

function labelKeyError(key: string): string | null {
  if (key.length < 1 || key.length > MAX_SERVER_LABEL_KEY_LENGTH) {
    return `Label key must be 1–${String(MAX_SERVER_LABEL_KEY_LENGTH)} characters.`
  }
  if (!SERVER_LABEL_KEY_RE.test(key)) {
    return `Label key "${key}" is invalid. Use a letter or digit first, then letters, digits, dots, underscores, or hyphens.`
  }
  return null
}

/**
 * Build the replace-all labels map from editor rows. Blank key+value rows are
 * skipped; empty keys with a value, duplicates, and charset/length errors fail.
 */
export function parseServerLabelRows(
  rows: readonly ServerLabelDraftRow[],
): ParseServerLabelRowsResult {
  const labels: Record<string, string> = {}
  const seen = new Set<string>()

  for (const row of rows) {
    const key = row.key.trim()
    const value = row.value
    if (key.length === 0 && value.length === 0) continue
    if (key.length === 0) {
      return { ok: false, error: 'Label keys cannot be empty when a value is set.' }
    }
    const keyError = labelKeyError(key)
    if (keyError) return { ok: false, error: keyError }
    if (value.length > MAX_SERVER_LABEL_VALUE_LENGTH) {
      return {
        ok: false,
        error: `Label value for "${key}" exceeds ${String(MAX_SERVER_LABEL_VALUE_LENGTH)} characters.`,
      }
    }
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate label key "${key}".` }
    }
    seen.add(key)
    labels[key] = value
  }

  if (seen.size > MAX_SERVER_LABELS) {
    return {
      ok: false,
      error: `A server may have at most ${String(MAX_SERVER_LABELS)} labels.`,
    }
  }

  return { ok: true, labels }
}

export function serverLabelsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left).sort((a, b) => a.localeCompare(b))
  const rightKeys = Object.keys(right).sort((a, b) => a.localeCompare(b))
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => left[key] === right[key] && rightKeys.includes(key))
}

export function pairsToLabelRecord(
  pairs: ReadonlyArray<{ key: string; value: string }> | undefined,
): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const pair of pairs ?? []) {
    labels[pair.key] = pair.value
  }
  return labels
}

export function labelRecordSignature(labels: Record<string, string>): string {
  return Object.keys(labels)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${labels[key] ?? ''}`)
    .join('\n')
}
