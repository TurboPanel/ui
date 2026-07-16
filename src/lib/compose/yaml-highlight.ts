export type YamlHighlightSegment = {
  text: string
  kind: 'code' | 'comment'
}

/**
 * Index of a `#` that starts a YAML comment (not inside quotes), or `-1`.
 */
export function indexOfYamlComment(line: string): number {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (ch === '#' && !inSingle && !inDouble) {
      return i
    }
  }
  return -1
}

/**
 * Split a YAML line into code vs comment segments for editor highlighting.
 * Full-line comments (optional indent, then `#`) style the whole line as comment.
 * Inline `#` comments only style from `#` to end of line. `#` inside quotes is ignored.
 */
export function splitYamlLineHighlight(line: string): YamlHighlightSegment[] {
  if (line.length === 0) {
    return [{ text: '', kind: 'code' }]
  }

  const trimmedStart = line.trimStart()
  if (trimmedStart.startsWith('#')) {
    return [{ text: line, kind: 'comment' }]
  }

  const hashIndex = indexOfYamlComment(line)
  if (hashIndex < 0) {
    return [{ text: line, kind: 'code' }]
  }

  const segments: YamlHighlightSegment[] = []
  if (hashIndex > 0) {
    segments.push({ text: line.slice(0, hashIndex), kind: 'code' })
  }
  segments.push({ text: line.slice(hashIndex), kind: 'comment' })
  return segments
}
